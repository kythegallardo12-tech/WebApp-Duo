import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import Sidebar from './Sidebar';
import ToastContainer from '../ui/Toast';
import useStore from '../../store/useStore';

/**
 * Main Layout
 * - Jakob's Law: standard sidebar + content layout
 * - Lenis smooth scrolling
 * - Below the lg breakpoint the sidebar becomes an off-canvas drawer
 * - Loads the shared workspace data (catalog, categories, orders, settings) once signed in
 */
const Layout = () => {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const mobileNavOpen = useStore((s) => s.mobileNavOpen);
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

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname, setMobileNav]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });
    let frame;
    function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] btn-primary px-4 py-2 text-sm">
        Skip to content
      </a>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-blue-600/5 blur-[100px]" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 rounded-full bg-indigo-600/5 blur-[80px]" />
        <div className="absolute bottom-20 right-1/4 w-72 h-72 rounded-full bg-purple-600/3 blur-[90px]" />
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)} aria-hidden="true" />
      )}
      <Sidebar />

      <main id="main" className={`relative transition-all duration-300 min-w-0 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  );
};

export default Layout;
