# OFFICE RELAY デモ台本（4分 / 2ブラウザ）

対象: AIAU Craft Day 最終発表。持ち時間は 4 分。**話す内容ではなく操作の順番を固定する**ための台本。
前提: ローカル Supabase + ローカル Vite で完結（会場 Wi-Fi に依存しない）。

---

## 0. 開始 5 分前の準備（この順にやる）

```bash
supabase start
supabase db reset            # seed が入り、94% の fixture が固定される
supabase functions serve     # キー未設定でも fallback / simulation で動く
cd web && npm run dev        # http://localhost:5173
```

チェック:

- [ ] `supabase status` の API URL / anon key が `web/.env.local` と一致
- [ ] ブラウザ **左 = donor**（`donor@officerelay.demo` / `officerelay`）、**右 = startup**（`startup@officerelay.demo` / `officerelay`）でログイン済み
- [ ] 左は `/app`（ダッシュボード）、右は `/app/matches` を開いておく
- [ ] 別タブに Studio SQL Editor（http://127.0.0.1:54323）で以下を貼ったタブを用意（質問対応用）

```sql
select i.title, n.title,
       1 - (n.embedding <=> i.embedding) as asset_fit
from public.items i, public.needs n
where i.id = '33333333-3333-4333-8333-000000000002'
  and n.id = '44444444-4444-4444-8444-000000000001';
```

- [ ] 別タブに Connector Factory の成果物 PR（`adapters/tokyo-office-partners.ts` を追加した PR）を開いておく（P5-B）
- [ ] `deno test supabase/functions/_shared/adapters/` を一度流してターミナルに緑を残しておく
- [ ] 通知・Slack・OS のポップアップを切る。ブラウザは最大化、ズーム 100%

---

## 1. 課題（0:00 - 0:30）— ランディング

画面: 左ブラウザで `/`（未ログインでも見える）

> 「オフィスの移転・縮小では、まだ使える什器が **撤去期限** ひとつで産廃になります。
> 一方で創業直後のスタートアップは机も椅子も足りない。OFFICE RELAY はこの2つを、廃棄が決まる**前に**つなぎます。
> 私たちが追う数字は掲載数ではなく **Rescue before deadline** — 期限までに次の使い手が決まった資産の数です。」

ここでスコア式（0.35 AssetFit / 0.20 ServiceFit / 0.20 GeoFit / 0.15 UrgencyFit / 0.10 TrustFit）を指差す。

## 2. 出品（0:30 - 1:20）— donor 側

画面: 左ブラウザ `/app/items/new`

1. 写真を選ぶ（`docs/` 外の手元の椅子写真、または seed 済みの画像）
2. **写真を選んだ直後にフォームが前埋まる**のを見せる（`extract-item`。LLM キーが無ければ何も起きないので、その場合は黙って手入力に進む）
3. 品名「メッシュバックチェア」、数量、状態、撤去期限、拠点（渋谷）を確認して登録

> 「写真を撮るだけで出品が終わります。撤去期限が迫った総務部に入力作業をさせないことが、そのまま Rescue 数になります。
> 写真は Supabase Storage に `{org_id}/{item_id}/` で入り、アップロード前にブラウザ側で 1600px に縮小しています。」

## 3. Realtime マッチ（1:20 - 2:00）— 2画面同時

登録直後、**右ブラウザ（startup）にオーバーレイ通知が出る**のを指す。

> 「いま donor が登録した瞬間に、受け取り側のブラウザへ Realtime の private channel で届いています。
> スコアは画面で計算していません。trigger の中で pgvector と PostGIS を使って **DB 側で事前計算済み**です。」

右ブラウザ `/app/matches` で **94% MATCH** を開き、スコア内訳バーを見せる。

> 「出品は『メッシュバックチェア』、ニーズは『会議室用のイス』。文字列一致なら 0 点ですが、
> pgvector の cosine 距離では AssetFit 0.97 です。距離 3.6km は PostGIS。
> ServiceFit 0.96 は、AI Seed が NEXTMOVE 総務に生成AI研修を提供できるから — **物とサービスを同時にマッチ**しています。」

（聞かれたら Studio タブの SQL を見せる）

## 4. 承諾 → 引渡 → Credits（2:00 - 2:50）

