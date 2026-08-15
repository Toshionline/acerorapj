import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { CameraIcon } from "../components/icons";
import { ITEM_MEDIA_BUCKET, supabase } from "../lib/supabase";
import { shrinkToJpeg } from "../lib/images";
import { extractItemFromPhoto, recomputeMatches } from "../lib/rpc";
import { CATEGORIES, LOCATIONS, ewkt } from "../lib/types";

const CONDITIONS = [
  { value: "excellent", label: "美品" },
  { value: "good", label: "良好" },
  { value: "fair", label: "使用感あり" },
];

// 解析中のプレースホルダ (1行分)
function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span className={`block h-3 animate-pulse rounded bg-line ${className}`} />
  );
}

export function NewItem() {
  const { org } = useAuth();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  // 撮り直し時に古い解析結果を捨てるための連番
  const prefillSeqRef = useRef(0);
  // 品名を利用者が手で直したか (直していなければ撮り直しで更新する)
  const titleEditedRef = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState("good");
  const [deadline, setDeadline] = useState("");
  const [locationIndex, setLocationIndex] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [serviceWant, setServiceWant] = useState("");
  const [serviceWantDetail, setServiceWantDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // デスクトップのドラッグ&ドロップ受け入れ表示
  const [dropping, setDropping] = useState(false);

  // プレビューの object URL は差し替え時に前の URL だけを revoke する。
  // effect の cleanup で revoke すると、描画に使われている URL を
  // 開放してしまい img の読み込みが失敗する。
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => () => releasePreview(), []);

  function releasePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }

  async function choosePhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイル（JPEG / PNG / HEIC など）を選んでください。");
      return;
    }
    setError(null);
    releasePreview();
    previewUrlRef.current = URL.createObjectURL(file);
    setPreview(previewUrlRef.current);
    setPhoto(file);
    setPrefilled(false);
    await prefillFromPhoto(file);
  }

  // 写真を選んだ直後に前埋めを試す (失敗しても手入力で完了できる / P2-B2)
  async function prefillFromPhoto(file: File) {
    if (!org) return;
    const seq = ++prefillSeqRef.current;
    const isLatest = () => seq === prefillSeqRef.current;
    setAnalyzing(true);
    try {
      const shrunk = await shrinkToJpeg(file);
      const path = `${org.id}/drafts/${Date.now()}-${shrunk.name}`;
      const upload = await supabase.storage
        .from(ITEM_MEDIA_BUCKET)
        .upload(path, shrunk, { contentType: shrunk.type, upsert: true });
      if (upload.error) return;
      const guess = await extractItemFromPhoto(path);
      if (!guess || !isLatest()) return;
      // 解析が全項目 null (キー未設定・タイムアウト・読み取り不能) のときに
      // 「前埋めしました」と出すと、空欄のままの品名を埋めたと誤解させる
      let applied = false;
      const guessedTitle = guess.title;
      if (guessedTitle && !titleEditedRef.current) {
        setTitle(guessedTitle);
        applied = true;
      }
      if (
        guess.category &&
        CATEGORIES.some((c) => c.value === guess.category)
      ) {
        setCategory(guess.category);
        applied = true;
      }
      if (guess.quantity) {
        setQuantity(guess.quantity);
        applied = true;
      }
      if (guess.condition) {
        setCondition(guess.condition);
        applied = true;
      }
      setPrefilled(applied);
    } catch {
      // 解析は補助機能なので失敗しても手入力を継続させる
    } finally {
      if (isLatest()) setAnalyzing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !photo) return;
    const deadlineDate = new Date(deadline);
    if (!deadline || Number.isNaN(deadlineDate.getTime())) {
      setError("撤去期限を正しい日時で入力してください");
      return;
    }
    if (deadlineDate.getTime() <= Date.now()) {
      setError("撤去期限には現在より後の日時を入力してください");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("数量は 1 以上の整数で入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const place = LOCATIONS[locationIndex];
      const item = await supabase
        .from("items")
        .insert({
          owner_org_id: org.id,
          title,
          description: description || null,
          category,
          quantity,
          condition,
          pickup_deadline: deadlineDate.toISOString(),
          location: ewkt(place.lng, place.lat),
        })
        .select("id")
        .single();
      if (item.error) throw item.error;

      const shrunk = await shrinkToJpeg(photo);
      const path = `${org.id}/${item.data.id}/${Date.now()}-${shrunk.name}`;
      const upload = await supabase.storage
        .from(ITEM_MEDIA_BUCKET)
        .upload(path, shrunk, { contentType: shrunk.type, upsert: true });
      if (upload.error) throw upload.error;
      const media = await supabase
        .from("item_media")
        .insert({ item_id: item.data.id, storage_path: path });
      if (media.error) throw media.error;

      if (serviceWant.trim()) {
        await supabase.from("service_wants").insert({
          org_id: org.id,
          title: serviceWant.trim(),
          description: serviceWantDetail || null,
        });
      }

      await recomputeMatches({ itemId: item.data.id });
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const pickers = (
    <>
      <input
        ref={cameraRef}
        id="photo"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void choosePhoto(e.target.files?.[0] ?? null)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void choosePhoto(e.target.files?.[0] ?? null)}
      />
    </>
  );

  // ステップ1: 撮影 / 写真選択だけを全面に出す
  if (!photo) {
    return (
      <div className="pb-footer space-y-5 md:mx-auto md:max-w-2xl">
        {pickers}
        <header>
          <p className="tag border-relay text-relay">Donor</p>
          <h1 className="mt-3 text-2xl font-black tracking-tightest">
            写真から出品
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            まず1枚撮るだけ。品名やカテゴリは写真から自動で埋めます。
          </p>
        </header>

        <button
          type="button"
          className={`flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-panel text-slate-300 transition active:scale-[0.99] md:aspect-[16/9] ${
            dropping ? "border-relay" : "border-line"
          }`}
          onClick={() => cameraRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            void choosePhoto(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-relay text-ink">
            <CameraIcon className="h-9 w-9" />
          </span>
          <span className="text-base font-black text-slate-100">撮影する</span>
          <span className="text-xs text-slate-500">
            <span className="md:hidden">カメラが起動します</span>
            <span className="hidden md:inline">
              カメラが起動します / 写真をここにドラッグしても登録できます
            </span>
          </span>
        </button>

        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => libraryRef.current?.click()}
        >
          ライブラリから選ぶ
        </button>

        {error && <p className="text-sm text-alert">{error}</p>}

        <p className="text-xs text-slate-500">
          撤去期限を入れるほど UrgencyFit
          が上がり、期限前の引取先が見つかりやすくなります。
        </p>
      </div>
    );
  }

  // ステップ2-3: 前埋め結果を確認して微修正 → 出品
  return (
    <form
      className="mx-auto max-w-2xl space-y-4"
      onSubmit={(e) => void submit(e)}
    >
      {pickers}

      <header>
        <p className="tag tag-accent">Donor</p>
        <h1 className="heading mt-[var(--space-2xs)]">余剰資産の登録</h1>
        <p className="mt-1 text-sm text-slate-400">
          写真は必須です。撤去期限を入れるほど UrgencyFit
          が上がり、期限前の引取先が見つかりやすくなります。
        </p>
      </header>

      <section className="card-flush -mx-5 overflow-hidden sm:mx-0 sm:rounded-lg sm:border">
        {preview && (
          <img
            src={preview}
            alt="登録する資産のプレビュー"
            className="photo-square"
          />
        )}
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-slate-400">
            {analyzing
              ? "写真を解析中..."
              : prefilled
                ? "写真から前埋めしました"
                : "手入力で登録できます"}
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => cameraRef.current?.click()}
          >
            撮り直す
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label" htmlFor="title">
            品名 (必須)
          </label>
          {analyzing && !title ? (
            <SkeletonLine className="mt-2 w-2/3" />
          ) : (
            <input
              id="title"
              required
              className="input"
              placeholder="エグゼクティブデスク W1600"
              value={title}
              onChange={(e) => {
                // 空にしたら前埋め可能な状態に戻す
                titleEditedRef.current = e.target.value.trim().length > 0;
                setTitle(e.target.value);
              }}
            />
          )}
        </div>

        <div>
          <label className="label" htmlFor="deadline">
            撤去期限 (必須)
          </label>
          <input
            id="deadline"
            type="datetime-local"
            required
            className="input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="location">
            引取拠点 (必須)
          </label>
          <select
            id="location"
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
      </section>

      <details className="card">
        <summary className="section-title cursor-pointer list-none">
          詳細を編集 (説明・数量・状態・欲しいサービス)
        </summary>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="description">
              説明
            </label>
            <textarea
              id="description"
              rows={3}
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-[var(--space-xs)] md:grid-cols-[repeat(3,minmax(0,1fr))]">
            <div>
              <label className="label" htmlFor="category">
                カテゴリ
              </label>
              <select
                id="category"
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
              <label className="label" htmlFor="quantity">
                数量
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="label" htmlFor="condition">
                状態
              </label>
              <select
                id="condition"
                className="input"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="service-want">
              見返りに欲しいサービス (任意)
            </label>
            <p className="mb-2 text-xs text-slate-500">
              ServiceFit
              の対象になります。金銭ではなく、相手が提供できる支援を書いてください。
            </p>
            <input
              id="service-want"
              className="input"
              placeholder="社内向け生成AI勉強会"
              value={serviceWant}
              onChange={(e) => setServiceWant(e.target.value)}
            />
            <textarea
              rows={2}
              className="input mt-2"
              placeholder="内容の補足"
              value={serviceWantDetail}
              onChange={(e) => setServiceWantDetail(e.target.value)}
            />
          </div>
        </div>
      </details>

      {error && <p className="text-sm text-alert">{error}</p>}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy || analyzing || !photo}
      >
        {busy ? "登録中..." : "この内容で出品する"}
      </button>
    </form>
  );
}
