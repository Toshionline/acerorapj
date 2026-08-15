# 進捗メモ (2026-08-15 時点)

要件定義書 (`docs/00_product_requirements.md`) の受け入れ基準に対する現状と、次にやることの記録。

## 1. 実装済み（main）

| 領域 | 状態 | 備考 |
|---|---|---|
| Auth / Organization | 完了 | メールリンク + デモアカウント (donor: NEXTMOVE / startup: AI Seed) |
| Item 登録・写真 upload | 完了 | Storage `item-media`、パス `{organization_id}/{item_id}/{filename}` |
| Need / Service Want・Offer 登録 | 完了 | |
| マッチング (`score_pair` / `recompute_matches`) | 完了 | 5要素式。ハードコードなし |
| Match 一覧・内訳表示 | 完了 | `ScoreBreakdown` で AssetFit / ServiceFit / GeoFit / UrgencyFit / TrustFit |
| 双方 Accept → Transfer 生成 → 引渡完了 | 完了 | `accept_match` / `complete_transfer` |
| Relay Credits | 完了 | `relay_credit_events` 台帳。譲る +100 / 引取 +30 / サービス +80 |
| RLS（組織境界・住所開示） | 完了 | 正確な住所は `org_locations`、承諾後のみ SELECT 可 |
| Realtime 通知 | 完了 | |
| Dashboard | 完了 | 実データ集計のみ |
| Devin Connector Factory | 完了 (simulation mode) | `DEVIN_API_KEY` 未設定でも動作 |
| 資産一覧・詳細（一覧 thumbnail / 詳細 gallery） | 完了 | PR #45 |
| seed 写真の Storage 投入・画像欠損時の placeholder・375px ナビ | 完了 | PR #51 |

## 2. 実ブラウザで確認済み

ローカル Supabase + Vite で、実際に操作して確認した内容。

- ゴールデンパス通し: donor 余剰品登録（写真つき）→ startup Need 登録 → マッチ生成 → startup Accept → donor Accept → Transfer 生成 → 引渡完了 → Relay Credits 加算（320 → 420）。
  - 実スコア 62%（AssetFit 50 / ServiceFit 33 / GeoFit 100 / UrgencyFit 76 / TrustFit 62）。
  - Item が `transferred`、Need が `fulfilled` に遷移。
- 承諾前は正確な住所が出ず、双方承諾後にのみ開示される。
- 資産一覧: 撤去期限の昇順、カテゴリ / キーワード / 「掲載中のみ」の絞り込み、詳細への遷移。
- 詳細: gallery のサムネイル切り替え、写真なし item の placeholder。
- `item_media` の行はあるが Storage にファイルが無い場合も、壊れた画像ではなく placeholder に縮退。
- レスポンシブ: 1440px は従来レイアウト、375px はヘッダーが縦に伸びず nav が横スクロール、本文の水平スクロールなし。

## 3. 未着手 / 残タスク

- `docs/02_database.md`: `docs/00_product_requirements.md` から参照しているが未作成。テーブル定義・RLS ポリシー・関数の一覧をまとめる。
- pgvector / PostGIS の実利用（受け入れ基準 22・23）。現状は fallback（カテゴリ一致・`area_label` 一致）で動作。
- Devin Connector Factory の live 化（受け入れ基準 24・25）。`DEVIN_API_KEY` 取得後に実 API 疎通と PR URL の確認。
- pg_cron による期限切れ資産の `expired` 化の実挙動確認。

## 4. ローカル起動手順の注意

`supabase db reset` は `item_media` の行を入れるが、SQL からは Storage にファイルを置けない。reset のあとに以下を実行すると seed の写真が揃う。

```bash
supabase db reset
supabase/seed/upload_fixtures.sh
```

`web/.env.local` は `supabase status` の API URL と `ANON_KEY` から作成する（未作成だと起動時にクラッシュする）。