1. 右（startup）で **承諾する** → まだ成立しない。「譲渡企業の承諾を待っています」に変わり、住所も伏せたまま
2. 左（donor）に「相手が承諾しました」の通知が出る。donor でも **承諾する** → 双方承諾で `accept_match` が transfer を作成
3. 承諾前は「最寄駅 + 概算距離」だけだった欄に、**正確な住所・担当者・搬出条件が現れる**のを指す

> 「住所は `org_locations` に隔離してあり、双方が承諾したマッチの相手にしか RLS が行を返しません。
> アプリの if 文ではなく Postgres の行レベルセキュリティで守っています。」

4. 左（donor）で **引渡完了にする** → `complete_transfer`
5. 両画面の **Relay Credits** が増える（donor +100 `asset_donated` / recipient +30 `pickup_completed`、サービス合意があるマッチなので recipient にさらに +80 `service_delivered`）。
   fixture の 94% マッチなら **NEXTMOVE 320 → 420 / AI Seed 60 → 170**。Rescue before deadline が両者 +1

## 5. Connector Factory（2:50 - 3:40）

画面: 左ブラウザ `/app/connector-factory`

1. 供給元「東京オフィス移転パートナーズ」の CSV（管理番号 / 品名 / 数量 / 搬出期限…）を見せる
2. **BUILD WITH DEVIN** を押す
3. ステップタイムラインが Realtime で流れる（`devin_jobs` の更新 → channel `connector-factory`）

> 「新しい供給元が増えるたびに人間が連携コードを書くのではなく、CSV 仕様を登録すると
> Edge Function が列マッピングを推論して spec を組み立て、Devin のセッションを作ります。
> 成果物は adapter の PR です。」

セッション URL が出たところで、**用意しておいた完了済み PR のタブ**に切り替えて中身を 5 秒だけ見せる。
提示するのは `supabase/functions/_shared/adapters/tokyo-office-partners.ts` を追加した PR。
見せる順番は「契約 (`docs/adapter-contract.md`) → adapter 本体 → テスト 7 件が緑」の 3 箇所だけ。

> 「当日その場で完走はさせません。ここまでがライブ、これが Devin が出した PR です。
> 必須項目が欠けた行は推測で埋めずに rejected に落とす、という契約もテストで担保されています。」

## 6. 締め（3:40 - 4:00）

> 「pgvector で意味を、PostGIS で距離を、RLS で信頼を、Realtime で同時性を、Edge Functions で鍵の安全を担保しています。
> 追う数字は Rescue before deadline ひとつです。」

---

## 想定質問と答え

| 質問 | 答え |
|---|---|
| 94% は fixture では？ | 計算は本物（`score_pair` が `<=>` と PostGIS で毎回計算）。発表の1件だけ表示を固定している。Studio でその場で再計算して見せられる |
| embedding は本物？ | ライブは OpenAI `text-embedding-3-small`（384次元）。**ネットワークが切れたときだけ** DB 内の決定的ハッシュに落ちる。それは意味類似ではない、と明言する |
| ベクトル計算はアプリ側？ | すべて SQL 関数の中。HNSW インデックスが効くことは `explain analyze` で確認済み |
| Devin API が落ちたら？ | simulation mode で進捗が流れる。キー未設定でも画面は壊れない |
| 所有権や責任は？ | プラットフォームは所有権を持たず、譲渡意思のある資産の移転を仲介するだけ。買取再販・決済・独自配送はスコープ外 |
| Relay Credits は換金できる？ | しない。マッチ優先度と Trust に効く貢献スコア |

## 詰まったときの復旧

| 症状 | 対処 |
|---|---|
| Realtime が来ない | 画面を再読み込み（購読は1本に集約してある）。それでも駄目なら「承諾する」から続行し、通知は口頭で補う |
| マッチが出ない | 別タブの psql で `select public.recompute_matches();` |
| 画面のデータが壊れた | `supabase db reset`（1〜2分）。**発表中はやらない**、リハ時のみ |
| Edge Function が 500 | 落として fallback に任せる（accept / complete は RPC 直叩きのフォールバックがある） |

## リハーサル記録（最低3回）

| # | 日時 | 所要 | 詰まった箇所 | 対処 |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
