// スピナーではなくスケルトン (レイアウトが飛ばない / §3.7)
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-line ${className}`} />;
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-[var(--space-md)] md:grid-cols-[repeat(3,minmax(0,1fr))]">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}
