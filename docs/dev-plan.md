# OFFICE RELAY 分担開発プラン（コンフリクトさせない進め方）

対象: AIAU Craft Day（Supabase × Devin）最終発表プロトタイプ
方針: 「一気に作らない」「同じファイルを2人が触らない」「先に契約（型・スキーマ・URL）を凍結してから並行する」

---

## 0. 全体の考え方

コンフリクトはコミュニケーションではなく **構造** で潰す。

1. **契約ファースト**: DBスキーマ / 生成型 / Edge Function の I/O / ルーティングを Phase 0 で確定し、以降は原則変更しない。変更が必要なら Phase 0 の所有者（Aさん）だけが行い、他は待たずに済むよう追加専用（additive）にする。
2. **1機能 = 1ディレクトリ = 1人**: 画面もマイグレーションもシードも「追加専用のファイル」に分割し、共有ファイルの同時編集をなくす。
3. **小さいPRを積む**: 1PR = 1チケット = 半日以内。長生きブランチを作らない。
4. **main は常にデモ可能**: マージ後は必ず `supabase db reset` + `npm run build` が通る状態。壊れたら即 revert（直す前に revert）。

---

## 1. 役割分担（4人想定 / 2〜3人でも縮約可）

| 役割 | 担当領域 | 所有ディレクトリ（他人は触らない） |
|---|---|---|
| **A: Platform / DB** | スキーマ、RLS、マッチング関数、Realtime trigger、cron、seed基盤 | `supabase/migrations/**`, `supabase/config.toml`, `supabase/seed/00_*`, `web/src/lib/database.types.ts` |
| **B: Backend / Edge** | Edge Functions、Devin API連携、embedding、webhook、secrets | `supabase/functions/**`, `docs/adapter-contract.md` |
| **C: Frontend / Golden Path** | Auth・出品・ニーズ・マッチ・承諾・引渡・Credits | `web/src/pages/{Login,Dashboard,NewItem,NewNeed,Matches}.tsx`, `web/src/auth/**` |
| **D: Frontend / Realtime + Factory + 発表** | Realtime購読、通知UI、Connector Factory画面、ランディング、デモ台本 | `web/src/realtime/**`, `web/src/components/**`, `web/src/pages/{Landing,ConnectorFactory,AppLayout}.tsx`, `README.md`, `docs/demo-script.md` |

縮約する場合: 2人なら **A+B（バックエンド）/ C+D（フロント）**、3人なら **A / B / C+D**。

### 2名体制での確定分担

実際のメンバーは2名なので、以下に確定する（上の A/B/C/D はチケット表で使う記号として残す）。

| メンバー | 兼任する記号 | 所有ディレクトリ | 主担当 |
|---|---|---|---|
| **BE 担当** | A + B | `supabase/**`（migrations / functions / seed）、`web/src/lib/database.types.ts`、`docs/edge-function-contracts.md`、`docs/adapter-contract.md` | スキーマ・RLS・マッチング・Realtime trigger・cron・Edge Function・Devin API |
| **FE 担当** | C + D | `web/src/**`（`database.types.ts` を除く）、`README.md`、`docs/demo-script.md` | Auth・出品・ニーズ・マッチ・承諾・引渡・Realtime購読・Connector Factory画面・ランディング |

2名なので所有ディレクトリが `supabase/` と `web/` でほぼ完全に分かれる。**この境界を越える PR を出さない**限りコンフリクトはほぼ起きない。
唯一の橋渡しが `web/src/lib/database.types.ts`（BE が生成してコミット、FE は読むだけ）と
`docs/edge-function-contracts.md`（BE が更新、FE は従う）。

2名での進行順（並行2レーン）:

