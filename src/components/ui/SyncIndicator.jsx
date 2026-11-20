import { Check, CloudOff, WifiOff, ShieldAlert } from 'lucide-react';
import useStore from '../../store/useStore';

/**
 * Global save status for optimistic changes.
 * "All changes saved" appears only after the server has confirmed every pending change.
 */
const SyncIndicator = () => {
  const sync = useStore((s) => s.sync);
  const clear = useStore((s) => s.clearSyncError);

  if (sync.inFlight > 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-2" role="status" aria-live="polite" data-testid="sync-status">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
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
        type="button"
        onClick={clear}
        title={`${sync.error.message} (click to dismiss)`}
        className="flex items-center gap-1.5 text-xs font-medium text-danger rounded-md px-1.5 py-1 hover:bg-danger-soft"
        role="status"
        aria-live="polite"
        data-testid="sync-status"
      >
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }

  if (sync.lastSavedAt) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-ink-3" role="status" aria-live="polite" data-testid="sync-status">
        <Check size={14} className="text-success" aria-hidden="true" />
        <span>All changes saved</span>
      </div>
    );
  }
  return null;
};

export default SyncIndicator;
