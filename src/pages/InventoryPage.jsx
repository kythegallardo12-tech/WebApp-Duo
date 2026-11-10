import { useState, useCallback } from 'react';
import {
  Boxes,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Minus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  TrendingDown,
  Warehouse,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useOptimisticUpdate } from '../hooks/useOptimisticUpdate';
import { simulateApiWithProgress } from '../utils/mockApi';
import useStore from '../store/useStore';

/**
 * Inventory Management & Stock Replenishment
 * Applies:
 * - Fitts' Law: Single-tap "+5" and "-1" buttons calibrated for instantaneous adjustment
 * - Optimistic Updates: "A tap = update first, sync later ng updates on tap, no waits for server"
 * - Peak-End Rule: Restocking gives clear visual confirmation of renewed inventory levels
 * - Visual Hierarchy: Low stock warnings emphasized with distinct amber/rose elevations
 */

const InventoryPage = () => {
  const products = useStore((s) => s.products);
  const updateProduct = useStore((s) => s.updateProduct);
  const addToast = useStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // all | low | out | healthy
  const [restockModal, setRestockModal] = useState({ open: false, product: null, amount: 50 });

  const { execute: optimisticExecute, isSyncing, syncErrors } = useOptimisticUpdate();

  const fetchInventory = useCallback(
    (onProgress) => simulateApiWithProgress(products, onProgress),
    []
  );
  const { loadingState, progress, timeLeft } = useSmartLoader(fetchInventory, []);

  // Quick single-tap stock adjustment (Tap = instant mutate, sync behind the scenes)
  const handleQuickAdjust = (product, delta) => {
    const newStock = Math.max(0, product.stock + delta);
    const newStatus =
      newStock === 0 ? 'out_of_stock' : newStock <= product.minStock ? 'low_stock' : 'active';

    optimisticExecute({
      localUpdate: () => {
        updateProduct(product.id, { stock: newStock, status: newStatus });
      },
      serverSync: async () => {
        // Background sync
      },
      rollback: () => {
        updateProduct(product.id, { stock: product.stock, status: product.status });
      },
    });

    addToast({
      type: 'info',
      title: 'Stock Updated Instantly',
      message: `${product.name}: ${product.stock} → ${newStock} units`,
    });
  };

  const handleRestockSubmit = (e) => {
    e.preventDefault();
    if (!restockModal.product) return;

    const prod = restockModal.product;
    const addedAmount = parseInt(restockModal.amount, 10) || 0;
    const newStock = prod.stock + addedAmount;
    const newStatus = newStock <= prod.minStock ? 'low_stock' : 'active';

    optimisticExecute({
      localUpdate: () => {
        updateProduct(prod.id, { stock: newStock, status: newStatus });
      },
      serverSync: async () => {},
      rollback: () => {
        updateProduct(prod.id, { stock: prod.stock, status: prod.status });
      },
    });

    addToast({
      type: 'success',
      title: 'Restock Batch Committed',
      message: `Added +${addedAmount} units to "${prod.name}" (Now ${newStock})`,
    });

    setRestockModal({ open: false, product: null, amount: 50 });
  };

  // Filter calculations
  const totalStockUnits = products.reduce((acc, p) => acc + p.stock, 0);
  const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outOfStockItems = products.filter((p) => p.stock === 0);
  const healthyItems = products.filter((p) => p.stock > p.minStock);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (stockFilter === 'low') return p.stock > 0 && p.stock <= p.minStock;
    if (stockFilter === 'out') return p.stock === 0;
    if (stockFilter === 'healthy') return p.stock > p.minStock;
    return true;
  });

  return (
    <div>
      <Header
        title="Stock Logistics & Warehouse Engine"
        subtitle="Real-time multi-node inventory status and optimistic batch replenishing"
        syncState={{ isSyncing, syncErrors }}
      />

      <div className="p-6 space-y-6">
        {/* Metric Cards — Miller's Law: 4 simple status groups */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SpotlightCard className="border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Total Units</span>
              <Warehouse size={18} className="text-blue-400" />
            </div>
            <p className="text-3xl font-black text-white">{totalStockUnits.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-1">Across all storage sectors</p>
          </SpotlightCard>

          <GlassCard className="border-emerald-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Healthy Stock</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-3xl font-black text-emerald-400">{healthyItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Sufficient inventory levels</p>
          </GlassCard>

          <GlassCard className="border-amber-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Low Stock Alert</span>
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <p className="text-3xl font-black text-amber-400">{lowStockItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Below minimum threshold</p>
          </GlassCard>

          <GlassCard className="border-rose-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Depleted / Zero</span>
              <TrendingDown size={18} className="text-rose-400" />
            </div>
            <p className="text-3xl font-black text-rose-400">{outOfStockItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Needs urgent replenishment</p>
          </GlassCard>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search inventory by title or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input pl-10 text-sm h-11"
            />
          </div>

          <div className="flex items-center gap-2">
            {['all', 'healthy', 'low', 'out'].map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setStockFilter(filterKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                  stockFilter === filterKey
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {filterKey}
              </button>
            ))}
          </div>
        </div>

        {/* Smart Loading Wrapper */}
        <SmartLoadingWrapper
          loadingState={loadingState}
          progress={progress}
          timeLeft={timeLeft}
          skeletonType="table"
          skeletonCount={5}
          message="Querying warehouse stock allocation..."
        >
          <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5 font-semibold">Product Description</th>
                    <th className="px-5 py-3.5 font-semibold">SKU</th>
                    <th className="px-5 py-3.5 font-semibold">Stock Level</th>
                    <th className="px-5 py-3.5 font-semibold">Min Reserve</th>
                    <th className="px-5 py-3.5 font-semibold">Condition</th>
                    <th className="px-5 py-3.5 font-semibold text-center">Optimistic Taps</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Replenish</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredProducts.map((p) => {
                    const pct = Math.min(100, Math.round((p.stock / (p.minStock * 2 || 20)) * 100));
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{p.name}</p>
                          <p className="text-xs text-slate-400">${p.price.toFixed(2)} / unit</p>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-blue-400">{p.sku}</td>
                        <td className="px-5 py-4">
                          <div className="space-y-1.5 w-32">
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-white">{p.stock} units</span>
                              <span className="text-[10px] text-slate-400">{pct}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  p.stock === 0
                                    ? 'bg-rose-500 w-full'
                                    : p.stock <= p.minStock
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: `${Math.max(5, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-400">{p.minStock}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                              p.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : p.status === 'low_stock'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {p.status.replace('_', ' ')}
                          </span>
                        </td>
                        {/* Optimistic Quick Tap Buttons — Fitts' Law */}
                        <td className="px-5 py-4 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-white/10">
                            <button
                              onClick={() => handleQuickAdjust(p, -1)}
                              disabled={p.stock === 0}
                              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-rose-600/30 text-rose-400 disabled:opacity-20 transition-colors"
                              title="Decrease 1 unit (Immediate)"
                            >
                              <Minus size={13} />
                            </button>
                            <button
                              onClick={() => handleQuickAdjust(p, 5)}
                              className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold transition-colors"
                              title="Add 5 units (Immediate)"
                            >
                              +5
                            </button>
                            <button
                              onClick={() => handleQuickAdjust(p, 20)}
                              className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-blue-600/30 text-blue-400 text-xs font-bold transition-colors"
                              title="Add 20 units (Immediate)"
                            >
                              +20
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => setRestockModal({ open: true, product: p, amount: 50 })}
                            className="btn-ghost text-xs px-3 py-2 border border-white/10 hover:border-blue-500 hover:text-blue-400"
                          >
                            Restock PO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </SmartLoadingWrapper>
      </div>

      {/* Modal: Restock Purchase Order Confirmation */}
      <Modal
        isOpen={restockModal.open}
        onClose={() => setRestockModal({ open: false, product: null, amount: 50 })}
        title="Warehouse Inflow Dispatch"
        size="md"
      >
        {restockModal.product && (
          <form onSubmit={handleRestockSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
              Batch restock will immediately update visual telemetry and propagate to central ledger.
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Target Product</p>
              <p className="text-base font-bold text-white mt-0.5">{restockModal.product.name}</p>
              <p className="text-xs font-mono text-blue-400">{restockModal.product.sku}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Restock Inflow Units
              </label>
              <input
                type="number"
                min="1"
                value={restockModal.amount}
                onChange={(e) => setRestockModal({ ...restockModal, amount: e.target.value })}
                className="glass-input text-base font-black text-emerald-400"
                required
              />
            </div>

            <div className="flex gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRestockModal({ open: false, product: null, amount: 50 })}
                className="btn-ghost flex-1 py-3 text-sm justify-center"
              >
                Abort
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-blue-600/30"
              >
                Confirm Restock
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default InventoryPage;

