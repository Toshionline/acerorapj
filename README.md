# OFFICE RELAY

**捨てる予定だった会社の資産を、次の会社の創業資産へ。**

オフィスの移転・縮小・退去で撤去期限が迫った企業資産（デスク・椅子・モニタ）を、
廃棄が決まる前に創業直後のスタートアップへ直接リレーする B2B 循環プラットフォーム。

- 最上位 KPI（NSM）は掲載件数ではなく **Rescue before deadline** = 撤去期限までに再利用先を確定した資産数
- 物品だけでなく「譲渡企業が欲しいサービス」×「スタートアップが提供できるサービス」も同時にマッチングする
- OFFICE RELAY は **まだ使用可能で譲渡意思のある企業資産を、廃棄決定前に次の利用者へ移転する** ことを仲介する。プラットフォーム自身は資産の所有権を取得しない

> Phase 0〜4（スキーマ / RLS / マッチング / embedding / Realtime / cron / Edge Functions / Connector Factory / フロント全画面）が main に入った状態。
> 進め方は [`docs/dev-plan.md`](docs/dev-plan.md)、発表当日の操作順は [`docs/demo-script.md`](docs/demo-script.md) を参照。

---

## セットアップ

前提: Docker, Node.js 20.19+ (or 22.12+), [Supabase CLI](https://supabase.com/docs/guides/local-development)

```bash
# 1. Supabase ローカルスタック
supabase start
supabase db reset          # マイグレーション適用 + supabase/seed/*.sql の投入
supabase/seed/upload_fixtures.sh  # seed の item_media に対応する写真を Storage へ投入

# 2. フロントエンド
cd web
cp .env.example .env.local # supabase status の API URL と ANON_KEY を記入
npm install
npm run dev                # http://localhost:5173
```

よく使うコマンド:

| コマンド | 用途 |
|---|---|
| `supabase status` | URL と各キーの確認（`ANON_KEY` は `.env.local` へ） |
| `supabase db reset` | マイグレーション再適用 + シード再投入 |
| `supabase/seed/upload_fixtures.sh` | `supabase/seed/fixtures/*.jpg` を `item-media` バケットへ投入（SQL では Storage にファイルを置けないため、reset のたびに実行） |
| `supabase gen types typescript --local --schema public > web/src/lib/database.types.ts` | DB 型の再生成（**担当 A のみ**） |
| `supabase functions serve` | Edge Function をローカル実行 |
| `npm run build` / `npm run lint` | 型チェック + ビルド / lint |

Studio は http://127.0.0.1:54323 、メール（マジックリンク）は Mailpit http://127.0.0.1:54324 に届く。

---

## 本番デプロイ

上のセットアップはローカルスタック（Docker）向け。公開する場合はフロントを **Cloudflare Pages**、
DB / Auth / Storage / Realtime / cron / Edge Functions を **Supabase Cloud** に置く。
全手順は [`docs/deployment.md`](docs/deployment.md)。要点だけ:

```bash
# バックエンド (Supabase Cloud)
supabase login && supabase link --project-ref <project-ref>
supabase db push                       # migrations を本番へ (item-media バケットもここで作られる)
supabase functions deploy              # 6 つの Edge Function を一括 (verify_jwt は config.toml のまま反映)
supabase secrets set DEVIN_API_KEY=... OPENAI_API_KEY=... DEVIN_WEBHOOK_SECRET=...

# フロント (Cloudflare Pages) — Root directory `web` / build `npm install && npm run build` / output `dist`
```

- Pages のビルド環境変数は `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（任意 `VITE_DEMO_PASSWORD`）だけ。
  `VITE_*` はバンドルに埋め込まれるので公開値のみ（`VITE_DEMO_PASSWORD` は推測困難な値にする）
- `service_role` キー / `DEVIN_API_KEY` / `OPENAI_API_KEY` / `DEVIN_WEBHOOK_SECRET` は
  Supabase の Edge Function secret のみ。クライアントにも Pages にも置かない
- SPA の直リンク・リロード用に `web/public/_redirects`（`/* /index.html 200`）を配信する
- `supabase/config.toml` の `[auth] site_url` / `additional_redirect_urls` はローカル用。
  本番のマジックリンク先は Dashboard の Site URL / Redirect URLs を Pages のドメインに設定する
- `main` への push で `.github/workflows/deploy.yml` が `web/` を lint + ビルドして Pages に配信する
  （Pages プロジェクト名と出力先は `web/wrangler.toml`）

---

## Supabase の使いどころ（なぜその機能なのか）

| 機能 | 使う場所 | 理由 |
|---|---|---|
| **Auth** | ログイン（メールリンク）、`org_members` で donor / startup / logistics / partner を判別 | 企業アカウントを人に紐づけ、RLS の判定材料にする |
| **Postgres** | `organizations` / `items` / `needs` / `matches` / `transfers` ほか | 撤去期限・数量・取引状態など、整合性が要る中核データ |
| **pgvector** | `items` / `needs` / `service_offers` / `service_wants` の `embedding` | 「executive デスク」と「オフィス机 W1200」を同じ物として扱う AssetFit / ServiceFit の意味マッチ |
| **PostGIS** | `organizations` / `items` / `needs` の `geography(point,4326)` | 撤去期限に間に合うかは距離が支配的。GeoFit を DB 側で計算 |
| **Storage** | 出品写真（バケット `item-media`、パス `{org_id}/{item_id}/...`） | 状態写真がないと譲渡判断ができない。パス先頭を org_id にして RLS で自組織のみ upload 可 |
| **RLS** | 全公開テーブル。特に `org_locations` | 承諾前は最寄駅と概算距離のみ、承諾後（`matches.status = 'accepted'`）に正確な住所を開示する |
| **Realtime** | private channel `org:{org_id}:matches` / `connector-factory` | 高スコアマッチ発生を双方のブラウザに即時通知する（デモの核） |
| **Edge Functions** | embedding 生成 / マッチ再計算 / Devin API 呼び出し / webhook | 外部 API キーをクライアントに出さずにサーバ側で扱う |
| **pg_cron** | `pickup_deadline` 超過で `status = 'expired'` | 期限切れ資産を自動で候補から外す（NSM の定義を守る） |

スコア式:

```
Score = 0.35·AssetFit + 0.20·ServiceFit + 0.20·GeoFit + 0.15·UrgencyFit + 0.10·TrustFit
```

---

## Devin の使いどころ — Connector Factory

新しい供給元（オフィス移転業者・什器商社）が増えるたびに人間が連携コードを書くのではなく、
**管理画面から CSV 仕様を登録 → Edge Function が Devin API のセッションを作成 → adapter 実装の PR が出る** 形にする。

- テーブル: `integration_sources`, `devin_jobs`
- Edge Function: `POST /functions/v1/build-connector`（I/O は [`docs/edge-function-contracts.md`](docs/edge-function-contracts.md)）
- 進捗は `devin_jobs` の更新 → Realtime channel `connector-factory` → 管理画面のタイムライン
- adapter の契約（`NormalizedSupplyItem`、`title` / `quantity` / `location` / `pickup_deadline` 欠損は拒否）は `docs/adapter-contract.md`（P4-B1 で追加）
- **`DEVIN_API_KEY` と `service_role` キーは Edge Function の secret のみ。クライアントには置かない**

---

## Relay Credits

換金性のない **貢献 / Trust スコア**。譲る +100 / 予定通り引取完了 +30 / サービス提供完了 +80 / 高評価 +20 / キャンセル -50。
用途はマッチ優先順位・Trust Score・バッジ・優先通知。「AI研修3万円分」等の価値交換は当事者間の合意として画面に表示し、
プラットフォーム内スコアとは分離する。

---

## スコープ外（実装しない）

人材紹介 / 自社買取再販 / 広告配信 / 決済 / 独自配送 / 完全チャット / 本番スクレイピング。
家電リサイクル法対象品目（冷蔵庫・空調等）は「対応予定」表示のみ。

---

## リポジトリ構成

```
docs/
  dev-plan.md                 チーム分担と開発プロセス
  deployment.md               Cloudflare Pages + Supabase Cloud への本番デプロイ手順
  edge-function-contracts.md  Edge Function / Realtime の I/O 契約（Phase 0 で凍結）
  adapter-contract.md         外部供給元の NormalizedSupplyItem 契約
  demo-script.md              発表 4 分のデモ台本（2ブラウザ）
supabase/
  config.toml
  migrations/                 1人1ファイル。既存ファイルは編集しない
  seed/                       番号ごとに所有者を分けたシード
  functions/_shared/          全 Edge Function 共通のヘルパー
web/
  wrangler.toml               Cloudflare Pages のプロジェクト名 / 出力先
  public/_redirects           SPA フォールバック (/* -> /index.html 200)
  src/main.tsx                ルーティング（Phase 0 で凍結）
  src/lib/database.types.ts   DB からの生成型（担当 A のみが再生成）
  src/pages/                  1ページ1担当
```