| ラウンド | BE 担当 | FE 担当 |
|---|---|---|
| R1 | P1-A1 RLS → P1-A2 マッチング関数 | P1-C1 Auth → P1-D1 ランディング |
| R2 | P2-A1 embedding/PostGIS → P1-B1 Edge Function 雛形 | P2-C1 出品フォーム（写真必須）→ P2-C2 ニーズ登録 |
| R3 | P3-A1 Realtime trigger → P3-A2 cron | P2-D1 ダッシュボード → P3-C1 マッチ画面 |
| R4 | P4-B1 adapter契約 → P4-B2 build-connector | P3-D1 Realtime通知 → P3-C2 承諾→引渡→Credits |
| R5 | P4-B3 webhook → P4-A3 job の Realtime → P5-A シード | P4-D2 Connector Factory 画面 → P5-D README/デモ台本 |
| R6 | 通しリハ（2ブラウザ）・fixture 調整 | 通しリハ・UIポリッシュ |

余力チケット（AI / 速度）は上の必須レーンが終わってから積む。優先順は **P2-B2 写真から前埋め > P3-B2 マッチ理由 > P5-E 速度 > P4-B4 CSV推論**。ゴールデンパスが未完のうちは着手しない。

FE は BE の完成を待たない: 未実装の RPC / Edge Function は `docs/edge-function-contracts.md` の I/O に合わせてモック（固定JSON）で先に画面を作り、BE のマージ後に差し替える。

---

## 2. 依存関係とマージ順（フェーズ）

```
Phase 0  契約凍結（全員ブロック）           ← ここだけ直列
   └─ Phase 1  A: スキーマ+RLS+マッチング   ┐
      Phase 1  B: Edge Function 雛形        ├─ 並行可
      Phase 1  C: Auth+レイアウト+一覧      │
      Phase 1  D: ランディング+デザイン系    ┘
         └─ Phase 2  C: 出品/ニーズ登録, A: matching精度, B: embedding
               └─ Phase 3  D: Realtime通知, C: 承諾→引渡→Credits
                     └─ Phase 4  B+D: Connector Factory（Devin）
                           └─ Phase 5  シード拡充・デモリハ・UIポリッシュ
```

**マージ順の鉄則**: 下位（DB）→ 上位（UI）。DB PR が main に入ってから、それに依存する UI PR を出す。

---

## 3. チケット一覧

「触るファイル」が他チケットと重ならないように切ってある。各チケット = 1 PR。

### Phase 0 — 契約凍結（担当: A、所要: 1セッション、他は着手不可）

| ID | 内容 | 完了条件 |
|---|---|---|
| P0-1 | `supabase/config.toml`、拡張（vector/postgis/pg_cron/pg_net）、core schema（organizations / org_members / items / item_media / needs / service_offers / service_wants / matches / transfers / relay_credit_events / partner_leads / integration_sources / devin_jobs） | `supabase db reset` が通る |
| P0-2 | `supabase gen types typescript --local` を `web/src/lib/database.types.ts` にコミット。以後この型が唯一の真実 | フロントが型補完で全テーブルを引ける |
| P0-3 | Edge Function の I/O 契約を README に記載（`build-connector` / `recompute-matches` / `generate-embeddings` / `devin-webhook` のリクエスト・レスポンスJSON） | B と D が実装前に合意 |
| P0-4 | ルーティング表を確定（`/`, `/login`, `/app`, `/app/items/new`, `/app/needs/new`, `/app/matches`, `/app/connector-factory`）と `main.tsx` の骨組みを先にマージ | C と D が別ファイルで作業開始できる |

> Phase 0 が終わるまで他の3人は環境構築（`supabase start`、`npm i`、デモアカウントでログイン確認）に専念する。

### Phase 1 — 基礎（並行4本）

