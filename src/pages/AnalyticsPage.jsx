import { useRef, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Zap,
  Activity,
  Award,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import gsap from 'gsap';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import ShinyText from '../components/reactbits/ShinyText';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { simulateApiWithProgress } from '../utils/mockApi';
import { revenueData, topProducts } from '../data/mockData';

/**
 * Analytics & Strategic Telemetry Page
 * Applies:
 * - Peak-End Rule: Focuses attention on highest revenue spikes and achievement milestones
 * - Aesthetic-Usability Effect: Elevated navy glass, subtle gradient lighting
 * - Miller's Law: 4 focused analytics quadrants
 */

const AnalyticsPage = () => {
  const chartRef = useRef(null);

  const fetchAnalytics = useCallback(
    (onProgress) => simulateApiWithProgress({ revenueData, topProducts }, onProgress),
    []
  );
  const { loadingState, progress, timeLeft } = useSmartLoader(fetchAnalytics, []);

  useEffect(() => {
    if (chartRef.current) {
      const bars = chartRef.current.querySelectorAll('.analytics-bar');
      gsap.fromTo(
        bars,
        { scaleY: 0 },
        { scaleY: 1, duration: 1, stagger: 0.1, ease: 'elastic.out(1, 0.75)' }
      );
    }
  }, [loadingState]);

  return (
    <div>
      <Header
        title="Enterprise Intelligence & Analytics"
        subtitle="Predictive revenue modeling, peak cycle analysis, and conversion heuristics"
      />

      <div className="p-6 space-y-6">
        <SmartLoadingWrapper
          loadingState={loadingState}
          progress={progress}
          timeLeft={timeLeft}
          skeletonType="stats"
          skeletonCount={4}
          message="Computing cross-quarter predictive vectors..."
        >
          {/* Key Performance Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SpotlightCard className="border-blue-500/20">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Total ARR</span>
              <span className="text-3xl font-black text-white">$542,800</span>
              <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 mt-1">
                <TrendingUp size={13} /> +18.4% Year-over-Year
              </span>
            </SpotlightCard>

            <GlassCard className="border-emerald-500/20">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Average Order Value (AOV)</span>
              <span className="text-3xl font-black text-emerald-400">$189.40</span>
              <span className="text-xs text-slate-400 block mt-1">+4.2% from cart optimizations</span>
            </GlassCard>

            <GlassCard className="border-purple-500/20">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Conversion Rate</span>
              <span className="text-3xl font-black text-purple-400">3.82%</span>
              <span className="text-xs text-slate-400 block mt-1">Industry benchmark: 2.1%</span>
            </GlassCard>

            <GlassCard className="border-amber-500/20">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Gross Margin</span>
              <span className="text-3xl font-black text-amber-400">64.5%</span>
              <span className="text-xs text-slate-400 block mt-1">Healthy unit economics</span>
            </GlassCard>
          </div>
        </SmartLoadingWrapper>

        {/* Detailed Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GlassCard className="border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-white">Peak-End Revenue Trajectory</h3>
                  <p className="text-xs text-slate-400">Monthly fiscal expansion</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
                  <span className="text-xs text-slate-400">Gross Inflow</span>
                </div>
              </div>

              <div ref={chartRef} className="flex items-end gap-4 h-64 px-4 pt-6">
                {revenueData.map((d, i) => {
                  const max = 50000;
                  const pct = Math.round((d.revenue / max) * 100);
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <span className="text-[11px] font-mono text-slate-400">${(d.revenue / 1000).toFixed(0)}k</span>
                      <div className="w-full bg-white/[0.03] rounded-t-xl h-48 relative overflow-hidden flex items-end">
                        <div
                          className="analytics-bar w-full bg-gradient-to-t from-blue-700 via-blue-500 to-cyan-300 rounded-t-xl origin-bottom shadow-lg shadow-blue-500/20 transition-all duration-300 hover:brightness-125"
                          style={{ height: `${pct}%`, transformOrigin: 'bottom' }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-300">{d.month}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </div>

          <div>
            <GlassCard className="border-white/10 p-6">
              <h3 className="text-base font-bold text-white mb-1">Product Category Mix</h3>
              <p className="text-xs text-slate-400 mb-6">Revenue share by classification</p>

              <div className="space-y-4">
                {[
                  { name: 'Electronics & Audio', share: 44, color: 'from-blue-500 to-indigo-500' },
                  { name: 'Apparel & Textiles', share: 22, color: 'from-purple-500 to-pink-500' },
                  { name: 'Health & Fitness', share: 18, color: 'from-emerald-500 to-teal-500' },
                  { name: 'Home & Botanicals', share: 16, color: 'from-amber-500 to-orange-500' },
                ].map((cat) => (
                  <div key={cat.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300">{cat.name}</span>
                      <span className="text-white font-bold">{cat.share}%</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${cat.color}`}
                        style={{ width: `${cat.share}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <Award size={15} /> Peak Category Insight
                </p>
                Electronics delivers 44% of gross revenue with highest recurring customer retention.
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;

