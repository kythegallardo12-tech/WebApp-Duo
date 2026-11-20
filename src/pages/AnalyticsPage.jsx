import { useCallback } from 'react';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import { Stat, Growth } from '../components/ui/Stat';
import RevenueBars from '../components/ui/RevenueBars';
import { orderStatus, PAGE } from '../components/ui/status';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useCurrency } from '../hooks/useCurrency';
import { api } from '../api/client';
import useStore from '../store/useStore';

/** Analytics — every value comes from /api/dashboard (MongoDB aggregations). */

const pipelineColor = {
  pending: 'bg-warning',
  processing: 'bg-accent',
  shipped: 'bg-shipped',
  delivered: 'bg-success',
  cancelled: 'bg-ink-3',
};

const AnalyticsPage = () => {
  const { money } = useCurrency();
  const dataVersion = useStore((s) => s.dataVersion);
  const fetchAnalytics = useCallback((onProgress, signal) => api.dashboard({ signal }), []);
  const { data, loadingState, progress, timeLeft, error, refetch } = useSmartLoader(fetchAnalytics, [dataVersion]);

  const topCategory = data?.categoryMix?.[0];
  const statusTotal = data ? Object.values(data.orderStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <Header title="Analytics" subtitle="Revenue, margin, category mix and order flow" />

      <div className={PAGE}>
        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="stats" skeletonCount={4} message="Calculating analytics…">
          {data && (
            <div className="space-y-6">
              <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Stat label="Revenue, last 30 days" value={money(data.growth.window.current.revenue)} meta={<Growth value={data.growth.revenue} />} />
                <Stat label="Average order value" value={money(data.totals.averageOrderValue)} meta={`Across ${data.totals.orders} orders`} />
                <Stat label="Stock retail value" value={money(data.inventory.retailValue)} meta={`${data.inventory.units.toLocaleString()} units on hand`} />
                <Stat label="Gross margin" value={`${data.totals.grossMargin}%`} meta="From unit cost at time of order" />
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <section className="card lg:col-span-2" aria-labelledby="an-revenue">
                  <div className="card-header border-0 pb-0">
                    <div>
                      <h2 id="an-revenue" className="card-title">Monthly revenue</h2>
                      <p className="card-subtitle">Last 6 months, excluding cancelled orders</p>
                    </div>
                  </div>
                  <div className="p-5 pt-6">
                    <RevenueBars data={data.revenueByMonth} height="h-60" />
                  </div>
                </section>

                <section className="card flex flex-col" aria-labelledby="an-mix">
                  <div className="card-header">
                    <div>
                      <h2 id="an-mix" className="card-title">Category mix</h2>
                      <p className="card-subtitle">Share of revenue by category</p>
                    </div>
                  </div>
                  <ul className="flex-1 px-5 py-4 space-y-4">
                    {data.categoryMix.length === 0 && <li className="text-sm text-ink-3">No sales yet.</li>}
                    {data.categoryMix.slice(0, 6).map((cat) => (
                      <li key={cat.name}>
                        <div className="flex justify-between gap-3 text-sm mb-1.5">
                          <span className="text-ink-2 truncate">{cat.name}</span>
                          <span className="font-semibold text-ink tabular">{cat.share}%</span>
                        </div>
                        <div className="meter">
                          <span style={{ width: `${cat.share}%`, background: cat.color || 'var(--color-accent)' }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  {topCategory && (
                    <p className="mx-5 mb-5 rounded-lg bg-raised border border-line px-3.5 py-3 text-sm text-ink-2">
                      <span className="font-medium text-ink">{topCategory.name}</span> brings in {topCategory.share}% of revenue ({money(topCategory.revenue)}).
                    </p>
                  )}
                </section>
              </div>

              <section className="card" aria-labelledby="an-pipeline">
                <div className="card-header">
                  <div>
                    <h2 id="an-pipeline" className="card-title">Order pipeline</h2>
                    <p className="card-subtitle">Orders by status · {statusTotal} total</p>
                  </div>
                </div>
                <div className="p-5">
                  {statusTotal > 0 && (
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5 mb-5" aria-hidden="true">
                      {Object.entries(data.orderStatus).map(([status, count]) =>
                        count > 0 ? <span key={status} className={pipelineColor[status]} style={{ width: `${(count / statusTotal) * 100}%` }} /> : null
                      )}
                    </div>
                  )}
                  <ul className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-4">
                    {Object.entries(data.orderStatus).map(([status, count]) => (
                      <li key={status}>
                        <p className="flex items-center gap-2 text-sm text-ink-2">
                          <span className={`w-2 h-2 rounded-full ${pipelineColor[status]}`} aria-hidden="true" />
                          {orderStatus[status]?.label || status}
                        </p>
                        <p className="text-xl font-semibold text-ink tabular mt-0.5">{count}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          )}
        </SmartLoadingWrapper>
      </div>
    </>
  );
};

export default AnalyticsPage;
