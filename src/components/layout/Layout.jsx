import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, MobileNav } from './Sidebar';
import ToastContainer from '../ui/Toast';
import useStore from '../../store/useStore';

/**
 * Workspace shell: sidebar on large screens, a drawer below that, and the page content.
 * Scrolling is the browser's own; nothing intercepts wheel, touch or keyboard input.
 * Loads the shared workspace data (catalog, categories, orders, settings) once signed in.
 */
const Layout = () => {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setMobileNav = useStore((s) => s.setMobileNav);
  const location = useLocation();

  useEffect(() => {
    const { loadCategories, loadProducts, loadOrders, loadSettings } = useStore.getState();
    // Errors are surfaced by each page's own loader; no fallback to sample data.
    loadCategories().catch(() => {});
    loadProducts().catch(() => {});
    loadOrders().catch(() => {});
    loadSettings().catch(() => {});
  }, []);

  // After an in-app navigation, move focus to the new page so keyboard and screen-reader users
  // start there (the first render keeps the browser's default, so Tab still reaches the skip link).
  const firstRender = useRef(true);
  useEffect(() => {
    setMobileNav(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname, setMobileNav]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] btn btn-primary"
      >
        Skip to content
      </a>
      <Sidebar />
      <MobileNav />
      <main id="main" tabIndex={-1} className={`min-w-0 outline-none ${sidebarOpen ? 'lg:pl-60' : 'lg:pl-16'}`}>
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  );
};

export default Layout;
