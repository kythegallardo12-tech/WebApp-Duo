/**
 * Shown when loading takes longer than 10 seconds.
 * With measurable progress it shows a percentage and time remaining; without it, an honest
 * indeterminate bar (no invented numbers).
 */
const formatTime = (seconds) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

const ProgressLoader = ({ progress = null, timeLeft = null, message = 'Loading…' }) => {
  const known = Number.isFinite(progress);
  return (
    <div className="flex justify-center py-12 px-4" role="status" aria-live="polite">
      <div className="card p-6 w-full max-w-md text-center">
        <p className="text-sm font-semibold text-ink">{message}</p>
        <p className="text-sm text-ink-2 mt-1 mb-5">
          {known && Number.isFinite(timeLeft) && timeLeft > 0
            ? `About ${formatTime(timeLeft)} remaining`
            : 'This is taking longer than usual. Time remaining is unknown — still waiting for the server.'}
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={known ? progress : undefined}
          aria-label={known ? `${progress}% complete` : 'Loading, progress unknown'}
        >
          {known ? <div className="progress-fill" style={{ width: `${progress}%` }} /> : <div className="progress-indeterminate" />}
        </div>
        {known && <p className="text-xs text-ink-3 mt-2">{progress}% complete</p>}
      </div>
    </div>
  );
};

export default ProgressLoader;
