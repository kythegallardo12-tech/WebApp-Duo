import { useState, useEffect, useRef, useCallback } from 'react';
import { simulateApiWithProgress } from '../utils/mockApi';

/**
 * Smart Loading Hook
 * Implements the loading strategy:
 * - Under 1s: Show nothing (content appears instantly)
 * - 1s to 10s: Show skeleton of the page
 * - Over 10s: Show progress bar with time remaining
 */
export const useSmartLoader = (fetchFn, deps = []) => {
  const [data, setData] = useState(null);
  const [loadingState, setLoadingState] = useState('idle'); // idle | skeleton | progress | done | error
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(null);
  const skeletonTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const isMounted = useRef(true);

  const execute = useCallback(async () => {
    setError(null);
    setProgress(0);
    setTimeLeft(0);

    // Start with 'idle' - show nothing for first 1s
    setLoadingState('idle');

    // After 1s, switch to skeleton if still loading
    skeletonTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        setLoadingState('skeleton');
      }
    }, 1000);

    // After 10s, switch to progress if still loading
    progressTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        setLoadingState('progress');
      }
    }, 10000);

    try {
      const result = await fetchFn((prog, remaining) => {
        if (isMounted.current) {
          setProgress(Math.round(prog * 100));
          setTimeLeft(Math.max(0, Math.round(remaining / 1000)));
        }
      });

      if (isMounted.current) {
        clearTimeout(skeletonTimerRef.current);
        clearTimeout(progressTimerRef.current);
        setData(result);
        setLoadingState('done');
      }
    } catch (err) {
      if (isMounted.current) {
        clearTimeout(skeletonTimerRef.current);
        clearTimeout(progressTimerRef.current);
        setError(err);
        setLoadingState('error');
      }
    }
  }, [fetchFn]);

  useEffect(() => {
    isMounted.current = true;
    execute();

    return () => {
      isMounted.current = false;
      clearTimeout(skeletonTimerRef.current);
      clearTimeout(progressTimerRef.current);
    };
  }, deps);

  return {
    data,
    setData,
    loadingState,
    progress,
    timeLeft,
    error,
    refetch: execute,
    isLoading: loadingState !== 'done' && loadingState !== 'error',
  };
};
