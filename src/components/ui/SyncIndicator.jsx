import { Cloud, CloudOff, Loader2 } from 'lucide-react';

/**
 * SyncIndicator - Shows background sync status for optimistic updates
 * Applies: Feedback principle (user knows their changes are being saved)
 */
const SyncIndicator = ({ isSyncing, syncErrors = [] }) => {
  if (syncErrors.length > 0) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-xs">
        <CloudOff size={14} />
        <span>Sync error</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs">
        <Loader2 size={14} className="animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-emerald-400/60 text-xs">
      <Cloud size={14} />
      <span>Saved</span>
    </div>
  );
};

export default SyncIndicator;
