# OFFICE RELAY 要件定義書

- ドキュメント: docs/00_product_requirements.md
- プロダクト名: OFFICE RELAY
- リポジトリ: Toshionline/acerora2 (ref: main)
- Supabase project_id: acerora2（表示名 acerora_rin）
- タイムゾーン: Asia/Tokyo
- UI言語: 日本語 / コード・DB識別子: 英語
- ステータス: Phase 0（契約凍結）完了。バックエンド中核（RLS・マッチング関数・Realtimeトリガー・Edge Functions・seed）を実装中

## 1. 背景と目的
### 1.1 課題
- STARTUP側: 創業直後・Seedステージでは、デスク・チェア・モニタ等の初期設備投資が Product / Hiring / Marketing / Development に回すべき資金を圧迫する。
- DONOR側: オフィス移転・縮小・退去・什器入替・IT機器更新により、まだ使える資産でも短期間で搬出する必要が生じ、撤去期限までに引取先が見つからないと廃棄される。
### 1.2 プロダクト定義
OFFICE RELAY は、まだ使用可能で譲渡意思のある企業資産を、廃棄決定の前段階でそれを必要とするスタートアップへ移転する B2B 循環リソースリレーのプラットフォームである。中古品売買サイトでも廃棄物回収サービスでもない。プラットフォーム自身は資産の所有権を取得せず、企業間の移転を仲介するのみ。最大の特徴は「モノ」と「サービス」を交換価値として組み合わせる Double Matching（Asset × Service）である。
### 1.3 最上位指標（NSM）
掲載件数ではなく Rescue before deadline ＝「撤去期限までに再利用先が確定した資産数」を最重要 KPI とする。

## 2. スコープ
### 2.1 対象ユーザー（MVP）
DONOR（余剰オフィス資産を提供する企業）、STARTUP（資産を必要とするスタートアップ）。
### 2.2 将来拡張（MVPでは実装しない）
物流会社 / リユース会社 / オフィス移転会社 / 不動産 / ビル管理 / メーカー / 大学 / イベント会社などのパートナー。`organizations.org_type` に `logistics` / `partner` を予約済みで、Architecture 上は追加可能にしておく。
### 2.3 スコープ外（実装しない）
決済 / Stripe / 完全チャット / 広告配信 / 人材紹介 / ポイント通貨 / 独自配送 / 本番スクレイピング / Jimoty連携 / 複雑なESGレポート / 保険 / 大量の外部API。家電リサイクル法対象品目（冷蔵庫・空調等）は「対応予定」表示のみ。

## 3. Golden Path（最重要フロー）
Create Item(+写真) → Create Need → Match(スコア生成) → 双方Accept → Transfer自動生成。
1. DONOR: 余剰資産を登録 / 2. DONOR: 写真を登録（最大3枚） / 3. DONOR: 欲しいサービス（service_want）を登録 / 4. STARTUP: 必要な資産（need）を登録 / 5. STARTUP: 提供できるサービス（service_offer）を登録 / 6. SYSTEM: Match を生成（recompute_matches） / 7. SYSTEM: Match Score を算出・表示 / 8. STARTUP: Accept / 9. DONOR: Accept / 10. SYSTEM: 両者Accept後、Transfer を自動生成（accept_match）。このフローが壊れないことを何より優先する。

