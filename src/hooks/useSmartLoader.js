import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Tiered loading for real requests:
 *  - under 1 s:  'idle'      -> render nothing extra
 *  - 1–10 s:     'skeleton'  -> content-shaped skeleton
 *  - over 10 s:  'progress'  -> progress + time remaining when the request reports
 *                               it; otherwise an honest indeterminate state.
 *
 * `fetchFn(onProgress, signal)` returns a promise. `onProgress(fraction, msRemaining)`
 * is optional; when it is never called, progress stays `null` (unknown).
 *
 * Stale responses are ignored: only the most recent request may set data.
 * When data is already on screen, a refetch keeps it visible (`refreshing`).
 */
export const useSmartLoader = (fetchFn, deps = []) => {
  const [data, setData] = useState(null);
  const [loadingState, setLoadingState] = useState('idle'); // idle | skeleton | progress | done | error
  const [progress, setProgress] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const hasData = useRef(false);
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  const execute = useCallback(async () => {
    const id = ++requestId.current;
    const controller = new AbortController();
    const timers = [];
    const isCurrent = () => id === requestId.current;

    setError(null);
    setProgress(null);
    setTimeLeft(null);
    if (hasData.current) {
      setRefreshing(true);
    } else {
      setLoadingState('idle');
      timers.push(setTimeout(() => isCurrent() && setLoadingState('skeleton'), 1000));
      timers.push(setTimeout(() => isCurrent() && setLoadingState('progress'), 10000));
    }

    try {
      const result = await fnRef.current((fraction, msRemaining) => {
        if (!isCurrent()) return;
        if (Number.isFinite(fraction)) setProgress(Math.max(0, Math.min(100, Math.round(fraction * 100))));
        if (Number.isFinite(msRemaining)) setTimeLeft(Math.max(0, Math.round(msRemaining / 1000)));
      }, controller.signal);
      if (!isCurrent()) return;
      hasData.current = true;
      setData(result);
      setLoadingState('done');
    } catch (err) {
      if (!isCurrent() || controller.signal.aborted) return;
      setError(err);
      setLoadingState(hasData.current ? 'done' : 'error');
    } finally {
      timers.forEach(clearTimeout);
      if (isCurrent()) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    execute();
    const ids = requestId;
    return () => {
      ids.current++; // invalidate in-flight request on unmount / deps change
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    setData,
    loadingState,
    progress,
    timeLeft,
    error,
    refreshing,
    refetch: execute,
    isLoading: loadingState !== 'done' && loadingState !== 'error',
  };
};
