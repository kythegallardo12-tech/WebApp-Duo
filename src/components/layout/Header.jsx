import { useRef, useEffect } from 'react';
import { Search, Bell, User, Menu } from 'lucide-react';
import gsap from 'gsap';
import useStore from '../../store/useStore';
import SyncIndicator from '../ui/SyncIndicator';

/**
 * Header component
 * Applies:
 * - Fitts' Law: search is prominent and easy to reach
 * - Occam's Razor: only essential actions in header
 * - Consistency: always same position and behavior
 */
const Header = ({ title, subtitle, syncState }) => {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const headerRef = useRef(null);

  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    }
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 px-6 py-4 border-b border-white/5 bg-[var(--color-bg-primary)]/80 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Title + Menu */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-[var(--color-text-muted)]"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
            {subtitle && (
              <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              type="text"
              placeholder="Search products, orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-10 text-sm h-10"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {syncState && (
            <SyncIndicator
              isSyncing={syncState.isSyncing}
              syncErrors={syncState.syncErrors}
            />
          )}

          {/* Notifications */}
          <button className="relative p-2.5 rounded-xl hover:bg-white/5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-bg-primary)]" />
          </button>

          {/* Profile */}
          <button className="flex items-center gap-3 p-1.5 pl-3 rounded-xl hover:bg-white/5 transition-colors">
            <span className="hidden sm:block text-sm text-[var(--color-text-secondary)]">Admin</span>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
