---
name: testing-supabase-backend
description: How to run and adversarially test the acerora2 (OFFICE RELAY) Supabase backend locally — db reset/seed, RLS role switching in psql, matching lifecycle RPCs, Edge Functions in fallback/simulation mode, and Studio/web UI smoke checks.
---

# Local Supabase backend testing (acerora2 / OFFICE RELAY)

## Bring up the stack
- `supabase start` (Docker required). Always begin a test run with `supabase db reset`
  so seeds are deterministic; the reset can take a few minutes and may be backgrounded —
  poll the shell output instead of assuming failure.
- No standalone `psql`: use `docker exec -i supabase_db_acerora2 psql -U postgres` (heredoc works well).
- Service role / anon keys: `supabase status`.
- Edge Functions: `supabase functions serve --no-verify-jwt`, then curl
  `http://127.0.0.1:54321/functions/v1/<name>` with `Authorization: Bearer <service_role>`.
- Studio: http://127.0.0.1:54323 (SQL Editor is the best way to produce visual evidence).
  Note: running queries in Studio writes snippet files into `supabase/snippets/` owned by the
  container user — they can show up as untracked git files and may not be removable without sudo.
- Web app: `cd web && npm run dev` → http://localhost:5173 (Phase 0 skeleton pages).
  Vite warns about Node 20.18 (<20.19) but lint/build/dev still work.

## Browser / UI E2E testing (web app)
- `web/.env` is not committed. Without it `web/src/lib/supabase.ts` throws at boot, so create
  `web/.env.local` before `npm run dev`:
  `VITE_SUPABASE_URL=http://127.0.0.1:54321` + `VITE_SUPABASE_ANON_KEY=<anon key from supabase status>`.
- Login page has demo accounts (NEXTMOVE = donor, AI Seed = startup); the dev fallback password
  is `officerelay`. Switching persona = logout → pick the other demo account.
- The seed inserts `item_media` rows but **no objects in Storage**, so thumbnails 404 until you
  upload files to the `item-media` bucket yourself (service_role key + storage REST). Uploading a
  second media row for one item is the easiest way to exercise the detail-page gallery switcher.
- `datetime-local` inputs are painful via synthetic typing (you can end up with values like
  `222026-08-08T10:00`). Click the input, then type segment by segment and verify the value
  before submitting.
- Japanese text often does not reach the page through the computer-use `type` action. Fall back to
  `DISPLAY=:0 xdotool type --clearmodifiers 'モニタ'` after focusing the field.
- Responsive checks: the X display is 1600x1200, so 1440px can be tested by resizing the window
  (`wmctrl -r :ACTIVE: -e 0,0,0,1472,1150`), but Chrome enforces a ~500px minimum window width —
  use DevTools device toolbar (F12 then Ctrl+Shift+M, set width 375) for mobile, and verify
  `document.documentElement.scrollWidth === innerWidth` for overflow.
- Local matching runs frequently expire older `proposed` matches (Realtime shows a burst of
  「マッチの期限が切れました」) and one seeded item flips to `expired`; expect list counts to drift
  during a long run and assert on tags rather than exact totals.

## Expected seed baseline (after a clean reset)
items 13 / needs 6 / matches 68 / organizations 6 / embedding queue depth 0 / no null embeddings.

## Useful fixed IDs
- donor user `11111111-1111-4111-8111-111111111101` → org `22222222-2222-4222-8222-000000000001`
- startup user `...102` → org `...0003`; admin user `...103` (third party for negative tests)
- flagship item `33333333-3333-4333-8333-000000000002`, need `44444444-4444-4444-8444-000000000001`
- integration source `77777777-7777-4777-8777-000000000001`

