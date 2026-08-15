# デプロイ手順 — Cloudflare Pages（フロント）＋ Supabase Cloud（バックエンド）

`web/` は Vite + React 19 の静的 SPA でサーバ処理を持たない（DB / 認証 / Storage / Edge Function は
すべて Supabase 側）。したがってフロントは CDN 配信で十分で、Cloudflare Pages を使う。

秘匿キーの置き場所は 1 か所だけ:

| キー | 置く場所 | 置いてはいけない場所 |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_DEMO_PASSWORD` | Cloudflare Pages のビルド環境変数（= バンドルに埋め込まれる公開値） | — |
| `SUPABASE_SERVICE_ROLE_KEY` / `DEVIN_API_KEY` / `OPENAI_API_KEY` / `DEVIN_WEBHOOK_SECRET` | Supabase の Edge Function secret（`supabase secrets set`） | Cloudflare Pages の環境変数、`web/` 以下のコード、GitHub Actions の build step |

`VITE_*` はビルド時にバンドルへ埋め込まれるため、**すべて公開値として扱う**。anon key は RLS 前提で
公開して良いが、`VITE_DEMO_PASSWORD` は「誰でもデモ組織にログインできる値」になるので推測困難な
値にし、seed 済み `auth.users` のパスワードも同じ値へ差し替える（下記 3-4）。

---

## 1. Supabase Cloud プロジェクトを作る

1. https://supabase.com/dashboard で新規プロジェクト作成。リージョンはデモ視聴者に近い
   `Northeast Asia (Tokyo)` を推奨。
2. Postgres のメジャーバージョンは `supabase/config.toml` の `major_version = 17` に合わせる
   （食い違うと `supabase db push` が拒否される）。
3. Project Settings > General の **Reference ID**（`<project-ref>`）と、
   Project Settings > API の **Project URL** / **anon public key** / **service_role key** を控える。

拡張の有効化: `supabase/migrations/202608150001_a_extensions.sql` が
`pgcrypto` / `vector` / `postgis` / `pg_cron` / `pg_net` を `create extension if not exists` で作る。
Supabase Cloud はいずれも利用可能なので通常はマイグレーションだけで完結するが、
組織プランで `pg_cron` / `pg_net` が無効な場合は Dashboard > Database > Extensions で先に有効化する。

## 2. マイグレーションとシードの適用

```bash
supabase login
supabase link --project-ref <project-ref>   # supabase/.temp に紐付けが保存される
supabase db push                            # supabase/migrations/*.sql を順に適用
```

`db push` は `supabase/seed/*.sql` を流さない（seed が走るのはローカルの `supabase db reset` のみ）。
デモ用データを入れる場合は明示的に投入する:

```bash
# Dashboard > Project Settings > Database > Connection string
# (session pooler ではなく direct connection、?sslmode=require 付き)
export DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'

# ファイル名の番号順に依存関係があるので、この順で流す
for f in supabase/seed/*.sql; do psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

`psql` はホスト側のものを使う（ローカル手順の `docker exec ... psql` はクラウドでは使えない）。

方針:

- **デモ / ステージング環境**: 全 seed を投入する。`00_orgs.sql` がデモ用 `auth.users` を作るため、
  投入後に必ずパスワードを差し替える（4 節）。
- **本番相当の環境**: seed は投入しない。`00_orgs.sql` は固定 UUID のデモ組織とデモユーザーを作る
  ものなので、実データと混ぜない。

Storage の写真: `item-media` バケットとその RLS ポリシーは
`supabase/migrations/202608150004_c_item_media_bucket.sql` で作られるので、`db push` だけで
バケットまで用意される（Dashboard での手動作成は不要）。seed の `item_media` 行に対応する画像
ファイルは SQL では入らないため、seed を投入した環境では別途アップロードする:

```bash
# 3 変数すべてを渡す (URL / key の片方だけだとローカルスタックへ投入してしまう)
SUPABASE_URL=https://<project-ref>.supabase.co \
SERVICE_ROLE_KEY=<service_role key> \
SUPABASE_DB_URL="$DB_URL" \
  supabase/seed/upload_fixtures.sh
```

`SUPABASE_DB_URL` を渡すとホストの `psql` で `item_media.storage_path` を引く（未指定だと
ローカルの `supabase_db_acerora2` コンテナを見に行く）。service_role key はこの投入処理と
Edge Function だけで使い、フロントには置かない。

## 3. Edge Function のデプロイと secret

```bash
supabase functions deploy          # supabase/functions/* を一括デプロイ
# 個別なら: supabase functions deploy devin-webhook
```

`verify_jwt` は `supabase/config.toml` の `[functions.*]` がそのままクラウドにも適用される
（`supabase functions deploy` が config を読む）。現状:

| Function | `verify_jwt` | 備考 |
|---|---|---|
| `extract-item` / `explain-match` / `build-connector` | `true` | ブラウザから `Authorization: Bearer <access token>` 付きで呼ぶ |
| `generate-embeddings` / `recompute-matches` | `false` | DB の cron / pg_net から呼ぶため JWT を持たない |
| `devin-webhook` | `false` | Devin / GitHub は JWT を持たない。**代わりに `x-office-relay-secret` ヘッダを `DEVIN_WEBHOOK_SECRET` と照合する**（`supabase/functions/devin-webhook/index.ts`）。secret 未設定だと検証が成立しないので、公開前に必ず設定する |

secret の設定:

```bash
# クラウドが自動注入するので設定不要（設定しようとすると拒否される）:
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
# → _shared/supabase.ts が読む 3 つはすべて自動注入で満たされる。
#   ローカルの `supabase functions serve` でも同じ 3 つは CLI が注入する。

# 手動設定が必要なもの:
supabase secrets set DEVIN_API_KEY=<devin api key>
supabase secrets set OPENAI_API_KEY=<openai api key>
supabase secrets set DEVIN_WEBHOOK_SECRET=$(openssl rand -hex 32)
# 任意: Devin API のエンドポイントを変える場合のみ（既定 https://api.devin.ai/v1）
# supabase secrets set DEVIN_API_BASE=<base url>
# 任意: Connector Factory が Devin に渡すリポジトリ URL を変える場合のみ
# supabase secrets set CONNECTOR_REPO_URL=<repo url>

supabase secrets list               # 反映確認
```

`OPENAI_API_KEY` / `DEVIN_API_KEY` は未設定でも各 Function がフォールバック（決定的ハッシュ埋め込み /
シミュレーション）で動くため、デモを先に通してから後で本物のキーを入れてもよい。

`DEVIN_WEBHOOK_SECRET` を設定したら、Devin 側の webhook 送信元に
`x-office-relay-secret: <同じ値>` を付けさせる。secret 名（`DEVIN_WEBHOOK_SECRET`）と
ヘッダ名（`x-office-relay-secret`）は別物で、`supabase secrets set` するのは前者。

cron: `pg_cron` のジョブ（`office-relay-expire-items` / `office-relay-embedding-fallback`）は
マイグレーションで登録されるので、クラウドでも `db push` 後に自動で動く。
確認は `select jobname, schedule, active from cron.job;`。

## 4. デモアカウントのパスワード

seed を投入した環境では、`officerelay` という弱いパスワードのユーザーが 3 つできる。公開前に:

```sql
update auth.users
   set encrypted_password = extensions.crypt('<新パスワード>', extensions.gen_salt('bf'))
 where email like '%@officerelay.demo';
```

同じ値を Cloudflare Pages の `VITE_DEMO_PASSWORD` に設定する（未設定の本番ビルドでは
デモログインボタンが表示されない）。デモログインを見せたくない場合は `VITE_DEMO_PASSWORD` を
設定しないまま置く。

## 5. Auth のリダイレクト URL

`AuthProvider` はマジックリンクの `emailRedirectTo` に `${window.location.origin}/app` を渡すので、
本番ドメインが許可リストに入っていないと Supabase は Site URL（既定はローカル）へ飛ばしてしまう。
Dashboard > Authentication > URL Configuration で:

- **Site URL**: `https://<project>.pages.dev`（独自ドメインを当てるならそのドメイン）
- **Redirect URLs**: `https://<project>.pages.dev/**` と、プレビュー配信を使うなら
  `https://*.<project>.pages.dev/**` を追加

`supabase/config.toml` の `[auth] site_url` / `additional_redirect_urls` は
**ローカルスタック専用**（`127.0.0.1:5173`）で、`supabase db push` / `functions deploy` では
クラウドに反映されない。Dashboard で設定するか、config.toml 側を本番 URL に書き換えて
`supabase config push` で同期する（後者はローカル開発の値を上書きすることになるので、
ローカルを使い続けるなら Dashboard 設定を推奨）。

## 6. Cloudflare Pages プロジェクトの作成

Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git で
`Toshionline/acerora2` を選び、次の設定にする:

| 項目 | 値 |
|---|---|
| Production branch | `main` |
| Root directory | `web` |
| Framework preset | Vite（または None） |
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |

Node バージョンは `web` の要求（20.19+ / 22.12+）に合わせる。Pages のビルドイメージは既定で古い
Node を使うことがあるので、明示する:

- `web/.node-version`（`22.12.0`）をリポジトリに置いてあるので Root directory = `web` ならそれが読まれる。
  別の系列を使いたい場合は Settings > Environment variables に `NODE_VERSION` を追加して上書きする

### ビルド環境変数

Settings > Environment variables で **Production / Preview の両方**に設定する
（Vite はビルド時に値を埋め込むので、後から変えたら再デプロイが必要）:

| 変数 | 値 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase の Project URL（例 `https://<project-ref>.supabase.co`） |
| `VITE_SUPABASE_ANON_KEY` | Supabase の anon public key |
| `VITE_DEMO_PASSWORD` | （任意）デモログイン用パスワード。4 節で差し替えた値 |

**`SUPABASE_SERVICE_ROLE_KEY` / `DEVIN_API_KEY` / `OPENAI_API_KEY` / `DEVIN_WEBHOOK_SECRET` は
ここに絶対に置かない。** Pages の環境変数はビルドしたバンドルに入り得るうえ、フロントからは
不要（すべて Edge Function 側で使う）。

### wrangler で手元から配信する場合

`web/wrangler.toml` に Pages プロジェクト名（`office-relay`）と出力先（`dist`）を置いてあるので、
ディレクトリ引数も `--project-name` も渡さずに配信できる:

```bash
cd web
npm install && npm run build          # VITE_* は .env / 環境変数で渡す
export CLOUDFLARE_API_TOKEN=<Pages 権限付きトークン>   # 権限は 7 節
export CLOUDFLARE_ACCOUNT_ID=<account id>
npx wrangler pages deploy --branch=main               # プレビューなら --branch=<任意名>
```

Pages プロジェクトを別名で作った場合は `web/wrangler.toml` の `name` を直す（CI もこれを読む）。

### SPA ルーティング

`react-router-dom` v7 のクライアントサイドルーティングなので、`/app/items/<id>` へ直接アクセスや
リロードをしても `index.html` を返す必要がある。`web/public/_redirects` に

```
/*    /index.html   200
```

を置いてあり、`public/` はビルド時に `dist/` へコピーされるので Pages 側の追加設定は不要。
（ステータス 200 のリライトなので、実ファイル・実アセットは通常どおり優先して配信される。）

## 7. GitHub Actions からのデプロイ

Pages の Git 連携だけで足りるが、lint / 型チェックを通した成果物だけを配信したい場合は
`.github/workflows/deploy.yml`（`main` への push で `web/` をビルドし `cloudflare/wrangler-action` で
Pages へ配信）を使う。Pages 側の Git 連携と二重に走らないよう、Actions を使う場合は Pages プロジェクトを
**Direct Upload**（Git 連携なし）で作るか、Git 連携のビルドを無効化する。

必要な GitHub 設定（Settings > Secrets and variables > Actions）:

| 種別 | 名前 | 値 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 下記のスコープで作成した API トークン |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard の Account ID |
| Secret | `VITE_DEMO_PASSWORD` | （任意）デモログイン用パスワード |
| Variable | `VITE_SUPABASE_URL` | Supabase の Project URL |
| Variable | `VITE_SUPABASE_ANON_KEY` | Supabase の anon public key |

API トークンは Dashboard > My Profile > API Tokens > Create Token > Create Custom Token で:

- **`Account > Cloudflare Pages > Edit`**（必須）
- **`Zone > DNS > Edit`**（独自ドメインを Cloudflare DNS で当てる場合のみ追加）

Account ID は Workers & Pages のサイドバーか、`wrangler whoami` で確認できる。

Pages プロジェクト名と出力先は `web/wrangler.toml` から読まれるので、ワークフロー側の修正は不要。
ビルド変数が未設定のまま真っ白な画面を配信しないよう、ワークフローは
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が空なら Deploy 前に失敗する。

## 8. デプロイ後の確認

1. `https://<project>.pages.dev/` が開く（トップはランディング）。ログイン後 `/app` の一覧に seed の物品（写真つき）が出る。
2. `/app/matches` や `/app/items/<id>` を直接開いてリロードしても 404 にならない（`_redirects` の確認）。
   存在しないパスはサーバ 404 でなくアプリが起動して `/` へリダイレクトする（router の `*` ルート）。
3. メールログイン → マジックリンクのリンク先が Pages のドメインになっている。
4. 出品フォームから写真アップロードが通る（`item-media` バケットと RLS の確認）。
5. マッチ生成 → 相手ブラウザに Realtime 通知が届く。
6. 管理画面から Connector Factory を起動し `devin_jobs` が進む（`DEVIN_API_KEY` 未設定なら
   シミュレーションで進む）。

## トラブルシュート

| 症状 | 原因 / 対処 |
|---|---|
| ビルドが `Vite requires Node.js version 20.19+` で落ちる | Pages の `NODE_VERSION` / `web/.node-version` を設定する（6 節） |
| 画面が真っ白、コンソールに `supabaseUrl is required` | Pages のビルド環境変数 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が未設定。設定して再デプロイ（再ビルドが必要） |
| `/app/...` の直リンク・リロードで 404 | `web/public/_redirects` が `dist/_redirects` として配信されているか確認 |
| マジックリンクが localhost に飛ぶ | Supabase の Site URL / Redirect URLs（5 節） |
| デモログインボタンが出ない | `VITE_DEMO_PASSWORD` 未設定（本番ビルドでは fallback しない） |
| `db push` が `major version mismatch` | Supabase Cloud プロジェクトの Postgres が 17 でない |
| `supabase secrets set SUPABASE_SERVICE_ROLE_KEY` が失敗する | 予約名。クラウドでは自動注入されるので設定不要（3 節） |
| `devin-webhook` が 401 を返す | `DEVIN_WEBHOOK_SECRET` と送信側の `x-office-relay-secret` が一致していない |
