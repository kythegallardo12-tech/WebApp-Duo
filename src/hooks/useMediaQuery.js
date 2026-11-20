import { useCallback, useSyncExternalStore } from 'react';

/** True while the media query matches; re-renders when it changes (e.g. rotating a phone). */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Phones: the workspace shows card rows instead of wide tables below this width. */
export const useCompact = () => useMediaQuery('(max-width: 639px)');