## Simulating an authenticated user in psql
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
-- ... queries ...
rollback;   -- keeps the DB clean; great for reproducing destructive bugs safely
```
`set local role anon;` should make every `public` table fail with `permission denied` (42501).

## Things worth probing adversarially
- Lifecycle RPCs (`accept_match` / `decline_match` / `complete_transfer` / `cancel_transfer`)
  are SECURITY DEFINER; check they validate **item/need state**, not just match state.
  A known failure mode: accepting a *second* proposed match for an item that is already
  `transferred` may succeed and double-award Relay Credits. Always enumerate leftover
  `proposed` matches for a completed item and try to accept one.
- Double accept should be idempotent (same transfer id); a non-party should get
  `not a party of this match`.
- Direct writes to `matches` / `transfers` / `relay_credit_events` by `authenticated`
  must be `permission denied`; cross-org item update/delete must affect 0 rows.
- `org_locations` exact address is only visible to counterparties with an accepted match.
- Edge Functions must return 4xx (never 500) for missing/unknown ids, empty body, broken JSON.

## Web UI / mobile testing notes (Golden Path)
- `web/.env` is not committed. Create it before `npm run dev`:
  `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=<anon key from supabase status>`.
  Demo logins use `VITE_DEMO_PASSWORD`, local default `officerelay`
  (`donor@officerelay.demo` / `startup@officerelay.demo`).
- Mobile viewport: Chrome DevTools device toolbar (ctrl+shift+M), 375x812.
- Golden Path that reliably produces a match: list an item with category `chair`
  (seeded startup need 「会議室用のイスがほしい」). `/app/items/new` requires a photo —
  generate one with Pillow into `/tmp`. `datetime-local` inputs are easier to fill by clearing
  the field and typing segments with arrow-key navigation than by typing the whole value.
- `complete_transfer` awards +100 Relay Credits; the Dashboard stat only refreshes after the
  page's `reloadOrg()`, so re-navigate to `/app` if the number looks stale.
- Testing a user with **no org** (「組織に所属していません」card): use the login page's
  magic-link form, then read the link from Mailpit's API
  (`curl http://127.0.0.1:54324/api/v1/messages` → `/api/v1/message/<id>`).
  `supabase/config.toml` sets `site_url = http://127.0.0.1:3000` and does not allow
  `localhost:5173`, so the token fragment never reaches the app origin. Workaround: run a
  throwaway static server on port 3000 serving an HTML page that does
  `location.replace('http://localhost:5173/app' + location.hash)`, then open the verify link.
- Known/possible issues to re-check: the `match_found` overlay in `NotificationCenter`
  (`fixed inset-0`) may be clipped to the sticky header's height because of the
  `backdrop-blur` ancestor — measure `getBoundingClientRect()` rather than trusting the class.
  The `/app/items/new` photo preview may log repeated `blob:... ERR_FILE_NOT_FOUND`
  console errors even though the upload succeeds.

## `blob:` console errors are usually a TEST-TOOL false positive
The agent DOM-snapshot script truncates `img[src]` to ~30 chars and re-assigns it
(`setAttribute('src', 'blob:http://localhost:5173/...')`), which makes Chrome fire a real
`net::ERR_FILE_NOT_FOUND` for a URL the app never created. Before reporting a blob bug:
- Open DevTools → Network and read the **full Request URL**. A literal trailing `...`
  (no UUID) means the tooling truncated it → not an app bug.
- Check the **Initiator**: `VM<n>:<line>` = injected snapshot script (tooling);
  `react-dom_client` / an app source file = genuine app request.
- Confirm the real preview works: in the console read the `<img>`'s
  `src` / `complete` / `naturalWidth`; a loaded 200 OK `image/jpeg` blob URL with a full UUID
  means the object-URL lifecycle is fine.
- Also expect HMR/Fast-Refresh to revoke object URLs on hot updates in dev. Always hard-reload
  (Ctrl+Shift+R) or use a fresh tab before counting console errors.
- `GET /favicon.ico 404` is always present locally and is unrelated to the app under test.

## Status / countdown display rules to assert (Account, ItemDetail, ItemPhotoCard)
`lib/format.ts:showsCountdown(status)` is true only for `available` and `reserved`.
So `available`/`reserved` rows show 「撤去まで残り N 日」 while `expired`（掲載終了）/`transferred`
show 「撤去期限 MM/DD HH:mm」. The `expired` path is reachable from the UI by
「取り下げ」 in `/app/account`, and `/app/search` shows non-available cards only after tapping the
pill 「掲載中のみ」 → 「すべての状態」.

## Account inline-edit validation
Save is disabled only when the title is empty, so quantity `0`/empty reaches `save()` and shows
「数量は 1 以上の整数で入力してください」 at the top of the page (scroll up — the banner is above
the stat cards). Known cosmetic issue: the generic banner 「最新の状態を取得できませんでした」 is
rendered together with the validation message. Verify DB immutability with
`docker exec supabase_db_acerora2 psql -U postgres -d postgres -tAc "select quantity from public.items where id='...';"`.
Beware: `triple_click` on a number input does not always select the value —
click, then `ctrl+a` + `Delete` before typing, and re-read the DOM value before saving.

## Devin Secrets Needed
- `OPENAI_API_KEY` (optional): without it `generate-embeddings` returns `provider:"fallback"`
  and `explain-match` leaves `matches.reason` null — that is the intended fallback path.
- `DEVIN_API_KEY` (optional): without it `build-connector` runs in `mode:"simulation"`.
- `DEVIN_WEBHOOK_SECRET`: required to test the `devin-webhook` success path; without it only
  the 401 rejection path can be verified.
