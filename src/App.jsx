import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Wordmark from './components/brand/Wordmark';
import ServerUnavailable from './components/ServerUnavailable';
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import OrdersPage from './pages/OrdersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import useAuth from './store/useAuth';
import useStore from './store/useStore';
import { ROUTES, LEGACY_PATHS } from './lib/routes';
import { releaseAllScrollLocks } from './lib/scrollLock';

/** Checks the session once for every route and clears workspace data after sign-out. */
function SessionBootstrap() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const resetWorkspace = useStore((s) => s.resetWorkspace);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === 'signedOut') resetWorkspace();
  }, [status, resetWorkspace]);

  return null;
}

/**
 * New page → start at the top (instantly, never animated). A #fragment scrolls to its target.
 * A route change also clears any scroll lock an overlay failed to release.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    releaseAllScrollLocks();
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Only the path matters here; same-page #links are handled natively by the browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}

/** Workspace routes require a session; signed-out visitors go to sign-in and come back after. */
function RequireAuth({ children }) {
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'checking') return <div className="min-h-dvh bg-canvas" aria-busy="true" />;
  if (status === 'offline') return <ServerUnavailable />;
  if (status !== 'signedIn') return <Navigate to={ROUTES.signIn} replace state={{ from: location }} />;
  return children;
}

function LegacyRedirect({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6 text-center bg-canvas">
      <Link to={ROUTES.home} className="text-xl rounded-md">
        <Wordmark />
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="text-ink-2 mt-2">The address may be mistyped, or the page has moved.</p>
      </div>
      <Link to={ROUTES.home} className="btn btn-secondary">
        Go to the home page
      </Link>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SessionBootstrap />
      <ScrollManager />
      <Routes>
        <Route path={ROUTES.home} element={<LandingPage />} />
        <Route path={ROUTES.signIn} element={<SignInPage />} />
        <Route path="/login" element={<LegacyRedirect to={ROUTES.signIn} />} />
        <Route
          path={ROUTES.app}
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={ROUTES.app} replace />} />
        </Route>
        {LEGACY_PATHS.map((p) => (
          <Route key={p} path={`/${p}`} element={<LegacyRedirect to={`${ROUTES.app}/${p}`} />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