## 4. 機能要件
### 4.1 認証・組織（Auth）
Sign up / Sign in / Sign out（メールマジックリンク）。デモ用に即ログインできるデモアカウント（NEXTMOVE=donor / AI Seed=startup）。User は Organization に所属（org_members）。org_type は startup / donor（将来 logistics / partner）。
### 4.2 余剰資産登録（Item）
title / description / category / quantity / condition / pickup_deadline / location / status。ステータス: available / reserved / transferred / expired。
### 4.3 写真登録（Item Media）※MVP必須
PC / スマートフォンから 1 Item 最大3枚。画像選択 / uploadプレビュー / progress / error / 削除 / 1枚目をmain / 一覧thumbnail / 詳細gallery / 画像なしplaceholder。画像ファイル自体は DB に保存しない。Supabase Storage バケット item-media を使用。パス規約: {organization_id}/{item_id}/{filename}。
### 4.4 必要資産登録（Need）
title / description / category / quantity / max_distance_km / latest_needed_at / location / status。ステータス: open / fulfilled / closed。
### 4.5 サービス登録
service_wants（DONORが欲しいサービス）/ service_offers（STARTUPが提供できるサービス）。
### 4.6 マッチング
ルールベースを確実に完成させ、pgvector / PostGIS へ差し替え・合成できる構造とする。ロジックは UI コンポーネントに書かず DB側のSQL関数（score_pair / recompute_matches）に閉じ込める。スコア式（既存フロント・DBスキーマと統一、5要素・0〜1）: Score = 0.35·AssetFit + 0.20·ServiceFit + 0.20·GeoFit + 0.15·UrgencyFit + 0.10·TrustFit。AssetFit=embeddingがあれば 1-(item<=>need)、無ければ category一致+数量比（pgvector/Postgres）。ServiceFit=want × offer の embedding 最良ペア、無ければルールベース（pgvector/Postgres）。GeoFit=PostGIS ST_Distance、無ければ area_label 一致（PostGIS）。UrgencyFit=pickup_deadline vs now（Postgres）。TrustFit=relay_credits ベース（Postgres）。Match詳細では total_score だけでなく各内訳を表示する。数量適合（quantity）は AssetFit 内の係数として吸収する。
### 4.7 承諾・移転（Accept / Transfer）
matches.status: proposed / accepted / declined / expired。STARTUP Accept → DONOR Accept の双方承諾で accept_match が Transfer を1件生成。items.status='reserved'、完了時に transferred / needs='fulfilled'。transfers: delivery_method / scheduled_at / status(pending/scheduled/completed/cancelled) / completion_code。
### 4.8 Relay Credits
換金性のない貢献 / Trust スコア。譲る +100 / 引取完了 +30 / サービス提供完了 +80 / 高評価 +20 / キャンセル -50。イベントは relay_credit_events に台帳として記録。「AI研修3万円分」等の価値交換は当事者間合意として matches.service_note に表示し、プラットフォーム内スコアとは分離する。
### 4.9 ダッシュボード
Available Assets / Active Needs / Matches / Successful Transfers / Rescued Items を実データから集計。根拠のない CO2 削減量などは表示しない。
### 4.10 Devin Connector Factory（P3・スポンサーWOW）
管理画面「BUILD WITH DEVIN」から供給元CSV/API仕様 → Edge Function build-connector → Devin API セッション作成 → adapter/importer/validation/tests 生成 → GitHub PR → devin_jobs に状態保存 → Realtime connector-factory で進捗表示。DEVIN_API_KEY が無い場合は simulation mode で確実に動作させる（fake integration は作らない）。

## 5. 非機能要件
### 5.1 セキュリティ（RLS / Storage / Secrets）
全公開テーブルで RLS を有効化し、Organization 境界を実際に守る。自組織: create/update 可。他組織: public情報のみ read 可。matches/transfers: donor_org_id または recipient_org_id が自組織の行のみ。正確な引取住所（org_locations）は DONOR本人、または matches.status='accepted' の相手STARTUPのみ SELECT可。Storage item-media: authenticated のみ upload、パス先頭 org_id が自組織のときのみ insert/delete。他組織画像の delete / overwrite 不可。service_role / secret key はクライアントに絶対に置かない。Edge Function secret のみで扱う。Secret を Git / commit / browser / logs に入れない。
### 5.2 アーキテクチャ
Frontend と data access / matching / auth / storage / realtime / Devin integration を疎結合に保つ。matching は rule based / semantic / geospatial を将来差し替え・合成できる構造にする。Database 変更は必ず migration で管理。既存 migration は編集せず新規ファイルを追加。
### 5.3 品質・検証
lint / typecheck / tests / production build を実行（repository scripts に準拠）。手動ブラウザ確認: desktop ~1440px / mobile ~375px。最低限 Create Asset / Photo Upload / Create Need / Match / Accept / Transfer を実ブラウザで確認。
### 5.4 デモ信頼性
会場ネットワーク非依存（ローカル Supabase + Vite）。embedding は fallback で動く。Match Score はハードコードせず、実際の関数で算出する。

