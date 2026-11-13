import { Cloud, CloudOff, WifiOff, ShieldAlert } from 'lucide-react';
import useStore from '../../store/useStore';

/**
 * Global save status for optimistic changes.
 * "Saved" is shown only after the server has confirmed every pending change.
 * No spinner: an unobtrusive pulsing dot marks work in progress.
 */
const SyncIndicator = () => {
  const sync = useStore((s) => s.sync);
  const clear = useStore((s) => s.clearSyncError);

  if (sync.inFlight > 0) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] text-xs" role="status" aria-live="polite" data-testid="sync-status">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
        <span>Saving…</span>
      </div>
    );
  }

  if (sync.error) {
    const Icon = sync.error.kind === 'network' ? WifiOff : sync.error.kind === 'conflict' ? ShieldAlert : CloudOff;
    const label = {
      network: 'Offline — not saved',
      conflict: 'Conflict — refreshed',
      validation: 'Not saved',
      forbidden: 'Not allowed',
    }[sync.error.kind] || 'Not saved';
    return (
      <button
        onClick={clear}
        title={sync.error.message}
        className="flex items-center gap-2 text-rose-400 text-xs hover:text-rose-300"
        role="status"
        aria-live="polite"
        data-testid="sync-status"
      >
        <Icon size={14} />
        <span>{label}</span>
      </button>
    );
  }

  if (sync.lastSavedAt) {
    return (
      <div className="flex items-center gap-2 text-emerald-400/70 text-xs" role="status" aria-live="polite" data-testid="sync-status">
        <Cloud size={14} />
        <span>All changes saved</span>
      </div>
    );
  }
  return null;
};

export default SyncIndicator;