| ID | 担当 | 内容 | 触るファイル | 完了条件 |
|---|---|---|---|---|
| P1-A1 | A | RLS 全テーブル有効化 + `is_org_member` / `my_org_ids` + 住所分離（`org_locations` は承諾後のみ） | `migrations/*_rls.sql` | 匿名/他組織で SELECT できないことを SQL で確認 |
| P1-A2 | A | マッチング関数（`score_pair` / `recompute_matches` / `accept_match` / `complete_transfer`）と重み 0.35/0.20/0.20/0.15/0.10。AssetFit/ServiceFit は `<=>`（§3.5） | `migrations/*_matching.sql` | psql で 0〜1 のスコアが返る |
| P1-B1 | B | Edge Function 雛形 + 共通 CORS + `recompute-matches` | `functions/_shared/`, `functions/recompute-matches/` | `supabase functions serve` で 200 |
| P1-C1 | C | Auth（メールリンク + デモアカウント即ログイン）、`AuthProvider`、`AppLayout` | `src/auth/`, `src/pages/Login.tsx` | 2ロールでログイン切替できる |
| P1-D1 | D | ランディング（価値提案 + NSM + スコア式）と Tailwind テーマ | `src/pages/Landing.tsx`, `tailwind.config.js`, `index.css` | 1画面で課題と解決が伝わる |

### Phase 2 — 登録とマッチ生成

| ID | 担当 | 内容 | 完了条件 |
|---|---|---|---|
| P2-A1 | A | pgvector embedding（trigger + queue + 384次元）と PostGIS GeoFit。設計は **§3.5 pgvector 設計** に従う | items/needs 追加でジョブが積まれる。service 系2テーブルにも HNSW がある |
| P2-B1 | B | `generate-embeddings`（OpenAI `text-embedding-3-small` dimensions=384、無ければ DB フォールバック / §3.5） | キューが枯れて embedding が埋まる |
| P2-C1 | C | 出品フォーム（**写真必須** → Storage `{org_id}/{item_id}/`）+ 欲しいサービス登録 | 画像が Storage に入り一覧に表示される |
| P2-C2 | C | ニーズ登録フォーム + 提供サービス登録 | 登録後に match が生成される |
| P2-D1 | D | ダッシュボード（在庫 / ニーズ / Credits / 上位マッチ） | 両ロールで数字が出る |

### Phase 3 — Realtime と承諾フロー（ここがデモの山）

| ID | 担当 | 内容 | 完了条件 |
|---|---|---|---|
| P3-A1 | A | match 生成・承諾時の trigger → `realtime.broadcast_changes()`、private channel `org:{org_id}:matches` の authorization | Studio の Realtime Inspector でイベントが見える |
| P3-D1 | D | フロントの private channel 購読 + 「94% MATCH」オーバーレイ | 2ブラウザ並列で同時に出る |
| P3-C1 | C | マッチ画面（スコア内訳バー、承諾前は最寄駅+概算距離のみ） | 住所が隠れていることを画面で示せる |
| P3-C2 | C | 承諾 → `accept_match` → transfer 作成 → 住所開示 → `complete_transfer` → Relay Credits 加算 | Credits の増加が画面で確認できる |
| P3-A2 | A | pg_cron で `pickup_deadline` 超過を `expired` に | 期限切れ item が自動で落ちる |

### Phase 4 — Devin Connector Factory（スポンサー賞本命）

| ID | 担当 | 内容 | 完了条件 |
|---|---|---|---|
| P4-B1 | B | `docs/adapter-contract.md`（`NormalizedSupplyItem`、title/quantity/location/pickup_deadline 欠損は拒否） | 契約が読んで分かる |
| P4-B2 | B | `build-connector`：source取得 → spec組立 → Devin API セッション作成 → `devin_jobs` 保存 → polling | ローカルで job が queued→running になる |
| P4-B3 | B | `devin-webhook` で status / PR URL を反映（secret 検証あり） | webhook 送信で job が更新される |
| P4-A3 | A | `devin_jobs` の Realtime trigger（channel `connector-factory`） | 更新が即ブラウザに届く |
| P4-D2 | D | Connector Factory 画面（CSV登録 / BUILD WITH DEVIN / ステップタイムライン / セッションURL・PRリンク） | ボタン一発で進捗が流れる |

> **鍵の扱い**: `DEVIN_API_KEY` と `service_role` は Edge Function の secret のみ。B が `supabase secrets set` を担当し、フロントには絶対に渡さない。キー未設定でも画面が壊れないよう **simulation mode** を必ず残す（会場のネットワーク対策）。

