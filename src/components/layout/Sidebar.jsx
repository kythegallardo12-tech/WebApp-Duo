import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, BarChart3, Settings, Boxes, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Wordmark from '../brand/Wordmark';
import Dialog from '../ui/Dialog';
import useStore from '../../store/useStore';
import { ROUTES } from '../../lib/routes';

const navItems = [
  { to: ROUTES.app, icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: ROUTES.products, icon: Package, label: 'Products' },
  { to: ROUTES.inventory, icon: Boxes, label: 'Inventory' },
  { to: ROUTES.orders, icon: ShoppingCart, label: 'Orders' },
  { to: ROUTES.analytics, icon: BarChart3, label: 'Analytics' },
  { to: ROUTES.settings, icon: Settings, label: 'Settings' },
];

const NavList = ({ collapsed = false, onNavigate }) => (
  <ul className="space-y-0.5">
    {navItems.map(({ to, icon: Icon, label, end }) => (
      <li key={to}>
        <NavLink
          to={to}
          end={end}
          onClick={onNavigate}
          className={`nav-link ${collapsed ? 'justify-center px-0' : ''}`}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
        >
          <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
          {!collapsed && <span>{label}</span>}
        </NavLink>
      </li>
    ))}
  </ul>
);

/** Desktop sidebar (lg and up). Collapses to icons; the preference is kept in this browser. */
export const Sidebar = () => {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const collapsed = !sidebarOpen;

  return (
    <aside
      aria-label="Main navigation"
      className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-surface border-r border-line ${collapsed ? 'w-16' : 'w-60'}`}
    >
      <div className={`flex items-center h-15 shrink-0 ${collapsed ? 'justify-center' : 'justify-between pl-5 pr-2'}`}>
        {!collapsed && (
          <Link to={ROUTES.app} className="rounded-md text-[1.1875rem]" aria-label="StockFlow dashboard">
            <Wordmark />
          </Link>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="icon-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-2.5 pt-2 pb-4">
        <NavList collapsed={collapsed} />
      </nav>
    </aside>
  );
};

/** Navigation drawer for screens narrower than lg. */
export const MobileNav = () => {
  const open = useStore((s) => s.mobileNavOpen);
  const setMobileNav = useStore((s) => s.setMobileNav);
  const close = () => setMobileNav(false);

  return (
    <Dialog isOpen={open} onClose={close} variant="sheet" side="left" width="17.5rem" closeLabel="Close navigation">
      <div className="-m-5 flex flex-col min-h-full">
        <div className="flex items-center justify-between h-15 pl-5 pr-2 border-b border-line">
          <Link to={ROUTES.app} onClick={close} className="rounded-md text-[1.1875rem]" aria-label="StockFlow dashboard">
            <Wordmark />
          </Link>
          <button type="button" onClick={close} className="icon-btn" aria-label="Close navigation" data-autofocus>
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav aria-label="Workspace" className="px-2.5 py-3">
          <NavList onNavigate={close} />
        </nav>
      </div>
    </Dialog>
  );
};
