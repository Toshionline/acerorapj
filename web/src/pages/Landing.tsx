import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

// NSM = Rescue before deadline: 撤去期限までに再利用先が確定した資産数
async function fetchRescueCount(): Promise<number | null> {
  const { count, error } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "accepted");
  return error ? null : (count ?? 0);
}

const FLOW = [
  {
    step: "1.0",
    title: "撤去期限つきで登録する",
    body: "退去・移転で出る什器を、期限・数量・引き取り条件つきで登録。必要品側は欲しい条件を登録します。",
  },
  {
    step: "2.0",
    title: "条件の近い相手を自動で探す",
    body: "品目・距離・期限・交換できるサービスを照合して、近い順に候補を並べます。",
  },
  {
    step: "3.0",
    title: "ブラインドのまま候補を確認",
    body: "組織名や連絡先は合意まで開示されません。双方が受諾した時点で引き渡しの調整に入ります。",
  },
  {
    step: "4.0",
    title: "引き渡しの実績が信用になる",
    body: "完了した引き渡しは Relay Credits として記録され、次のマッチで優先されます。",
  },
] as const;

export function Landing() {
  const [rescued, setRescued] = useState<number | null>(null);

  useEffect(() => {
    void fetchRescueCount().then(setRescued);
  }, []);

  return (
    <div className="min-h-[100svh]">
      {/* N9 · edge-aligned minimal */}
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <span className="wordmark">Office Relay</span>
        <Link to="/login" className="btn-ghost">
          ログイン
        </Link>
      </header>

      {/* Hero · H4 stat-led (worded headline + lead figure) */}
      <section className="wrap grid gap-x-12 gap-y-10 pb-[var(--space-3xl)] pt-[var(--space-lg)] lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-end lg:pt-[var(--space-xl)]">
        <div>
          <p className="eyebrow">B2B 資産リレー / 撤去期限との競争</p>
          <h1 className="display mt-[var(--space-sm)]">
            捨てる予定だった会社の資産を、
            <br />
            次の会社の創業資産へ。
          </h1>
          <p className="measure mt-[var(--space-md)] text-slate-300">
            移転・縮小・退去で撤去期限が迫った什器を、廃棄が決まる前に創業直後のスタートアップへ直接リレーする。
            物品だけでなく「譲渡企業が欲しいサービス」×「スタートアップが提供できるサービス」も同時に照合します。
          </p>

          {/* 入口を 2 つに分ける: buyer は /login → 探索、donor は出品フォーム */}
          <div className="mt-[var(--space-lg)] grid gap-[var(--space-xs)] sm:grid-cols-2">
            <div className="card border-relay">
              <p className="label">資産を探す / スタートアップ</p>
              <p className="mt-1 text-sm text-slate-300">
                写真を見て探索。ニーズに近い順にリコメンドされます。
              </p>
              <Link to="/login" className="btn-primary mt-4 w-full">
                探索をはじめる
              </Link>
            </div>
            <div className="card">
              <p className="label">余剰資産を出す / 譲渡企業</p>
              <p className="mt-1 text-sm text-slate-300">
                写真と撤去期限を登録すると、引取り先の候補を自動で探します。
              </p>
              <Link to="/app/items/new" className="btn-ghost mt-4 w-full">
                余剰資産を登録する
              </Link>
            </div>
          </div>
        </div>

        <figure className="m-0 border-l border-line pl-[var(--space-md)] lg:border-l-0 lg:border-t lg:pl-0 lg:pt-[var(--space-md)]">
          <figcaption className="eyebrow">Rescue before deadline</figcaption>
          <p className="figure mt-[var(--space-2xs)] text-relay">{rescued === null ? "—" : rescued}</p>
          <p className="mt-[var(--space-2xs)] text-sm text-slate-400">
            撤去期限までに再利用先が確定した資産数。プラットフォームの最上位 KPI で、
            合意済みマッチの実数をそのまま表示しています。
          </p>
        </figure>
      </section>

      {/* 二者の非対称 — 3 カラムグリッドではなく diptych */}
      <section className="rule-top">
        <div className="wrap grid gap-[var(--space-lg)] py-[var(--space-2xl)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-[var(--space-2xl)]">
          <div>
            <p className="tag">譲渡企業</p>
            <h2 className="heading mt-[var(--space-xs)]">退去日は動かせない。</h2>
            <p className="mt-[var(--space-2xs)] text-sm text-slate-400">
              処分費と産廃手続きを払って、まだ使える什器を捨てている。撤去業者の見積より先に、次の使い手を決めたい。
            </p>
          </div>
          <div className="md:border-l md:border-line md:pl-[var(--space-2xl)]">
            <p className="tag">スタートアップ</p>
            <h2 className="heading mt-[var(--space-xs)]">創業直後に現金は使えない。</h2>
            <p className="mt-[var(--space-2xs)] text-sm text-slate-400">
              デスク・椅子・モニタを揃える予算がなく、中古探しに時間も割けない。取りに行ける距離と期限が合うかが要点。
            </p>
          </div>
        </div>
      </section>

      {/* F4 · step sequence */}
      <section className="rule-top">
        <div className="wrap py-[var(--space-2xl)]">
          <p className="eyebrow">リレーの流れ</p>
          <h2 className="heading mt-[var(--space-2xs)]">登録から引き渡しまで 4 段</h2>
          <ol className="mt-[var(--space-lg)]">
            {FLOW.map((s) => (
              <li
                key={s.step}
                className="grid gap-x-[var(--space-md)] gap-y-[var(--space-3xs)] border-t border-line py-[var(--space-md)] sm:grid-cols-[4rem_minmax(0,18rem)_minmax(0,1fr)] sm:items-baseline"
              >
                <span className="num text-sm text-relay">{s.step}</span>
                <h3 className="subheading">{s.title}</h3>
                <p className="text-sm text-slate-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Ft5 · statement */}
      <footer className="rule-top">
        <div className="wrap py-[var(--space-2xl)]">
          <p className="max-w-[42ch] text-lg text-slate-200">
            まだ使えて、譲る意思のある資産が、期限だけを理由に廃棄されない状態をつくる。
          </p>
          <div className="mt-[var(--space-xl)] flex flex-wrap items-baseline justify-between gap-[var(--space-sm)] border-t border-line pt-[var(--space-sm)]">
            <span className="wordmark">Office Relay</span>
            <p className="max-w-[68ch] text-xs text-slate-500">
              譲渡意思のある企業資産を廃棄決定前に次の利用者へ移転することを仲介します。プラットフォーム自身は資産の所有権を取得しません。
              家電リサイクル法・産業廃棄物処理法の対象品目は現時点では取り扱わず、対応は今後のリリースで予定しています。
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
