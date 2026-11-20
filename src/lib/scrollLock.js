/**
 * Reference-counted page scroll lock.
 *
 * Several overlays can be open at once (a sheet with a confirmation on top, the mobile drawer).
 * Each one takes a lock and releases it exactly once; the page scrolls again only when the
 * last lock is released. Releasing is idempotent, so an unmount after a close is harmless.
 * The lock is a single attribute on <html> (see index.css), never an inline overflow style
 * that a stale cleanup could leave behind.
 */
let holders = 0;

const root = () => (typeof document === 'undefined' ? null : document.documentElement);

export function lockScroll() {
  holders += 1;
  if (holders === 1) root()?.setAttribute('data-scroll-locked', '');
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) root()?.removeAttribute('data-scroll-locked');
  };
}

export function isScrollLocked() {
  return holders > 0;
}

/** Test helper: forget every holder and unlock. */
export function resetScrollLock() {
  holders = 0;
  root()?.removeAttribute('data-scroll-locked');
}
