# Edge Function I/O 契約 (Phase 0 で凍結 / チケット P0-3)

この契約はフロント (C・D) とバックエンド (B) が並行作業するための固定点。
**変更する場合は B が PR でこのファイルを更新し、フロント担当に周知してからマージする。**

共通事項:

- ベース URL: ローカルは `http://127.0.0.1:54321/functions/v1`
- 認証: クライアントからは `supabase.functions.invoke()` を使う（ユーザーの JWT が自動付与される）
- CORS: `supabase/functions/_shared/cors.ts` の `corsHeaders` を全関数で使う。`OPTIONS` は 204 を返す
- エラー形式は全関数共通:

```json
{ "error": "human readable message" }
```

- **`DEVIN_API_KEY` と `SUPABASE_SERVICE_ROLE_KEY` は Edge Function の secret のみ。クライアントに置かない。**

---

## `POST /functions/v1/recompute-matches`

マッチを再計算する。`public.recompute_matches(p_item_id, p_need_id)` の薄いラッパー。

Request（両方省略すると全件再計算）:

```json
{ "item_id": "uuid | null", "need_id": "uuid | null" }
```

Response `200`:

```json
{ "matches": 12 }
```

---

## `POST /functions/v1/generate-embeddings`

`relay.embedding_jobs` のキューを消化して items / needs / service_offers / service_wants の
`embedding`（`vector(384)`）を埋め、対象の match を再計算する。

Request:

```json
{ "limit": 50 }
```

Response `200`:

```json
{ "processed": 8, "provider": "openai | fallback" }
```

- `OPENAI_API_KEY` があれば `text-embedding-3-small`（dimensions=384）を使う
- 無い / 失敗した場合は DB 側の決定的フォールバック embedding を維持し、`provider: "fallback"` を返す（会場のネットワーク対策）

---

## `POST /functions/v1/build-connector`

Connector Factory の中心。供給元の仕様から Devin セッションを作る。

Request:

```json
{ "source_id": "uuid" }
```

Response `202`:

```json
{
  "job_id": "uuid",
  "devin_session_id": "string | null",
  "session_url": "string | null",
  "mode": "live | simulation"
}
```

処理:

1. `integration_sources` を取得
2. `devin_jobs` を `status = "queued"` で作成し、`integration_sources.status = "building"` に更新
3. `DEVIN_API_KEY` があれば Devin API でセッション作成 → `devin_session_id` / `session_url` を保存 → バックグラウンドで polling
4. 無い場合は **simulation mode**（`devin_jobs.steps` を順に進め、summary に「SIMULATION MODE」と明記）
5. 更新は Postgres trigger 経由で Realtime channel `connector-factory` に broadcast される

Devin に渡すプロンプトに必ず含める制約:

- `docs/adapter-contract.md` を最初に読む
- `NormalizedSupplyItem` へ正規化する
- `title` / `quantity` / `location` / `pickup_deadline` が欠けたレコードは拒否
- コアのマッチングロジック（`supabase/migrations/*_matching.sql`）は変更しない
- secret をコミットしない
- fixture を使ったユニットテストを追加し、typecheck とテストを実行して PR を作る

---

## `POST /functions/v1/devin-webhook`

Devin / GitHub からの進捗を `devin_jobs` に反映する。

Headers: `x-office-relay-secret: <DEVIN_WEBHOOK_SECRET>`（不一致なら `401`）

Request:

```json
{
  "session_id": "string",
  "status": "queued | running | blocked | finished | failed",
  "pr_url": "string | null",
  "summary": "string | null",
  "steps": [{ "label": "string", "state": "done | running | pending", "at": "ISO8601" }]
}
```

Response `200`:

```json
{ "ok": true }
```

---

## `POST /functions/v1/extract-item`（P2-B2 / 任意機能）

出品写真1枚から入力候補を返す。**フォームを埋めるだけ**で、DB には何も書かない。

Request:

```json
{ "image_path": "string (Storage の item-media パス)" }
```

Response `200`:

```json
{
  "title": "string | null",
  "category": "desk | chair | monitor | whiteboard | cabinet | other | null",
  "quantity": "number | null",
  "condition": "excellent | good | fair | null",
  "confidence": "number (0-1)"
}
```

- LLM が使えない / パースできない場合も **200 で全 null** を返す（フォームは手入力で完了できる）
- ユーザーを待たせる唯一の同期呼び出し。2秒を超えたらフロント側で打ち切ってよい

---

## `POST /functions/v1/explain-match`（P3-B2 / 任意機能）

マッチ理由の1〜2文を生成して `matches.reason` に保存する。**非同期**（フロントは結果を待たず、Realtime の更新で受け取る）。

Request:

```json
{ "match_id": "uuid" }
```

Response `202`:

```json
{ "queued": true }
```

- 既に `reason` があれば再生成しない
- 生成失敗時は `reason` を空のままにする。画面はスコア内訳のみを表示する

---

## Realtime チャンネル契約（フロントが購読する側）

| channel | private | event | payload | 使う画面 |
|---|---|---|---|---|
| `org:{org_id}:matches` | yes | `match_found` / `match_accepted` / `match_declined` / `match_expired` / `match_updated` | `{ record, old_record }`（`matches` 行） | ダッシュボード・マッチ画面の通知 |
| `org:{org_id}:matches` | yes | `transfer_scheduled` / `transfer_completed` / `transfer_cancelled` | `{ record }`（`transfers` 行） | 引渡ステータス |
| `connector-factory` | yes | `devin_job_{status}` | `{ record }`（`devin_jobs` 行） | Connector Factory のタイムライン |

`match_updated` はスコア再計算や `reason` 生成など、status が変わらない更新。
`transfer_cancelled` は `cancel_transfer` で引渡が取り消されたとき。どちらも未知イベントとして無視して構わない。

private channel なので、ログイン後に `supabase.realtime.setAuth()` を呼んでから
`supabase.channel(name, { config: { private: true } })` で購読する。
