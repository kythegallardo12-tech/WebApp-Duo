import { AlertTriangle, WifiOff } from 'lucide-react';
import ProgressLoader from './ProgressLoader';
import { SkeletonStats, SkeletonTable, SkeletonProductGrid, SkeletonCard } from './SkeletonLoader';

/**
 * SmartLoadingWrapper — tiered loading for real API requests.
 * Under 1s: nothing | 1–10s: content-shaped skeleton | over 10s: progress (or indeterminate).
 * Errors are shown honestly with a retry; there is no silent fallback to sample data.
 */
const SmartLoadingWrapper = ({
  loadingState,
  progress = null,
  timeLeft = null,
  error = null,
  onRetry,
  skeletonType = 'card',
  skeletonCount = 4,
  children,
  message = 'Loading...',
}) => {
  if (loadingState === 'done') return children;

  if (loadingState === 'error') {
    const offline = error?.kind === 'network';
    const Icon = offline ? WifiOff : AlertTriangle;
    return (
      <div className="glass-card p-8 text-center border border-rose-500/20" role="alert">
        <Icon size={32} className="mx-auto text-rose-400 mb-3" />
        <h4 className="text-base font-bold text-white">{offline ? 'Cannot reach the server' : 'Could not load this data'}</h4>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{error?.message || 'Something went wrong.'}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-primary mt-5 px-5 py-2.5 text-sm font-semibold">
            Try again
          </button>
        )}
      </div>
    );
  }

  if (loadingState === 'idle') return <div className="min-h-[200px]" aria-busy="true" />;

  if (loadingState === 'progress') {
    return <ProgressLoader progress={progress} timeLeft={timeLeft} message={message} />;
  }

  const skeletonMap = {
    stats: <SkeletonStats count={skeletonCount} />,
    table: <SkeletonTable rows={skeletonCount} cols={5} />,
    grid: <SkeletonProductGrid count={skeletonCount} />,
    card: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    ),
  };

  return (
    <div aria-busy="true" aria-label="Loading" data-testid="skeleton">
      {skeletonMap[skeletonType] || skeletonMap.card}
    </div>
  );
};

export default SmartLoadingWrapper;
