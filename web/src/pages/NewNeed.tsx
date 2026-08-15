import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { recomputeMatches } from "../lib/rpc";
import { CATEGORIES, LOCATIONS, ewkt } from "../lib/types";

export function NewNeed() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [quantity, setQuantity] = useState(1);
  const [maxDistance, setMaxDistance] = useState(25);
  const [neededAt, setNeededAt] = useState("");
  const [locationIndex, setLocationIndex] = useState(0);
  const [serviceOffer, setServiceOffer] = useState("");
  const [serviceOfferDetail, setServiceOfferDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      const place = LOCATIONS[locationIndex];
      const need = await supabase
        .from("needs")
        .insert({
          org_id: org.id,
          title,
          description: description || null,
          category,
          quantity,
          max_distance_km: maxDistance,
          latest_needed_at: neededAt ? new Date(neededAt).toISOString() : null,
          location: ewkt(place.lng, place.lat),
        })
        .select("id")
        .single();
      if (need.error) throw need.error;

      if (serviceOffer.trim()) {
        await supabase.from("service_offers").insert({
          org_id: org.id,
          title: serviceOffer.trim(),
          description: serviceOfferDetail || null,
        });
      }

      await recomputeMatches({ needId: need.data.id });
      navigate("/app/matches");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mx-auto max-w-2xl space-y-4" onSubmit={(e) => void submit(e)}>
      <header>
        <p className="tag tag-accent">Startup</p>
        <h1 className="heading mt-[var(--space-2xs)]">必要な資産の登録</h1>
        <p className="mt-1 text-sm text-slate-400">
          言い方が違っても pgvector が意味で拾います (例:「オフィス机」で「エグゼクティブデスク W1600」に当たる)。
        </p>
      </header>

      <section className="card space-y-3">
        <div>
          <label className="label" htmlFor="need-title">
            欲しい物
          </label>
          <input
            id="need-title"
            required
            className="input"
            placeholder="オフィス机"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="need-description">
            用途・条件
          </label>
          <textarea
            id="need-description"
            rows={3}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-[var(--space-xs)] md:grid-cols-[repeat(3,minmax(0,1fr))]">
          <div>
            <label className="label" htmlFor="need-category">
              カテゴリ
            </label>
            <select
              id="need-category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="need-quantity">
              必要数
            </label>
            <input
              id="need-quantity"
              type="number"
              min={1}
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="need-distance">
              許容距離 (km)
            </label>
            <input
              id="need-distance"
              type="number"
              min={1}
              className="input"
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid gap-[var(--space-xs)] md:grid-cols-[repeat(2,minmax(0,1fr))]">
          <div>
            <label className="label" htmlFor="need-when">
              必要日時
            </label>
            <input
              id="need-when"
              type="datetime-local"
              className="input"
              value={neededAt}
              onChange={(e) => setNeededAt(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="need-location">
              受取拠点
            </label>
            <select
              id="need-location"
              className="input"
              value={locationIndex}
              onChange={(e) => setLocationIndex(Number(e.target.value))}
            >
              {LOCATIONS.map((l, i) => (
                <option key={l.label} value={i}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <p className="label">提供できるサービス (任意)</p>
          <p className="mb-2 text-xs text-slate-500">
            譲渡企業が欲しいサービスと突き合わせて ServiceFit になります。
          </p>
          <input
            className="input"
            placeholder="生成AI導入の社内ハンズオン"
            value={serviceOffer}
            onChange={(e) => setServiceOffer(e.target.value)}
          />
        </div>
        <textarea
          rows={2}
          className="input"
          placeholder="内容の補足"
          value={serviceOfferDetail}
          onChange={(e) => setServiceOfferDetail(e.target.value)}
        />
      </section>

      {error && <p className="text-sm text-alert">{error}</p>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "登録中..." : "登録してマッチを再計算"}
      </button>
    </form>
  );
}
