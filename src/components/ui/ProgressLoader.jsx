import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * ProgressLoader - Shows progress bar with time remaining
 * Used when loading takes > 10 seconds
 * Applies: Feedback principle, Peak-end rule (show progress toward completion)
 */
const ProgressLoader = ({ progress = 0, timeLeft = 0, message = 'Loading data...' }) => {
  const containerRef = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, []);

  useEffect(() => {
    if (barRef.current) {
      gsap.to(barRef.current, {
        width: `${progress}%`,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, [progress]);

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center justify-center py-16 px-4">
      <div className="glass-card p-8 max-w-md w-full text-center">
        {/* Animated icon */}
        <div className="mb-6 relative">
          <div className="w-16 h-16 mx-auto rounded-full border-2 border-[var(--color-accent)]/30 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-blue-400 opacity-60 animate-pulse" />
          </div>
        </div>

        <p className="text-[var(--color-text-primary)] font-medium mb-2">{message}</p>
        <p className="text-[var(--color-text-muted)] text-sm mb-6">
          {timeLeft > 0 ? `About ${formatTime(timeLeft)} remaining` : 'Almost there...'}
        </p>

        {/* Progress bar */}
        <div className="progress-bar mb-3">
          <div ref={barRef} className="progress-bar-fill" style={{ width: '0%' }} />
        </div>

        <p className="text-[var(--color-text-muted)] text-xs">{progress}% complete</p>
      </div>
    </div>
  );
};

export default ProgressLoader;
