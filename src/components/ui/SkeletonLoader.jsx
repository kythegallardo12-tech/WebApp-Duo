/**
 * SkeletonLoader - Skeleton loading states
 * No spinners! Shows content-shaped placeholders.
 * Applies: Jakob's Law (familiar loading patterns), Feedback principle
 */

export const SkeletonText = ({ width = '100%', height = '16px', className = '' }) => (
  <div
    className={`skeleton ${className}`}
    style={{ width, height, minHeight: height }}
  />
);

export const SkeletonCircle = ({ size = '40px', className = '' }) => (
  <div
    className={`skeleton ${className}`}
    style={{ width: size, height: size, borderRadius: '50%' }}
  />
);

export const SkeletonCard = ({ className = '' }) => (
  <div className={`glass-card p-6 ${className}`}>
    <div className="flex items-center gap-4 mb-4">
      <SkeletonCircle size="48px" />
      <div className="flex-1 space-y-2">
        <SkeletonText width="60%" height="14px" />
        <SkeletonText width="40%" height="12px" />
      </div>
    </div>
    <SkeletonText width="100%" height="20px" className="mb-3" />
    <SkeletonText width="80%" height="14px" className="mb-2" />
    <SkeletonText width="50%" height="14px" />
  </div>
);

export const SkeletonTable = ({ rows = 5, cols = 4, className = '' }) => (
  <div className={`glass-card p-4 ${className}`}>
    {/* Header */}
    <div className="flex gap-4 mb-4 pb-3 border-b border-white/5">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonText key={`h-${i}`} width={`${100 / cols}%`} height="12px" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div key={rowIdx} className="flex gap-4 py-3 border-b border-white/[0.03]">
        {Array.from({ length: cols }).map((_, colIdx) => (
          <SkeletonText
            key={`${rowIdx}-${colIdx}`}
            width={`${100 / cols}%`}
            height="14px"
          />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonStats = ({ count = 4, className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <SkeletonText width="100px" height="12px" />
          <SkeletonCircle size="36px" />
        </div>
        <SkeletonText width="120px" height="28px" className="mb-2" />
        <SkeletonText width="80px" height="12px" />
      </div>
    ))}
  </div>
);

export const SkeletonProductGrid = ({ count = 6, className = '' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card p-0 overflow-hidden">
        <SkeletonText width="100%" height="180px" className="!rounded-none !rounded-t-2xl" />
        <div className="p-4 space-y-2">
          <SkeletonText width="70%" height="16px" />
          <SkeletonText width="40%" height="14px" />
          <div className="flex justify-between pt-2">
            <SkeletonText width="60px" height="20px" />
            <SkeletonText width="80px" height="32px" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const SkeletonLoader = { SkeletonText, SkeletonCircle, SkeletonCard, SkeletonTable, SkeletonStats, SkeletonProductGrid };
export default SkeletonLoader;
