import { useRef, useEffect, useCallback } from 'react';
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import gsap from 'gsap';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import ShinyText from '../components/reactbits/ShinyText';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';

/**
 * Dashboard Page
 * Applies:
 * - Miller's Law: 4 core stats (within 7±2 chunks)
 * - Peak-End Rule: Prominently showcases high-performing revenue at peak visual hierarchy
 * - Hick's Law: Uncluttered top actions reduce decision latency
 * - Fitts' Law: Generously padded click targets and elevated stat cards
 * - Aesthetic-Usability Effect: Navy blue glassmorphism elevates perceived quality
 * - Jakob's Law: Standard eCommerce analytics dashboard conventions
 */

const StatCard = ({ icon: Icon, label, value, growth, prefix = '', delay = 0, isSpotlight = false }) => {
  const valueRef = useRef(null);
  const isPositive = growth >= 0;

  useEffect(() => {
    if (valueRef.current) {
      const numValue = Number(value) || 0;
      const obj = { val: 0 };
      gsap.to(obj, {
        val: numValue,
        duration: 1.1,
        delay: delay + 0.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (valueRef.current) {
            if (prefix === '$') {
              valueRef.current.textContent =
                prefix + obj.val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (numValue >= 1000) {
              valueRef.current.textContent =
                prefix +
                obj.val.toLocaleString('en-US', {
                  minimumFractionDigits: numValue % 1 !== 0 ? 2 : 0,
                  maximumFractionDigits: 2,
                });
            } else {
              valueRef.current.textContent = prefix + Math.round(obj.val).toLocaleString();
            }
          }
        },
      });
    }
  }, [value, prefix, delay]);

  const content = (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">{label}</span>
        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
          <Icon size={18} />
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span ref={valueRef} className="text-3xl font-black tracking-tight text-white">
          0
        </span>
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
        {isPositive ? (
          <TrendingUp size={14} className="text-emerald-400" />
        ) : (
          <TrendingDown size={14} className="text-rose-400" />
        )}
        <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '+' : ''}{growth}%
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)]">vs previous 30 days</span>
      </div>
    </div>
  );

  if (isSpotlight) {
    return (
      <SpotlightCard className="shadow-lg shadow-blue-950/40 border-blue-500/30">
        {content}
      </SpotlightCard>
    );
  }

  return (
    <GlassCard delay={delay} className="border-white/10 hover:border-blue-400/30 transition-colors">
      {content}
    </GlassCard>
  );
};

