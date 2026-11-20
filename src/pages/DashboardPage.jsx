import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, ArrowRight } from 'lucide-react';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import { Stat, Growth } from '../components/ui/Stat';
import RevenueBars from '../components/ui/RevenueBars';
import { orderStatus, PAGE } from '../components/ui/status';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useCurrency } from '../hooks/useCurrency';
import { api } from '../api/client';
import useStore from '../store/useStore';
import { ROUTES } from '../lib/routes';

const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const DashboardPage = () => {
  const { money } = useCurrency();
  const dataVersion = useStore((s) => s.dataVersion);
  const settings = useStore((s) => s.settings);
  const fetchDashboard = useCallback((onProgress, signal) => api.dashboard({ signal }), []);
  const { data, loadingState, progress, timeLeft, error, refetch, refreshing } = useSmartLoader(fetchDashboard, [dataVersion]);

  const top = data?.topProducts || [];
  const maxSales = Math.max(1, ...top.map((p) => p.sales));
  const peak = (data?.revenueByMonth || []).reduce((best, d) => (d.revenue > (best?.revenue ?? 0) ? d : best), null);

  return (
    <>
      <Header title="Overview" subtitle={settings?.businessName || 'Inventory and orders'} />

      <div className={PAGE}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-3">
            {data?.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Sales, stock and recent orders'}
          </p>
          <button type="button" onClick={refetch} disabled={refreshing || loadingState !== 'done'} className="btn btn-secondary btn-sm">
            <RotateCw size={14} aria-hidden="true" />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="stats" skeletonCount={4} message="Calculating dashboard figures…">
          {data && (
            <div className="space-y-6">
              <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="dashboard-stats">
                <Stat label="Revenue" value={money(data.totals.revenue)} meta={<Growth value={data.growth.revenue} />} />
                <Stat label="Orders" value={data.totals.orders.toLocaleString()} meta={<Growth value={data.growth.orders} />} />
                <Stat label="Customers" value={data.totals.customers.toLocaleString()} meta={<Growth value={data.growth.customers} />} />
                <Stat label="Products" value={data.totals.products.toLocaleString()} meta="In the catalog" />
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <section className="card lg:col-span-2" aria-labelledby="dash-revenue">
                  <div className="card-header border-0 pb-0">
                    <div>
                      <h2 id="dash-revenue" className="card-title">Revenue</h2>
                      <p className="card-subtitle">Last 6 months, excluding cancelled orders</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-ink-3">Best month</p>
                      <p className="text-sm font-semibold text-ink tabular">{peak ? `${peak.month} · ${money(peak.revenue)}` : 'No sales yet'}</p>
                    </div>
                  </div>
                  <div className="p-5 pt-6">
                    <RevenueBars data={data.revenueByMonth} />
                  </div>
                </section>

                <section className="card flex flex-col" aria-labelledby="dash-stock">
                  <div className="card-header">
                    <div>
                      <h2 id="dash-stock" className="card-title">Stock health</h2>
                      <p className="card-subtitle">Inventory value at cost: {money(data.inventory.value)}</p>
                    </div>
                  </div>
                  <ul className="flex-1 px-5 py-2 divide-y divide-line">
                    {[
                      ['Healthy', data.inventory.healthy, 'bg-success'],
                      ['Low stock', data.inventory.low, 'bg-warning'],
                      ['Out of stock', data.inventory.out, 'bg-danger'],
                    ].map(([label, count, dot]) => (
                      <li key={label} className="flex items-center justify-between py-3 text-sm">
                        <span className="flex items-center gap-2.5 text-ink-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
                          {label}
                        </span>
                        <span className="font-semibold text-ink tabular">{count}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="px-5 pb-4">
                    <Link to={ROUTES.inventory} className="link inline-flex items-center gap-1 text-sm">
                      Review stock levels <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <section className="card lg:col-span-2 min-w-0" aria-labelledby="dash-recent">
                  <div className="card-header">
                    <div>
                      <h2 id="dash-recent" className="card-title">Recent orders</h2>
                      <p className="card-subtitle">The five newest orders</p>
                    </div>
                    <Link to={ROUTES.orders} className="link text-sm shrink-0" aria-label="See all">
                      See all
                    </Link>
                  </div>
                  {data.recentOrders.length === 0 ? (
                    <p className="text-sm text-ink-3 px-5 py-10 text-center">No orders yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table min-w-[36rem]">
                        <thead>
                          <tr>
                            <th scope="col">Order</th>
                            <th scope="col">Customer</th>
                            <th scope="col">Date</th>
                            <th scope="col" className="text-right">Amount</th>
                            <th scope="col">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentOrders.map((ord) => {
                            const st = orderStatus[ord.status] || orderStatus.pending;
                            return (
                              <tr key={ord.id}>
                                <td className="font-mono text-[0.8125rem] text-ink-2 whitespace-nowrap">{ord.orderNumber}</td>
                                <td className="font-medium text-ink">{ord.customer}</td>
                                <td className="text-ink-2 whitespace-nowrap">{fmtDate(ord.date)}</td>
                                <td className="text-right font-medium text-ink tabular whitespace-nowrap">{money(ord.total)}</td>
                                <td>
                                  <span className={`badge ${st.badge}`}>{st.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="card" aria-labelledby="dash-top">
                  <div className="card-header">
                    <div>
                      <h2 id="dash-top" className="card-title">Top sellers</h2>
                      <p className="card-subtitle">Units ordered, excluding cancelled</p>
                    </div>
                  </div>
                  <ul className="px-5 py-4 space-y-4">
                    {top.length === 0 && <li className="text-sm text-ink-3">No orders yet.</li>}
                    {top.map((p) => (
                      <li key={p.name}>
                        <div className="flex justify-between gap-3 text-sm mb-1.5">
                          <span className="text-ink-2 truncate">{p.name}</span>
                          <span className="font-semibold text-ink tabular">{p.sales.toLocaleString()}</span>
                        </div>
                        <div className="meter">
                          <span className="bg-accent" style={{ width: `${Math.round((p.sales / maxSales) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          )}
        </SmartLoadingWrapper>
      </div>
    </>
  );
};

export default DashboardPage;
