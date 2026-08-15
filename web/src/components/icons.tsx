// フッタータブと出品フローで同じ絵柄を使うため、アイコンはここに集約する。
const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

type IconProps = { className?: string; strokeWidth?: number };

export function ExploreIcon({ className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h6l5 5v8.5A2.5 2.5 0 0 1 15 20H6.5A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M20 7v9" />
    </svg>
  );
}

export function HomeIcon({ className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function SearchIcon({ className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function MatchIcon({ className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" />
    </svg>
  );
}

export function AccountIcon({ className = "h-5 w-5", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  );
}

export function CameraIcon({ className = "h-6 w-6", strokeWidth = 2 }: IconProps) {
  return (
    <svg {...BASE} className={className} strokeWidth={strokeWidth}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.9l1.2-2h6.8l1.2 2h1.9A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
