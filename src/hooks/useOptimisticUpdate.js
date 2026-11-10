import { useState, useCallback, useRef } from 'react';

/**
 * Optimistic Update Hook
 * "Update first, sync later" - a tap updates the UI immediately,
 * then syncs to server in background. No waiting.
 */
export const useOptimisticUpdate = () => {
  const [pendingSyncs, setPendingSyncs] = useState(0);
  const [syncErrors, setSyncErrors] = useState([]);
  const syncQueueRef = useRef([]);

  const execute = useCallback(async ({ localUpdate, serverSync, rollback }) => {
    // Step 1: Apply local update immediately (user sees instant feedback)
    localUpdate();
    setPendingSyncs((prev) => prev + 1);

    // Step 2: Queue and execute server sync in background
    const syncPromise = (async () => {
      try {
        // Simulate server delay
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
        await serverSync?.();
        setPendingSyncs((prev) => Math.max(0, prev - 1));
        return { success: true };
      } catch (error) {
        // Rollback on failure
        rollback?.();
        setPendingSyncs((prev) => Math.max(0, prev - 1));
        setSyncErrors((prev) => [...prev, { error, timestamp: Date.now() }]);
        return { success: false, error };
      }
    })();

    syncQueueRef.current.push(syncPromise);
    return syncPromise;
  }, []);

  const clearErrors = useCallback(() => {
    setSyncErrors([]);
  }, []);

  return {
    execute,
    pendingSyncs,
    syncErrors,
    clearErrors,
    isSyncing: pendingSyncs > 0,
  };
};
