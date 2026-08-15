/** @type {import('tailwindcss').Config} */
// Hallmark 設計トークン (src/index.css の :root) への薄いマッピング。
// 色/フォントの実値はここに書かない。トークン名だけを参照する。
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-paper)",
        panel: "var(--color-paper-2)",
        line: "var(--color-rule)",
        relay: "var(--color-accent)",
        alert: "var(--color-alert)",
        amberish: "var(--color-warn)",
        scrim: "var(--color-scrim)",
        // 既存ページの slate-* 参照をトークンへ寄せる (raw hex を残さない)
        slate: {
          50: "var(--color-ink)",
          100: "var(--color-ink)",
          200: "var(--color-ink-2)",
          300: "var(--color-ink-2)",
          400: "var(--color-muted)",
          500: "var(--color-muted)",
          600: "var(--color-rule-strong)",
          700: "var(--color-rule)",
          800: "var(--color-paper-3)",
          900: "var(--color-paper-2)",
          950: "var(--color-paper)",
        },
        emerald: {
          300: "var(--color-accent-hover)",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-outlier)",
      },
      borderRadius: {
        // シャープなミニマル寄せ: 角丸は控えめに統一する
        lg: "var(--radius-md)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-lg)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        micro: "120ms",
        short: "220ms",
      },
      zIndex: {
        sticky: "200",
        "sticky-nav": "300",
        dropdown: "400",
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      spacing: {
        // 固定フッタータブ + iOS のセーフエリア分の余白
        footer: "4.5rem",
      },
    },
  },
  plugins: [],
};