### Phase 5 — 仕上げ

| ID | 担当 | 内容 |
|---|---|---|
| P5-A | A | シード 15〜30件（NEXTMOVE / AI Seed / その他donor）とスコア fixture（94%: Asset97 / Service91 / Geo93 / Urgency95 / Trust80） |
| P5-D | D | README（各Supabase機能をどこで・なぜ使ったか）、`docs/demo-script.md`、法務表現の統一 |
| P5-C | C | 空状態・エラー表示・ローディングのポリッシュ |
| P5-B | B | 事前に成功済みの Devin PR を確保（当日はセッション開始までをライブ表示） |

---

### 追加チケット（AI / パフォーマンス。§3.6 / §3.7 参照）

| ID | 担当 | 内容 | 完了条件 |
|---|---|---|---|
| P2-B2 | BE | `extract-item` Edge Function：出品写真1枚から品名・カテゴリ・数量・状態の候補を LLM で抽出し、フォームに前埋めする | 写真を選んだ直後にフォームが埋まる。失敗しても手入力で完了できる |
| P3-B2 | BE | `explain-match`：マッチ理由の1〜2文を生成し `matches.reason` にキャッシュ（生成は非同期、画面は待たない）。`reason` 列は追加マイグレーションで足す（既存ファイルは編集しない） | マッチ画面に理由が出る。未生成時はスコア内訳のみ表示 |
| P4-B4 | BE | Connector Factory の CSV スキーマ推論（LLM）→ Devin へ渡す adapter spec を自動組立 | CSV を貼ると列マッピング案が出て、そのまま BUILD できる |
| P5-E | FE+BE | パフォーマンス予算の計測と達成（§3.7） | 主要3画面が予算内。計測値を PR に貼る |

> AI 機能はすべて **無くてもゴールデンパスが完走する** 位置づけ（degrade する追加価値）。デモ当日にキーが死んでもフローは止めない。

---

## 3.5 pgvector 設計（審査で最も見られる部分なので先に固める）

「拡張を有効化しただけ」では評価されない。**embedding をどう作り、どこでベクトル演算を実際に使い、それがスコアにどう効くか**を SQL で見せられる状態をゴールにする。
Phase 0 で入っているのは器（`create extension vector` / 各テーブルの `embedding vector(384)` / `items`・`needs` の HNSW cosine インデックス）だけで、中身は下の3チケットで実装する。

### 設計（この通りに実装する）

| 項目 | 決定 |
|---|---|
| 次元 | **384 に固定**（OpenAI `text-embedding-3-small` を `dimensions=384` で使用）。列定義済みなので後から変えない |
| 対象テーブル | `items` / `needs` / `service_offers` / `service_wants` の4つ。**物品だけでなくサービスもベクトル化する**のが本プロダクトの独自性（ServiceFit） |
| 生成方式 | **trigger → キュー → Edge Function の非同期**。`insert/update` で `relay.embedding_jobs` に積み、`generate-embeddings` が消化する。同期呼び出しにしない（登録UIをブロックしない） |
| 生成元テキスト | 品名 + 説明 + カテゴリ + 状態 を連結して正規化した1本の文字列。連結ルールは SQL 関数に閉じ込め、items と needs で同じ関数を使う（同じ空間に埋める） |
| 距離 | **cosine**。スコアは `1 - (a <=> b)` を 0〜1 にクランプ |
| インデックス | `hnsw (embedding vector_cosine_ops)`。**`service_offers` / `service_wants` にも作る**（Phase 0 では未作成。P2-A1 で追加すること） |
| フォールバック | `OPENAI_API_KEY` が無い / 失敗時は DB 内の決定的ハッシュ埋め込みで埋め、レスポンスで `provider: "fallback"` を返す |

### スコアへの効き方

```
Score = 0.35·AssetFit + 0.20·ServiceFit + 0.20·GeoFit + 0.15·UrgencyFit + 0.10·TrustFit
                ↑ pgvector          ↑ pgvector      ↑ PostGIS   ↑ Postgres    ↑ Postgres
```