const RevenueChart = ({ data }) => {
  const barsRef = useRef(null);
  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const peak = data.reduce((best, d) => (d.revenue > (best?.revenue ?? -1) ? d : best), null);

  useEffect(() => {
    if (barsRef.current) {
      const bars = barsRef.current.querySelectorAll('.bar-column');
      gsap.fromTo(
        bars,
        { scaleY: 0, opacity: 0.2 },
        {
          scaleY: 1,
          opacity: 1,
          duration: 0.9,
          stagger: 0.08,
          ease: 'power3.out',
          delay: 0.3,
        }
      );
    }
  }, [data]);

  return (
    <GlassCard delay={0.2} className="relative overflow-hidden border-white/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">Revenue Performance Trajectory</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
              From MongoDB
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Revenue from non-cancelled orders, last 6 months</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--color-text-muted)] block">Peak Month</span>
          <span className="text-sm font-bold text-emerald-400">
            {peak && peak.revenue > 0 ? `${peak.month} · $${peak.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'No sales yet'}
          </span>
        </div>
      </div>

      <div ref={barsRef} className="flex items-end gap-3 h-52 pt-4 px-2">
        {data.map((item, idx) => {
          const height = Math.round((item.revenue / maxRevenue) * 100);
          const isHighest = idx === data.length - 1;
          return (
            <div key={`${item.year}-${item.month}`} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <span className="text-[10px] font-medium text-slate-400">
                ${(item.revenue / 1000).toFixed(1)}k
              </span>
              <div className="w-full bg-white/[0.04] rounded-xl relative overflow-hidden h-36 flex items-end">
                <div
                  className={`bar-column w-full rounded-xl origin-bottom transition-all duration-300 hover:brightness-125 ${
                    isHighest
                      ? 'bg-gradient-to-t from-blue-700 via-blue-500 to-cyan-300 shadow-lg shadow-blue-500/30'
                      : 'bg-gradient-to-t from-slate-800 via-blue-900 to-blue-600/70'
                  }`}
                  style={{ height: `${Math.max(item.revenue > 0 ? 4 : 0, height)}%`, transformOrigin: 'bottom' }}
                />
              </div>
              <span className={`text-[11px] font-medium ${isHighest ? 'text-blue-300 font-bold' : 'text-slate-400'}`}>
                {item.month}
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

const UXPrinciplesShowcase = () => {
  const principles = [
    { name: "Miller's Law", desc: "Clustered into 7±2 cognitive chunks to prevent overload", icon: Zap },
    { name: "Fitts' Law", desc: "Target dimensions calibrated for rapid click accessibility", icon: Layers },
    { name: "Peak-End Rule", desc: "Positive sensory reward on completions & checkout peaks", icon: Sparkles },
    { name: "Aesthetic Usability", desc: "Refined navy glassmorphism builds intrinsic operator trust", icon: ShieldCheck },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {principles.map((p, i) => {
        const Icon = p.icon;
        return (
          <div
            key={i}
            className="p-4 rounded-xl bg-gradient-to-b from-blue-950/20 to-slate-900/40 border border-white/5 backdrop-blur-md flex items-start gap-3"
          >
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 flex-shrink-0">
              <Icon size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">{p.name}</h4>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{p.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const statusColor = {
  delivered: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  shipped: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  processing: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
};

const DashboardPage = () => {
  const dataVersion = useStore((s) => s.dataVersion);
  const settings = useStore((s) => s.settings);
  const fetchDashboard = useCallback((onProgress, signal) => api.dashboard({ signal }), []);
  const { data, loadingState, progress, timeLeft, error, refetch, refreshing } = useSmartLoader(fetchDashboard, [dataVersion]);

  const top = data?.topProducts || [];
  const maxSales = Math.max(1, ...top.map((p) => p.sales));

  return (
    <div>
      <Header title="Overview" subtitle={`${settings?.businessName || 'StockFlow Pro'} · inventory and order management`} />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/60 via-slate-900/80 to-blue-900/40 p-6 backdrop-blur-xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`} />
                <span className="text-xs uppercase tracking-widest font-bold text-blue-400">{error ? 'Connection problem' : 'Connected to database'}</span>
              </div>
              <h2 className="text-2xl font-black text-white flex items-center gap-2 flex-wrap">
                StockFlow <ShinyText text="Workspace" speed={4} />
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl mt-1">
                Every figure below is calculated by the server from orders and products stored in MongoDB.
                {data?.generatedAt && ` Updated ${new Date(data.generatedAt).toLocaleTimeString()}.`}
              </p>
            </div>
            <button onClick={refetch} disabled={refreshing} className="btn-primary text-xs px-4 py-2.5 shadow-lg shadow-blue-600/30 font-semibold disabled:opacity-60">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="stats" skeletonCount={4} message="Calculating dashboard figures…">
          {data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-stats">
                <StatCard icon={DollarSign} label="Gross Revenue" value={data.totals.revenue} growth={data.growth.revenue} prefix="$" delay={0} isSpotlight />
                <StatCard icon={ShoppingCart} label="Total Orders" value={data.totals.orders} growth={data.growth.orders} delay={0.08} />
                <StatCard icon={Package} label="Products" value={data.totals.products} growth={0} delay={0.16} />
                <StatCard icon={Users} label="Customers" value={data.totals.customers} growth={data.growth.customers} delay={0.24} />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  ['Inventory value (cost)', `$${data.inventory.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'text-white'],
                  ['Healthy stock', data.inventory.healthy, 'text-emerald-400'],
                  ['Low stock', data.inventory.low, 'text-amber-400'],
                  ['Out of stock', data.inventory.out, 'text-rose-400'],
                ].map(([label, value, color]) => (
                  <div key={label} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">{label}</span>
                    <span className={`text-xl font-black ${color}`}>{value}</span>
                  </div>
                ))}
              </div>

              <UXPrinciplesShowcase />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <RevenueChart data={data.revenueByMonth} />
                </div>
                <GlassCard delay={0.3} className="border-white/10">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-white">Top Sellers</h3>
                    <p className="text-xs text-[var(--color-text-muted)]">Units ordered (excluding cancelled)</p>
                  </div>
                  <div className="space-y-4">
                    {top.length === 0 && <p className="text-xs text-slate-400">No orders yet.</p>}
                    {top.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium truncate max-w-[170px]">{p.name}</span>
                          <span className="text-white font-bold">{p.sales.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((p.sales / maxSales) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>

              <GlassCard delay={0.4} className="border-white/10">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-white">Recent Orders</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Latest five orders</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs text-[var(--color-text-muted)]">
                        <th className="pb-3 font-semibold">Order</th>
                        <th className="pb-3 font-semibold">Customer</th>
                        <th className="pb-3 font-semibold">Date</th>
                        <th className="pb-3 font-semibold">Amount</th>
                        <th className="pb-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {data.recentOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 font-mono text-xs text-blue-300">{ord.orderNumber}</td>
                          <td className="py-3 font-medium text-white">{ord.customer}</td>
                          <td className="py-3 text-xs text-slate-400">{new Date(ord.date).toLocaleDateString()}</td>
                          <td className="py-3 font-bold text-white">${ord.total.toFixed(2)}</td>
                          <td className="py-3">
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${statusColor[ord.status] || statusColor.pending}`}>{ord.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.recentOrders.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No orders yet.</p>}
                </div>
              </GlassCard>
            </div>
          )}
        </SmartLoadingWrapper>
      </div>
    </div>
  );
};

export default DashboardPage;
