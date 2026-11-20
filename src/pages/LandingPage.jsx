import { Link } from 'react-router-dom';
import { ArrowRight, Package, BarChart3, Users, Check } from 'lucide-react';
import Wordmark from '../components/brand/Wordmark';
import useAuth from '../store/useAuth';
import { ROUTES } from '../lib/routes';

const REPO_URL = 'https://github.com/kythegallardo12-tech/WebApp-Duo';
const YEAR = new Date().getFullYear();

/** Screenshot of the real workspace, framed. Sample data is labelled as such. */
const Screenshot = ({ src, mobileSrc, alt, width, height, priority = false, className = '' }) => (
  <div className={`rounded-[14px] sm:rounded-[18px] border border-line-strong bg-surface p-1 sm:p-1.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] ${className}`}>
    <picture>
      {mobileSrc && <source media="(max-width: 639px)" srcSet={mobileSrc} />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className="block w-full h-auto rounded-[10px] sm:rounded-[13px]"
      />
    </picture>
  </div>
);

const Bullet = ({ children }) => (
  <li className="flex gap-3">
    <Check size={18} className="text-accent-ink shrink-0 mt-0.5" aria-hidden="true" />
    <span>{children}</span>
  </li>
);

const LandingPage = () => {
  const status = useAuth((s) => s.status);
  const signedIn = status === 'signedIn';
  const primary = signedIn ? { to: ROUTES.app, label: 'Open your workspace' } : { to: ROUTES.signIn, label: 'Sign in to your workspace' };

  return (
    <div className="landing min-h-dvh bg-canvas text-ink">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] btn btn-primary">
        Skip to content
      </a>

      <header className="material-bar sticky top-0 z-30 border-b border-line">
        <div className="mx-auto max-w-[72rem] h-16 px-5 sm:px-8 flex items-center justify-between gap-6">
          <Link to={ROUTES.home} className="text-[1.3125rem] rounded-md" aria-label="StockFlow home">
            <Wordmark />
          </Link>
          <nav aria-label="Page sections" className="hidden md:flex items-center gap-1 mr-auto ml-4">
            <a href="#features" className="btn btn-ghost btn-sm font-medium">
              Features
            </a>
            <a href="#accuracy" className="btn btn-ghost btn-sm font-medium">
              Accuracy
            </a>
          </nav>
          {signedIn ? (
            <Link to={ROUTES.app} className="btn btn-secondary btn-sm">
              Open workspace
            </Link>
          ) : (
            <Link to={ROUTES.signIn} className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main id="content">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(37_99_235/0.16),transparent_70%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-[72rem] px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24">
            <div className="max-w-[56rem] mx-auto text-center">
              <h1 className="text-[2.375rem] leading-[1.06] sm:text-[3.5rem] lg:text-[4rem] font-semibold tracking-[-0.035em]">
                Inventory and order management for small teams
              </h1>
              <p className="mt-6 text-[1.0625rem] sm:text-xl leading-relaxed text-ink-2 max-w-[38rem] mx-auto">
                Keep your catalog, stock levels and customer orders in one shared workspace. Every stock change is recorded with who made it and why.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <Link to={primary.to} className="btn btn-primary btn-lg px-6">
                  {primary.label} <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <a href="#features" className="btn btn-ghost btn-lg">
                  See what’s included
                </a>
              </div>
              {!signedIn && <p className="mt-5 text-sm text-ink-3">Accounts are created by your workspace administrator.</p>}
            </div>

            <figure className="mt-14 sm:mt-20">
              <Screenshot
                src="/product/dashboard.jpg"
                mobileSrc="/product/dashboard-mobile.jpg"
                width={2160}
                height={1350}
                priority
                alt="The StockFlow overview screen: revenue, orders, customers and product totals, a six-month revenue chart, stock health, recent orders and top sellers."
              />
              <figcaption className="mt-4 text-center text-xs text-ink-3">Shown with sample data.</figcaption>
            </figure>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="border-t border-line">
          <div className="mx-auto max-w-[72rem] px-5 sm:px-8 py-20 sm:py-28">
            <div className="max-w-[40rem]">
              <h2 id="features-title" className="text-3xl sm:text-[2.5rem] leading-tight font-semibold tracking-[-0.03em]">
                Products, stock and orders, connected
              </h2>
              <p className="mt-4 text-lg text-ink-2">An order reserves stock the moment it is saved, and the dashboard reads from the same records. Nothing is copied between tools.</p>
            </div>

            <div className="mt-16 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-14 items-center">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.02em]">Stock you can account for</h3>
                <ul className="mt-6 space-y-4 text-[1.0625rem] text-ink-2">
                  <Bullet>Add or remove stock in one tap, or record an adjustment with a reason.</Bullet>
                  <Bullet>Open any product’s history to see who changed it, when and why.</Bullet>
                  <Bullet>Get low-stock alerts at the threshold you set for each product.</Bullet>
                </ul>
              </div>
              <Screenshot
                src="/product/inventory.jpg"
                width={2160}
                height={1350}
                alt="The Inventory screen: stock totals, a low-stock alert, and a table of products with stock meters and quick adjust buttons."
              />
            </div>

            <div className="mt-20 sm:mt-24 grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-10 lg:gap-14 items-center">
              <Screenshot
                src="/product/orders.jpg"
                width={2160}
                height={1350}
                className="lg:order-first order-last"
                alt="The Orders screen: order totals by status and a table of orders with customer, items, total, status and next-step buttons."
              />
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.02em]">Orders from pending to delivered</h3>
                <ul className="mt-6 space-y-4 text-[1.0625rem] text-ink-2">
                  <Bullet>Build orders with several items; stock is reserved when the order is saved.</Bullet>
                  <Bullet>Move each order forward one step at a time: processing, shipped, delivered.</Bullet>
                  <Bullet>Cancel before it ships and the items go straight back into stock.</Bullet>
                </ul>
              </div>
            </div>

            <ul className="mt-20 sm:mt-24 grid sm:grid-cols-3 gap-4">
              {[
                [Package, 'Catalog', 'Search, filter and sort products, switch between grid and table, and export the current view to CSV.'],
                [BarChart3, 'Analytics', 'Revenue by month, average order value, gross margin and category mix, calculated from your orders.'],
                [Users, 'Team and roles', 'Admins manage accounts and settings. Staff handle products, stock and orders. The server enforces each permission.'],
              ].map(([Icon, title, text]) => (
                <li key={title} className="card p-6">
                  <span className="flex w-9 h-9 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h3>
                  <p className="mt-2 text-ink-2 leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Accuracy */}
        <section id="accuracy" aria-labelledby="accuracy-title" className="border-t border-line bg-surface/50">
          <div className="mx-auto max-w-[72rem] px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-16">
            <div>
              <h2 id="accuracy-title" className="text-3xl sm:text-[2.5rem] leading-tight font-semibold tracking-[-0.03em]">
                Built to keep the numbers right
              </h2>
              <p className="mt-4 text-lg text-ink-2">Stock and totals are worked out on the server, so what you see matches what was saved.</p>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-10 gap-y-9">
              {[
                ['Prices come from the catalog', 'Order totals are calculated by the server from saved prices, not from what a browser sends.'],
                ['A retry never counts twice', 'If a connection drops while saving, the retry is matched to the first attempt, so stock moves once.'],
                ['Edits don’t overwrite each other', 'If someone saved a product or setting first, you see their version before saving yours.'],
                ['Past orders stay as placed', 'Orders keep the names and prices they were placed at, even after a product changes or is removed.'],
              ].map(([title, text]) => (
                <div key={title}>
                  <dt className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</dt>
                  <dd className="mt-2 text-ink-2 leading-relaxed">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call to action */}
        <section aria-labelledby="cta-title" className="border-t border-line">
          <div className="mx-auto max-w-[72rem] px-5 sm:px-8 py-20 sm:py-24 text-center">
            <h2 id="cta-title" className="text-3xl sm:text-[2.5rem] leading-tight font-semibold tracking-[-0.03em]">
              {signedIn ? 'Your workspace is ready' : 'Pick up where your team left off'}
            </h2>
            <p className="mt-4 text-lg text-ink-2">{signedIn ? 'Go straight to today’s stock and orders.' : 'Sign in with the account your administrator created for you.'}</p>
            <Link to={primary.to} className="btn btn-primary btn-lg px-6 mt-8">
              {primary.label} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-[72rem] px-5 sm:px-8 py-12 grid gap-10 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Link to={ROUTES.home} className="text-xl rounded-md" aria-label="StockFlow home">
              <Wordmark />
            </Link>
            <p className="mt-3 text-sm text-ink-3 max-w-[18rem]">Inventory and order management for small teams.</p>
          </div>
          <nav aria-label="Product">
            <h2 className="text-sm font-semibold text-ink">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#features" className="text-ink-2 hover:text-ink">
                  Features
                </a>
              </li>
              <li>
                <a href="#accuracy" className="text-ink-2 hover:text-ink">
                  Accuracy
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Workspace">
            <h2 className="text-sm font-semibold text-ink">Workspace</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                {signedIn ? (
                  <Link to={ROUTES.app} className="text-ink-2 hover:text-ink">
                    Open workspace
                  </Link>
                ) : (
                  <Link to={ROUTES.signIn} className="text-ink-2 hover:text-ink">
                    Sign in
                  </Link>
                )}
              </li>
              <li className="text-ink-3">Accounts are created by an admin</li>
            </ul>
          </nav>
          <nav aria-label="Project">
            <h2 className="text-sm font-semibold text-ink">Project</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href={REPO_URL} className="text-ink-2 hover:text-ink" target="_blank" rel="noreferrer">
                  Source code<span className="sr-only"> (opens GitHub in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-[72rem] px-5 sm:px-8 py-6 text-xs text-ink-3">© {YEAR} StockFlow · An academic project.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