- **AssetFit** = `needs.embedding <=> items.embedding` のコサイン類似
- **ServiceFit** = 譲渡側の `service_wants.embedding` × 受取側の `service_offers.embedding` の最良ペア
- ベクトル演算は**必ず DB 側（SQL 関数）で行う**。アプリ側で類似度を計算しない（インデックスが効かないうえ、審査で「Postgres を使っている」と言えなくなる）

### 発表での見せ方 / 想定質問への備え

- 「なぜ pgvector が必要か」は **具体例で答える**: 出品は「エグゼクティブデスク W1600」、ニーズは「オフィス机」。文字列一致では 0 点、ベクトルなら高スコア。この1例をデモ中に口頭で出す
- Studio の SQL Editor に `select 1 - (a.embedding <=> b.embedding) ...` を貼ったタブを開いておき、聞かれたら即見せる（"fixture で出しているだけでは" への回答になる）
- `explain analyze` で HNSW インデックスが使われることを1度確認しておく
- **正直に言う線引き**: ライブは OpenAI embedding。ネットワーク断のときだけ決定的ハッシュのフォールバックに落ちる（これは意味類似ではない、と明言する）。ここを曖昧にすると突かれる
- README の機能表に「pgvector をどこで・なぜ」を必ず1行で書く（P5-D）

### 該当チケット

- **#8 (P2-A1)** — embedding 列 / キュー / trigger / HNSW（service 系2テーブル含む）/ 生成元テキスト関数
- **#9 (P2-B1)** — `generate-embeddings` Edge Function（OpenAI + フォールバック）
- **#4 (P1-A2)** — `score_pair` 内で `<=>` を使った AssetFit / ServiceFit

---

## 3.6 プロダクト内 AI の使いどころ（何を入れて、何を入れないか）

判断基準は1つ: **ユーザーの入力を減らすか、判断を速くするか**。それ以外の「AIっぽい機能」は入れない（審査では逆効果）。

| # | 機能 | 何が良くなるか | 実装 | フォールバック |
|---|---|---|---|---|
| 1 | **embedding マッチ**（実装済み計画 / §3.5） | 表記ゆれを越えて物とサービスが繋がる | pgvector + `generate-embeddings` | 決定的ハッシュ埋め込み |
| 2 | **写真1枚から出品を前埋め**（P2-B2） | donor の登録が「写真を撮る」だけになる。撤去期限直前の企業に入力させないことが Rescue 数に直結する | Vision LLM → JSON（品名 / カテゴリ / 数量 / 状態）を Edge Function で返す | 手入力（フォームは常に編集可能） |
| 3 | **マッチ理由の言語化**（P3-B2） | 「なぜ94%か」が一目で分かり、承諾の判断が速くなる | スコア内訳 + 双方のテキストを LLM に渡して1〜2文。結果は `matches.reason` に**キャッシュ**（毎回生成しない） | スコア内訳バーのみ表示 |
| 4 | **CSV スキーマ推論**（P4-B4） | Connector Factory で人間が列マッピングを書かなくて済む。Devin に渡す spec の質が上がる | ヘッダ+数行を LLM に渡して `NormalizedSupplyItem` への写像案を JSON で得る | 手動マッピングUI |

**入れないもの**: チャットボット / 自動交渉 / 価格査定 / 自動承諾。責任の所在が曖昧になり、法務表現（プラットフォームは所有権を持たず仲介するだけ）とも矛盾する。

**共通ルール**
- LLM 呼び出しは **必ず Edge Function 経由**。キーはクライアントに出さない（`OPENAI_API_KEY` は secret）
- ユーザーを待たせる同期呼び出しは **写真抽出だけ**（体感2秒以内、スケルトン表示）。残りは全部キュー＋Realtime で後追い
- 生成結果は必ず DB に保存して再利用する。同じ入力で二度呼ばない
- 出力は JSON スキーマを固定し、パース失敗時は **黙って何もしない**（画面を壊さない）

