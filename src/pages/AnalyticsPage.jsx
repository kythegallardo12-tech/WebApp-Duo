import { useRef, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';
import gsap from 'gsap';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';

/**
 * Analytics — all values come from /api/dashboard (MongoDB aggregations).
 * - Peak-End Rule: highlights the strongest month and category
 * - Miller's Law: four focused KPI tiles
 */

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusColors = {
  pending: 'from-amber-500 to-orange-500',
  processing: 'from-blue-500 to-indigo-500',
  shipped: 'from-purple-500 to-pink-500',
  delivered: 'from-emerald-500 to-teal-500',
  cancelled: 'from-slate-500 to-slate-600',
};

const Growth = ({ value, label }) => {
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`text-xs font-bold flex items-center gap-1 mt-1 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon size={13} /> {up ? '+' : ''}
      {value}% {label}
    </span>
  );
};

const AnalyticsPage = () => {
  const chartRef = useRef(null);
  const dataVersion = useStore((s) => s.dataVersion);
  const fetchAnalytics = useCallback((onProgress, signal) => api.dashboard({ signal }), []);
  const { data, loadingState, progress, timeLeft, error, refetch } = useSmartLoader(fetchAnalytics, [dataVersion]);

  useEffect(() => {
    if (chartRef.current && data) {
      const bars = chartRef.current.querySelectorAll('.analytics-bar');
      gsap.fromTo(bars, { scaleY: 0 }, { scaleY: 1, duration: 1, stagger: 0.1, ease: 'elastic.out(1, 0.75)' });
    }
  }, [data]);

  const months = data?.revenueByMonth || [];
  const max = Math.max(1, ...months.map((m) => m.revenue));
  const topCategory = data?.categoryMix?.[0];
  const statusTotal = data ? Object.values(data.orderStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <div>
      <Header title="Analytics" subtitle="Revenue, margin, category mix and order flow from live data" />

      <div className="p-4 sm:p-6 space-y-6">
        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="stats" skeletonCount={4} message="Calculating analytics…">
          {data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SpotlightCard className="border-blue-500/20">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Revenue · last 30 days</span>
                  <span className="text-3xl font-black text-white">{usd(data.growth.window.current.revenue)}</span>
                  <Growth value={data.growth.revenue} label="vs previous 30 days" />
                </SpotlightCard>
                <GlassCard className="border-emerald-500/20">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Average Order Value</span>
                  <span className="text-3xl font-black text-emerald-400">{usd(data.totals.averageOrderValue)}</span>
                  <span className="text-xs text-slate-400 block mt-1">Across {data.totals.orders} orders</span>
                </GlassCard>
                <GlassCard className="border-purple-500/20">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Stock Retail Value</span>
                  <span className="text-3xl font-black text-purple-400">{usd(data.inventory.retailValue)}</span>
                  <span className="text-xs text-slate-400 block mt-1">{data.inventory.units.toLocaleString()} units on hand</span>
                </GlassCard>
                <GlassCard className="border-amber-500/20">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Gross Margin</span>
                  <span className="text-3xl font-black text-amber-400">{data.totals.grossMargin}%</span>
                  <span className="text-xs text-slate-400 block mt-1">From unit cost at time of order</span>
                </GlassCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <GlassCard className="border-white/10 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-base font-bold text-white">Revenue Trajectory</h3>
                        <p className="text-xs text-slate-400">Monthly revenue, last 6 months</p>
                      </div>
                    </div>
                    <div ref={chartRef} className="flex items-end gap-2 sm:gap-4 h-64 px-1 sm:px-4 pt-6">
                      {months.map((d) => {
                        const pct = Math.round((d.revenue / max) * 100);
                        return (
                          <div key={`${d.year}-${d.month}`} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                            <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue.toFixed(0)}</span>
                            <div className="w-full bg-white/[0.03] rounded-t-xl h-48 relative overflow-hidden flex items-end">
                              <div
                                className="analytics-bar w-full bg-gradient-to-t from-blue-700 via-blue-500 to-cyan-300 rounded-t-xl origin-bottom shadow-lg shadow-blue-500/20"
                                style={{ height: `${d.revenue > 0 ? Math.max(3, pct) : 0}%`, transformOrigin: 'bottom' }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-300">{d.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  </GlassCard>
                </div>

                <GlassCard className="border-white/10 p-6">
                  <h3 className="text-base font-bold text-white mb-1">Category Mix</h3>
                  <p className="text-xs text-slate-400 mb-6">Revenue share by category</p>
                  <div className="space-y-4">
                    {data.categoryMix.length === 0 && <p className="text-xs text-slate-400">No sales yet.</p>}
                    {data.categoryMix.slice(0, 6).map((cat) => (
                      <div key={cat.name} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300">{cat.name}</span>
                          <span className="text-white font-bold">{cat.share}%</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${cat.share}%`, background: cat.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {topCategory && (
                    <div className="mt-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                      <p className="font-bold flex items-center gap-1.5 mb-1">
                        <Award size={15} /> Leading category
                      </p>
                      {topCategory.name} brings in {topCategory.share}% of revenue ({usd(topCategory.revenue)}).
                    </div>
                  )}
                </GlassCard>
              </div>

              <GlassCard className="border-white/10 p-6">
                <h3 className="text-base font-bold text-white mb-1">Order Pipeline</h3>
                <p className="text-xs text-slate-400 mb-5">Orders by status ({statusTotal} total)</p>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {Object.entries(data.orderStatus).map(([status, count]) => (
                    <div key={status} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-300 capitalize">{status}</span>
                        <span className="text-white font-bold">{count}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${statusColors[status]}`} style={{ width: `${statusTotal ? Math.round((count / statusTotal) * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}
        </SmartLoadingWrapper>
      </div>
    </div>
  );
};

export default AnalyticsPage;
