import { useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Boxes,
} from 'lucide-react';
import gsap from 'gsap';
import useStore from '../../store/useStore';

/**
 * Sidebar Navigation
 * Applies:
 * - Miller's Law: 7 nav items max
 * - Hick's Law: clear, minimal choices
 * - Fitts' Law: large clickable areas (44px+ touch targets)
 * - Law of Similarity: consistent icon+label pattern
 * - Jakob's Law: familiar left-sidebar pattern
 * - Visual Hierarchy: primary actions are prominent
 */
const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/inventory', icon: Boxes, label: 'Inventory' },
  { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const Sidebar = () => {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const mobileNavOpen = useStore((s) => s.mobileNavOpen);
  const location = useLocation();
  // On small screens the drawer always shows labels.
  const expanded = sidebarOpen || mobileNavOpen;
  const navRef = useRef(null);
  const logoRef = useRef(null);

  useEffect(() => {
    if (navRef.current) {
      const items = navRef.current.querySelectorAll('.nav-item');
      gsap.fromTo(
        items,
        { opacity: 0, x: -16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.3,
          stagger: 0.05,
          ease: 'power2.out',
          delay: 0.2,
        }
      );
    }
  }, []);

  return (
    <aside
      aria-label="Main navigation"
      className={`fixed left-0 top-0 h-screen bg-[var(--color-bg-secondary)]/95 lg:bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl border-r border-white/5 z-40 flex flex-col transition-all duration-300 ${
        expanded ? 'w-64' : 'w-20'
      } ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
    >
      {/* Logo */}
      <div ref={logoRef} className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
          <Boxes size={22} className="text-white" />
        </div>
        {expanded && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-[var(--color-text-primary)] whitespace-nowrap">
              StockFlow
            </h1>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest">
              Inventory Pro
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`nav-item flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative ${
                isActive
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5'
              }`}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[var(--color-accent)] rounded-r-full" />
              )}

              <Icon
                size={20}
                className={`flex-shrink-0 ${
                  isActive ? 'text-[var(--color-accent)]' : 'group-hover:text-[var(--color-text-primary)]'
                }`}
              />
              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              )}

              {/* Tooltip for collapsed state */}
              {!expanded && (
                <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-[var(--color-bg-tertiary)] text-sm text-[var(--color-text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg border border-white/10 z-50">
                  {item.label}
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 pb-4 hidden lg:block">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-all"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          {sidebarOpen && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
