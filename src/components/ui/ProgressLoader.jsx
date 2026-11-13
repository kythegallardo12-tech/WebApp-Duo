import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * ProgressLoader — shown when loading takes longer than 10 seconds.
 * With measurable progress it shows a percentage and time remaining.
 * Without it, it shows an honest indeterminate bar (no invented numbers).
 */
const ProgressLoader = ({ progress = null, timeLeft = null, message = 'Loading data...' }) => {
  const containerRef = useRef(null);
  const barRef = useRef(null);
  const known = Number.isFinite(progress);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }
  }, []);

  useEffect(() => {
    if (known && barRef.current) {
      gsap.to(barRef.current, { width: `${progress}%`, duration: 0.3, ease: 'power2.out' });
    }
  }, [progress, known]);

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center justify-center py-16 px-4" role="status" aria-live="polite">
      <div className="glass-card p-8 max-w-md w-full text-center">
        <p className="text-[var(--color-text-primary)] font-medium mb-2">{message}</p>
        <p className="text-[var(--color-text-muted)] text-sm mb-6">
          {known && Number.isFinite(timeLeft) && timeLeft > 0
            ? `About ${formatTime(timeLeft)} remaining`
            : 'This is taking longer than usual. Time remaining is unknown — still waiting for the server.'}
        </p>

        <div
          className="progress-bar mb-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={known ? progress : undefined}
          aria-label={known ? `${progress}% complete` : 'Loading, progress unknown'}
        >
          {known ? (
            <div ref={barRef} className="progress-bar-fill" style={{ width: '0%' }} />
          ) : (
            <div className="progress-bar-indeterminate" />
          )}
        </div>

        {known && <p className="text-[var(--color-text-muted)] text-xs">{progress}% complete</p>}
      </div>
    </div>
  );
};

export default ProgressLoader;
