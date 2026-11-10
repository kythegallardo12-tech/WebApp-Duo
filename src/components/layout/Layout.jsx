import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import Sidebar from './Sidebar';
import ToastContainer from '../ui/Toast';
import useStore from '../../store/useStore';

/**
 * Main Layout
 * Applies:
 * - Jakob's Law: standard sidebar+content layout
 * - Consistency: persistent navigation
 * - Lenis smooth scrolling for polished feel
 */
const Layout = () => {
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  // Initialize Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-blue-600/5 blur-[100px]" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 rounded-full bg-indigo-600/5 blur-[80px]" />
        <div className="absolute bottom-20 right-1/4 w-72 h-72 rounded-full bg-purple-600/3 blur-[90px]" />
      </div>

      <Sidebar />

      {/* Main Content */}
      <main
        className={`relative transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Outlet />
      </main>

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  );
};

export default Layout;
