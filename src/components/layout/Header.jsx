import { useRef, useEffect, useState } from 'react';
import { User, Menu, LogOut, ShieldCheck } from 'lucide-react';
import gsap from 'gsap';
import useStore from '../../store/useStore';
import useAuth from '../../store/useAuth';
import SyncIndicator from '../ui/SyncIndicator';

/**
 * Header
 * - Occam's Razor: title, save status and account menu only
 * - Feedback: global "Saving… / All changes saved / Not saved" indicator
 */
const Header = ({ title, subtitle, actions }) => {
  const setMobileNav = useStore((s) => s.setMobileNav);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const headerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(headerRef.current, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-white/5 bg-[var(--color-bg-primary)]/80 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMobileNav(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/5 text-[var(--color-text-muted)]"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] truncate">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-[var(--color-text-muted)] truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {actions}
          <div className="hidden sm:block">
            <SyncIndicator />
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-3 p-1.5 sm:pl-3 rounded-xl hover:bg-white/5 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              data-testid="account-menu"
            >
              <span className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-sm text-[var(--color-text-secondary)]">{user?.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">{user?.role}</span>
              </span>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-60 glass-card p-2 border border-white/10 shadow-xl z-50">
                <div className="px-3 py-2 border-b border-white/5 mb-1">
                  <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  <p className="text-[10px] mt-1 inline-flex items-center gap-1 uppercase tracking-wider text-blue-300">
                    <ShieldCheck size={11} /> {user?.role}
                  </p>
                </div>
                <div className="sm:hidden px-3 py-2">
                  <SyncIndicator />
                </div>
                <button
                  role="menuitem"
                  onClick={() => logout()}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