## 6. データモデル（既存スキーマ準拠）
organizations / org_locations / org_members / items / item_media / needs / service_offers / service_wants / matches / transfers / relay_credit_events / partner_leads / integration_sources / devin_jobs。詳細は docs/02_database.md を参照。注: 要件で挙がった item_private_details は既存実装では住所を組織単位で分離する org_locations として実装済み。要件の quantity_score は 5要素式の AssetFit に統合する。

## 7. Supabase 活用方針
Postgres（中核データ・整合性, P0）、Auth（企業アカウント・RLS判定材料, P0）、RLS（Organization境界・住所開示制御, P0）、Storage（出品写真 item-media, P0/P1）、Realtime（private channel でマッチ即時通知, P1）、pg_cron（期限切れ資産を expired に, P1）、pgvector（AssetFit/ServiceFit の意味マッチ, P2）、PostGIS（GeoFit の距離計算, P2）、Edge Functions（embedding生成/マッチ再計算/Devin API/webhook, P0〜P3）。

## 8. 優先順位
P0（絶対完成）: Auth / Organization / DB / RLS基本 / Asset登録 / 写真upload / Need登録 / Service Want・Offer / rules-based Match / Match Score / 双方Accept / Transfer生成 / seed / usable UI。P1: Storage security完成 / Realtime / pg_cron expire。P2: pgvector（Double Semantic Matching）/ PostGIS GeoFit。P3: Devin API疎通 / Connector Factory / GitHub PR。P4: Dashboard / Match説明 / loading・error states / responsive / demo信頼性 / docs。P0 が壊れている状態で P2/P3 へ進んではならない。

## 9. 受け入れ基準（Acceptance Criteria）
P0の1〜20（Signup/Login、DONOR/STARTUP Organization、Asset登録、写真最大3枚、Storage保存、Service Want、Need、Service Offer、実マッチング関数のScore計算、Match一覧Score表示、Match詳細breakdown、STARTUP Accept、DONOR Accept、双方AcceptでTransfer生成、他Organizationがprivate data変更不可、exact pickup addressが許可相手のみ可視、demo seed data動作、production build成功、実ブラウザGolden Path確認）。P1: 21. Accept状態がRealtime更新。P2: 22. semantic matchingが実際にpgvectorを利用（実装時）、23. distance scoringが実際にPostGISを利用（実装時）。P3: 24. Connector Factoryが実際のDevin APIを呼ぶ（API利用可能時）、25. 実際のDevin session/PR URLを確認（実装時）。Fake completion は禁止。

## 10. デモ用シードデータ
NEXTMOVE株式会社（DONOR, 東京都渋谷区）: デスク20/チェア24/27インチモニタ10、撤去期限=明日18:00、Service Want=生成AI社内研修。AI Seed Inc.（STARTUP, 渋谷/恵比寿・五反田周辺）: Need=デスク10/チェア10/モニタ6、Service Offer=生成AI研修/AI業務自動化/Web開発。この2社が実際のマッチング関数で高スコアになること（Score はハードコードしない）。

## 11. リスク / 前提
seed空でデモ不能→seedを最優先実装。RLS未実装＝セキュリティ減点→RLS migrationをP0で必須。マッチ生成関数欠如でGolden Path断絶→P0の中心タスク。embedding未生成でServiceFit=0→決定的ハッシュfallbackを必ず残す。Devin APIキー未取得→simulation modeで確実動作、live化は確認後。本番Supabaseリンク不明→Agent起動時に supabase status / link 確認。
