import { useEffect, useState } from "react";
import { publicMediaUrl } from "../lib/supabase";

type Props = {
  /** item_media.storage_path。null / undefined なら最初から placeholder。 */
  storagePath?: string | null;
  alt: string;
  /** img と placeholder の両方に当てる寸法・角丸クラス。 */
  className: string;
  width: number;
  height: number;
  /** placeholder に出す文言。空文字なら枠だけ。 */
  label?: string;
  eager?: boolean;
};

/**
 * item_media の行があっても Storage に実ファイルが無いことがある
 * (seed が行だけを入れる、アップロード途中で失敗した等)。壊れた画像アイコンの
 * 代わりに「写真なし」の placeholder を出す。
 */
export function ItemPhoto({ storagePath, alt, className, width, height, label, eager }: Props) {
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [storagePath]);

  if (!storagePath || broken) {
    return (
      <div
        className={`flex items-center justify-center border border-line text-xs text-slate-500 ${className}`}
      >
        {label ?? "写真なし"}
      </div>
    );
  }

  return (
    <img
      src={publicMediaUrl(storagePath)}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      onError={() => setBroken(true)}
      className={`object-cover ${className}`}
    />
  );
}
