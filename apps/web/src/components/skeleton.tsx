'use client';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden />;
}

export function DashboardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-dashboard" aria-busy="true" aria-label="Loading">
      <div className="skeleton-hero">
        <Skeleton className="skeleton-line skeleton-line-lg" />
        <Skeleton className="skeleton-line skeleton-line-md" />
      </div>
      <div className="skeleton-tabs">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="skeleton-chip" />
        ))}
      </div>
      <div className="skeleton-panel">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton-row">
            <Skeleton className="skeleton-avatar" />
            <div className="skeleton-row-copy">
              <Skeleton className="skeleton-line skeleton-line-md" />
              <Skeleton className="skeleton-line skeleton-line-sm" />
            </div>
            <Skeleton className="skeleton-chip" />
          </div>
        ))}
      </div>
    </div>
  );
}