### Devin API の使いどころ（Connector Factory 以外）

「動くプロダクトの中で Devin が仕事をしている」形にできるものだけ採用する。

- **採用**: 新供給元の adapter 実装 PR（P4-B2、既存）。加えて **P4-B4** で spec 生成を賢くする
- **採用（運用デモとして強い）**: adapter の実行時エラーが一定回数出たら `devin_jobs` に修復タスクを起票 → Devin セッションで修正 PR。「壊れた連携を自分で直す仕組み」として1枚のスライドで説明できる（実装は余力があれば。無ければ設計の説明のみ）
- **不採用**: ユーザー操作のたびに Devin を呼ぶ（遅い・不安定・課金が読めない）

---

## 3.7 パフォーマンス方針（体感速度が採点の「完成度」に直結する）

### 予算（これを満たせば十分）

| 画面 | 目標 |
|---|---|
| ランディング初回表示 | LCP 1.5s 以内（ローカル） |
| ログイン後ダッシュボード | データ込み 800ms 以内 |
| マッチ一覧 | 500ms 以内 |
| Realtime 通知の到達 | trigger から 1s 以内 |
| 写真アップロード後の一覧反映 | 楽観的更新で **即時** |

### データ取得

- **スコアは事前計算**。画面表示時に計算しない。`matches` テーブルを読むだけにする（trigger で更新済み）
- ダッシュボードは **1 RPC で集計済みの1行を返す**（在庫数 / ニーズ数 / Credits / 上位マッチ）。テーブルごとに 4 回 select しない（N+1 とラウンドトリップの排除）
- `select('*')` を禁止。必要な列だけ。一覧は `limit` を必ず付ける
- 一覧 → 詳細は **すでに持っているデータを渡して即描画**し、詳細の差分だけ後から取得する
- 検索やフィルタは DB 側（インデックス）。フロントで全件フィルタしない

### 体感

- 送信系（出品・承諾）は **楽観的更新**。サーバ確定は Realtime で上書きする
- 待ち時間はスピナーではなく **スケルトン**（レイアウトが飛ばない）
- Realtime は接続を1本に集約（`org:{org_id}:matches` と `connector-factory`）。画面ごとに張り直さない
- ログイン直後にダッシュボードのクエリを**先読み**する

### 画像（一番重い）

- アップロード前にブラウザ側で長辺 1600px / JPEG に縮小してから Storage へ（回線が細い会場対策）
- 一覧はサムネイル。`loading="lazy"` + `width`/`height` 明示で CLS を出さない
- 公開 URL はキャッシュ可能な形で使い、署名 URL を毎回発行しない
- ※ ローカル Supabase では画像変換が使えないため、**縮小はクライアント側で行う**のが確実

### バンドル

- ルート単位の `lazy` 分割（ランディングに Connector Factory のコードを載せない）
- 重いライブラリを足さない。チャート等は CSS で作る
- `npm run build` の出力サイズを PR に貼る。**gzip 150KB を超えたら原因を潰す**

---

## 4. コンフリクト危険地帯と回避ルール

