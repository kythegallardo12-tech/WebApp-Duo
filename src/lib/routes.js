/** Route constants shared by the router, links and tests. */
export const ROUTES = {
  home: '/',
  signIn: '/signin',
  app: '/app',
  products: '/app/products',
  inventory: '/app/inventory',
  orders: '/app/orders',
  analytics: '/app/analytics',
  settings: '/app/settings',
};

/** Pre-redesign workspace paths that now live under /app. Old bookmarks keep working. */
export const LEGACY_PATHS = ['products', 'inventory', 'orders', 'analytics', 'settings'];

/**
 * Where to go after signing in. Only same-site workspace paths are accepted, so a crafted
 * `from` can never send the user to another site or back to the sign-in page.
 */
export function postSignInPath(from) {
  const path = typeof from === 'string' ? from : from && typeof from.pathname === 'string'
    ? `${from.pathname}${from.search || ''}${from.hash || ''}`
    : null;
  if (!path) return ROUTES.app;
  if (!path.startsWith('/app')) return ROUTES.app;
  if (path.startsWith('//') || path.includes('\\')) return ROUTES.app;
  if (path !== '/app' && !path.startsWith('/app/') && !path.startsWith('/app?') && !path.startsWith('/app#')) return ROUTES.app;
  return path;
}
