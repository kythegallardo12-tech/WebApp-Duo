import ProgressLoader from './ProgressLoader';
import { SkeletonStats, SkeletonTable, SkeletonProductGrid, SkeletonCard } from './SkeletonLoader';

/**
 * SmartLoadingWrapper - Implements the tiered loading strategy
 * Under 1s: show nothing (renders children or null)
 * 1-10s: show skeleton placeholder matching content shape
 * Over 10s: show progress bar with time remaining
 * 
 * Applies: Feedback principle, Jakob's Law (content-shaped loaders)
 */
const SmartLoadingWrapper = ({
  loadingState,
  progress,
  timeLeft,
  skeletonType = 'card', // 'stats' | 'table' | 'grid' | 'card'
  skeletonCount = 4,
  children,
  message = 'Loading...',
}) => {
  // Done or error: render children
  if (loadingState === 'done' || loadingState === 'error') {
    return children;
  }

  // Under 1s (idle): show nothing — content will appear instantly
  if (loadingState === 'idle') {
    return <div className="min-h-[200px]" />;
  }

  // Over 10s: show progress bar with time remaining
  if (loadingState === 'progress') {
    return <ProgressLoader progress={progress} timeLeft={timeLeft} message={message} />;
  }

  // 1s to 10s (skeleton): show content-shaped skeleton
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

  return skeletonMap[skeletonType] || skeletonMap.card;
};

export default SmartLoadingWrapper;
