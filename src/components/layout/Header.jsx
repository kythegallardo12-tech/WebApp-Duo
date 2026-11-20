import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut, House } from 'lucide-react';
import useStore from '../../store/useStore';
import useAuth from '../../store/useAuth';
import SyncIndicator from '../ui/SyncIndicator';
import Wordmark from '../brand/Wordmark';
import { ROUTES } from '../../lib/routes';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

/** Account menu: keyboard operable (Enter/Space/ArrowDown to open, arrows to move, Escape to close). */
const AccountMenu = () => {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    items()[0]?.focus();
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next]?.focus();
      } else if (e.key === 'Tab') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = () => {
    setOpen(false);
    logout();
    navigate(ROUTES.signIn, { replace: true });
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2.5 h-10 pl-1 pr-1 md:pr-2.5 rounded-full hover:bg-white/5 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-testid="account-menu"
      >
        <span className="flex w-8 h-8 items-center justify-center rounded-full bg-raised border border-line-strong text-xs font-semibold text-ink" aria-hidden="true">
          {initials(user?.name)}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight text-left">
          <span className="text-[0.8125rem] font-medium text-ink max-w-[10rem] truncate">{user?.name}</span>
          <span className="text-[0.6875rem] text-ink-3 capitalize">{user?.role}</span>
        </span>
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label="Account" className="menu right-0 mt-2">
          <div className="px-2.5 pt-1.5 pb-2.5 mb-1 border-b border-line">
            <p className="text-sm font-semibold text-ink truncate">{user?.name}</p>
            <p className="text-xs text-ink-2 truncate">{user?.email}</p>
            <p className="text-xs text-ink-3 mt-1 capitalize">Role: {user?.role}</p>
            <div className="sm:hidden mt-2">
              <SyncIndicator />
            </div>
          </div>
          <Link role="menuitem" to={ROUTES.home} className="menu-item" onClick={() => setOpen(false)}>
            <House size={15} aria-hidden="true" /> StockFlow home
          </Link>
          <button role="menuitem" type="button" onClick={signOut} className="menu-item">
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Workspace top bar: page title, save status and account. Stays pinned while the page scrolls,
 * as a light translucent layer so content stays legible underneath.
 */
const Header = ({ title, subtitle }) => {
  const setMobileNav = useStore((s) => s.setMobileNav);

  return (
    <header className="material-bar sticky top-0 z-20 border-b border-line">
      <div className="flex items-center justify-between gap-3 h-15 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => setMobileNav(true)} className="icon-btn -ml-1.5 lg:hidden" aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <Link to={ROUTES.app} className="lg:hidden text-[1.0625rem] mr-2 rounded-md max-[359px]:hidden" aria-label="StockFlow dashboard">
            <Wordmark />
          </Link>
          <div className="min-w-0 max-lg:border-l max-lg:border-line max-lg:pl-3 max-[359px]:border-0 max-[359px]:pl-0">
            <h1 className="text-[0.9375rem] sm:text-base font-semibold tracking-[-0.01em] text-ink truncate">{title}</h1>
            {subtitle && <p className="hidden sm:block text-xs text-ink-3 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:block">
            <SyncIndicator />
          </div>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
