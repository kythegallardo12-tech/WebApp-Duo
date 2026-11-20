/**
 * Content-shaped placeholders shown while a request takes 1–10 seconds.
 */
export const SkeletonText = ({ width = '100%', height = '0.875rem', className = '' }) => (
  <div className={`skeleton ${className}`} style={{ width, height }} />
);

export const SkeletonStats = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card p-4 sm:p-5 space-y-3">
        <SkeletonText width="45%" height="0.75rem" />
        <SkeletonText width="65%" height="1.5rem" />
        <SkeletonText width="55%" height="0.625rem" />
      </div>
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 5, className = '' }) => (
  <div className={`card overflow-hidden ${className}`}>
    <div className="flex gap-4 px-5 py-3 border-b border-line">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonText key={i} width={`${100 / cols}%`} height="0.625rem" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 px-5 py-4 border-b border-line last:border-0">
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonText key={c} width={`${100 / cols}%`} />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonProductGrid = ({ count = 8, className = '' }) => (
  <div className={`grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card overflow-hidden">
        <SkeletonText height="8.5rem" className="rounded-none" />
        <div className="p-4 space-y-2.5">
          <SkeletonText width="70%" />
          <SkeletonText width="40%" height="0.75rem" />
          <SkeletonText width="55%" height="1.25rem" />
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonCard = ({ className = '' }) => (
  <div className={`card p-5 space-y-3 ${className}`}>
    <SkeletonText width="40%" height="1rem" />
    <SkeletonText width="90%" />
    <SkeletonText width="75%" />
    <SkeletonText width="60%" />
  </div>
);
