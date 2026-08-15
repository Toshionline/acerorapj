# OFFICE RELAY — デザインシステム (Hallmark)

`.agents/skills/hallmark` の redesign verb (multi-page) に沿って作成した、**アプリ全体で共有する 1 つの**
デザインシステム。ページごとに別テーマを当てない。実体は `web/src/index.css` の `:root` トークンで、
`web/tailwind.config.js` はそのトークンへのマッピングしか持たない (raw hex を置かない)。

## 前提 (pre-flight)

- スタック: React 19 + TypeScript + Vite + Tailwind CSS 3 + React Router + Supabase JS
- モーションライブラリ: なし → CSS トランジションのみ (motion-cut)
- ルート: `web/src/main.tsx` で凍結済み。ルート構成・認証・データ取得・Realtime は変更しない
- 既存シグナル: ダーク UI + ミント系アクセント → 破棄せず、名前付きトークンとして整える

## 選択

| 軸 | 選択 | 理由 |
| --- | --- | --- |
| Genre | modern-minimal | B2B プラットフォーム / ダッシュボード。抑制されたモノトーン + 1 アクセント |
| Theme | custom (dark) · vibe: "salvage logistics, cool, deadline-driven" | 既存のダーク + ミントを OKLCH に載せ替え |
| Macrostructure | Stat-Led (LP) / Workbench (アプリ) | NSM「Rescue before deadline」が主役。アプリ側は作業台 |
| Nav | N9 edge-aligned minimal (LP) / N1b three-section + タブレール (アプリ) | LP は 2 目的地のみ。アプリは 6 目的地 + 通知 + 組織 |
| Footer | Ft5 statement | 法的説明を「宣言 + メタ」で 1 段に。4 カラムリンク footer (AI 指紋) を避ける |
| Motion | press (translateY 1px) · card hover raise (pointer: fine のみ) | transform / opacity のみ。`prefers-reduced-motion` で無効化 |

## トークン (`web/src/index.css`)

- **面**: `--color-paper` `oklch(16% 0.012 200)` / `-2` / `-3` — 純黒を使わず、アクセント寄りに色味を付ける
- **文字**: `--color-ink` / `--color-ink-2` / `--color-muted`
- **罫**: `--color-rule` / `--color-rule-strong`
- **アクセント**: `--color-accent` `oklch(80% 0.15 168)`、面に敷くときは必ず `--color-accent-ink` を文字色に。
  被覆率はビューポートの数 % に留める (state・focus・小さなアンカーのみ)
- **フォーカス**: `--color-focus`。`:focus-visible` は 2px outline + offset、**トランジションしない**
- **タイプ**: display / body = Geist (日本語は Noto Sans JP)、outlier = Geist Mono (ワードマーク・数値のみ)。
  スケールは 1.25 比。本文の measure は `--measure: 62ch`
- **空白**: `--space-3xs` … `--space-5xl` の 4pt スケール。任意の px 値は使わない
- **モーション**: `--ease-out` / `--ease-in-out`、`--dur-micro: 120ms` / `--dur-short: 220ms`
- **レイヤ**: `--z-sticky: 200` / `--z-sticky-nav: 300` / `--z-dropdown: 400`

## 共有クラス

`wrap` `measure` `rule-top` / `display` `heading` `subheading` `figure` `num` `eyebrow` /
`card` `card-quiet` `card-lift` `panel-inset` / `btn-primary` `btn-ghost` `btn-quiet` `link` /
`input` `label` `field-help` / `tag` `tag-accent` / `wordmark` `nav-link`

## 守っている規則 (slop test)

- 3 等分アイコンカードグリッドを作らない。カードのネストを作らない (一覧の行はヘアライン区切り)
- 全要素センタリングしない。hero は非対称 (7fr / 4fr)、下パディングを上より厚く取る
- 数値は `--font-outlier` + `tabular-nums`。捏造した指標は置かない (LP の数値は `matches` の実データのみ)
- `html, body { overflow-x: clip }`。ボタン・ナビのラベルは折り返さない (`white-space: nowrap`)
- 画像を含むグリッドトラックは `minmax(0, 1fr)`
- 入力は状態間で `border-width` を変えず、outline でフォーカスを出す。ヘルパー行は空でも `min-height: 1lh`
- disabled は opacity + cursor + `disabled` 属性の 3 チャネル
- sticky はアプリヘッダのみ (二重 sticky を作らない)

## 変えていないもの

ルーティング、認証、RLS、Supabase 呼び出し、Realtime、フォームの送信ロジック、
プロダクトの主張・コピーの意図。視覚と相互作用の層だけを差し替えている。
