import { AlertTriangle, WifiOff } from 'lucide-react';
import ProgressLoader from './ProgressLoader';
import { SkeletonStats, SkeletonTable, SkeletonProductGrid, SkeletonCard } from './SkeletonLoader';

/**
 * Tiered loading for real API requests.
 * Under 1 s: nothing | 1–10 s: content-shaped skeleton | over 10 s: progress (or indeterminate).
 * Errors are shown with a retry; there is no silent fallback to sample data.
 */
export const LoadError = ({ error, onRetry, compact = false }) => {
  const offline = error?.kind === 'network';
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div className={`card text-center ${compact ? 'p-5' : 'px-6 py-10'}`} role="alert">
      <span className="mx-auto mb-3 flex w-10 h-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-ink">{offline ? 'Cannot reach the server' : 'Could not load this data'}</h2>
      <p className="text-sm text-ink-2 mt-1 max-w-md mx-auto">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary mt-5">
          Try again
        </button>
      )}
    </div>
  );
};

const SmartLoadingWrapper = ({
  loadingState,
  progress = null,
  timeLeft = null,
  error = null,
  onRetry,
  skeletonType = 'card',
  skeletonCount = 4,
  children,
  message = 'Loading…',
}) => {
  if (loadingState === 'done') return children;
  if (loadingState === 'error') return <LoadError error={error} onRetry={onRetry} />;
  if (loadingState === 'idle') return <div className="min-h-[12rem]" aria-busy="true" />;
  if (loadingState === 'progress') return <ProgressLoader progress={progress} timeLeft={timeLeft} message={message} />;

  const skeletons = {
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
      {skeletons[skeletonType] || skeletons.card}
    </div>
  );
};

export default SmartLoadingWrapper;
