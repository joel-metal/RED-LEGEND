interface Props { className?: string; count?: number }

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse bg-brand-border rounded ${className}`} />;
}

export function VaultCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-9 w-28 mt-2" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => <VaultCardSkeleton key={i} />)}
    </div>
  );
}