| 危険地帯 | 何が起きるか | ルール |
|---|---|---|
| `supabase/migrations/` | 同じタイムスタンプ、順序逆転 | **1人1マイグレーション**。ファイル名は `YYYYMMDDHHMM_<担当イニシャル>_<内容>.sql`。既存ファイルは絶対に編集せず必ず新規追加（`alter table` で足す）。main に入った migration の書き換え禁止 |
| `supabase/seed.sql` | 全員が末尾に追記して毎回衝突 | `config.toml` の `[db.seed] sql_paths` で `supabase/seed/*.sql` に分割。`00_orgs.sql` / `10_items.sql` / `20_needs.sql` / `30_services.sql` / `40_fixtures.sql` / `50_integration.sql` と番号で所有者を分ける |
| `web/src/lib/database.types.ts` | 自動生成物の衝突 | 生成は **A のみ**。他は絶対に手で直さない。衝突したら `--theirs` ではなく再生成 |
| `web/src/main.tsx`（ルーター） | 全員がルート追加 | Phase 0 で全ルートを空コンポーネントで先に登録しておく。以後この行は増えない |
| `web/src/index.css` / `tailwind.config.js` | ユーティリティ追加合戦 | D が所有。他は Tailwind のクラスを直書きし、共通クラスが欲しければ D に依頼 |
| `web/package.json` | 依存追加のロック衝突 | 依存追加は原則 Phase 0 で済ませる。追加が必要なら Slack で宣言 → 1人ずつ → 即マージ。`package-lock.json` の衝突は「main を取り込んで `npm install` し直す」で解決（手動マージ禁止） |
| `README.md` | 全員が加筆 | D が唯一の編集者。各自は自分の章を `docs/notes/<name>.md` に書いて D が統合 |
| Supabase ローカル環境 | 各自の `db reset` で他人のデータが消える | ローカルは各自のマシンで完結（共有プロジェクトを使わない）。共有 Supabase を使う場合は **デモ用1本 + 各自ローカル**、デモ用への書き込みは A のみ |

---

## 5. ブランチ / PR 運用

- ブランチ名: `feat/p2-c1-item-form`（`<phase>-<担当>-<内容>`）
- PR は **300行以内** を目安。超えたらチケットを割る
- PR テンプレに以下を必須化:
  - 触ったファイル（他人の所有領域に入っていないか）
  - `supabase db reset` / `npm run build` / `npm run lint` の結果
  - デモ動線への影響
- レビューは1人承認で即マージ（速度優先）。**ただし DB とセキュリティ（RLS・secrets）の PR は A または B が必ず見る**
- 毎日: 朝10分の同期（今日どのファイルを触るか宣言）、夕方に main の `db reset` + ビルド確認
- 発表前日夜に **フィーチャーフリーズ**。以降は文言・見た目・シードのみ

---

## 6. 詰まらないための安全策（デモ当日）

1. **fixture スコア**: 94% はスコア fixture として固定表示できるようにしておく（計算は本物、表示は保証）
2. **simulation mode**: Devin API が落ちても Connector Factory の進捗が流れる
3. **成功済み PR**: 当日はセッション「開始」までをライブ、完了済み PR は別タブで提示
4. **オフライン**: ローカル Supabase + ローカル Vite で完結させる（会場Wi-Fi非依存）。embedding も DB フォールバックで動く
5. **リハ**: 2ブラウザ（donor / startup）を並べた通し練習を最低3回。所要4分に収める

---

## 7. 見積り（1セッション ≒ 半日相当の集中作業）

| Phase | 内容 | 目安 |
|---|---|---|
| 0 | 契約凍結 | 1セッション（A） |
| 1 | 基礎4本 | 各1セッション（並行） |
| 2 | 登録とマッチ | 各1〜1.5セッション |
| 3 | Realtime + 承諾 | 各1〜1.5セッション |
| 4 | Connector Factory | B 2セッション / D 1セッション |
| 5 | 仕上げ・リハ | 全員で1セッション |

直列の最長経路は **Phase 0 → 1 → 2 → 3 → 4 → 5 = 約6〜7セッション**。4人並行なら実時間はこの長さで収まる。

---

## 8. 完了の定義（Definition of Done）

- [ ] donor / startup を切り替えて 登録 → 双方向マッチ → Realtime通知 → 承諾 → 引渡完了 → Relay Credits まで通る
- [ ] 写真が Supabase Storage に実際に保存され表示される
- [ ] マッチが pgvector + PostGIS を使っている（SQLで説明できる）
- [ ] 承諾後のみ RLS で正確な住所が開示される
- [ ] BUILD WITH DEVIN で Edge Function 経由の Devin セッションが作成され、進捗が Realtime で流れる
- [ ] DB 変更は全て migration、デモデータは全て seed としてコミット済み
- [ ] README に各 Supabase / Devin 機能の使用箇所と理由が書かれている
- [ ] `supabase db reset` → `npm run dev` の手順だけで誰のマシンでも起動する
