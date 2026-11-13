import { useState, useCallback } from 'react';
import { AlertTriangle, Minus, Search, CheckCircle2, TrendingDown, Warehouse, History } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Inventory & Stock Adjustments
 * - Fitts' Law: single-tap -1 / +5 / +20 buttons
 * - Optimistic: the new level shows at once and is confirmed by the server
 *   (each tap is its own idempotent adjustment, so retries never double-apply)
 * - Every change is recorded with who made it, when and why (movement history)
 */

const MovementHistory = ({ product }) => {
  const fetchMoves = useCallback(() => api.movements({ product: product.id, limit: 50 }), [product.id]);
  const { data, loadingState, error, refetch } = useSmartLoader(fetchMoves, [product.id]);
  const typeLabel = { initial: 'Opening', adjustment: 'Adjustment', order: 'Order', cancel: 'Cancellation' };
  return (
    <SmartLoadingWrapper loadingState={loadingState} error={error} onRetry={refetch} skeletonType="table" skeletonCount={4} message="Loading stock history…">
      <ul className="space-y-2" data-testid="movement-list">
        {(data?.items || []).map((m) => (
          <li key={m.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-white">
                {typeLabel[m.type] || m.type}
                <span className="text-xs font-normal text-slate-400"> · {new Date(m.createdAt).toLocaleString()}</span>
              </p>
              <p className="text-xs text-slate-400 truncate">{m.reason || '—'}</p>
              {m.actor?.name && <p className="text-[11px] text-slate-500">by {m.actor.name}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`font-black ${m.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {m.delta > 0 ? '+' : ''}
                {m.delta}
              </p>
              <p className="text-[11px] text-slate-500">→ {m.stockAfter}</p>
            </div>
          </li>
        ))}
        {data && data.items.length === 0 && <li className="text-sm text-slate-400">No stock movements recorded yet.</li>}
      </ul>
    </SmartLoadingWrapper>
  );
};

const InventoryPage = () => {
  const products = useStore((s) => s.products);
  const pending = useStore((s) => s.pending);
  const adjustStock = useStore((s) => s.adjustStock);
  const loadProducts = useStore((s) => s.loadProducts);
  const canAdjust = useAuth((s) => s.can)('inventory:adjust');

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [adjustModal, setAdjustModal] = useState(null); // { product, amount, direction, reason }
  const [historyFor, setHistoryFor] = useState(null);
  const [formError, setFormError] = useState(null);

  const fetchInventory = useCallback(() => loadProducts(), [loadProducts]);
  const { loadingState, progress, timeLeft, error, refetch } = useSmartLoader(fetchInventory, []);

  const handleQuickAdjust = (product, delta) => {
    adjustStock(product.id, delta, delta > 0 ? `Quick restock +${delta}` : `Quick deduction ${delta}`);
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(adjustModal.amount);
    if (!Number.isInteger(amount) || amount <= 0) return setFormError('Enter a whole number greater than 0.');
    if (!adjustModal.reason.trim()) return setFormError('Give a reason so the change is traceable.');
    const delta = adjustModal.direction === 'remove' ? -amount : amount;
    if (adjustModal.product.stock + delta < 0) return setFormError(`Only ${adjustModal.product.stock} units are in stock.`);
    const { product, reason } = adjustModal;
    setAdjustModal(null);
    setFormError(null);
    const res = await adjustStock(product.id, delta, reason.trim());
    if (res.ok) {
      useStore.getState().addToast({ type: 'success', title: 'Stock saved', message: `${product.name}: now ${res.product.stock} units.` });
    }
  };

  const totalStockUnits = products.reduce((acc, p) => acc + p.stock, 0);
  const lowStockItems = products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outOfStockItems = products.filter((p) => p.stock === 0);
  const healthyItems = products.filter((p) => p.stock > p.minStock);

  const q = search.toLowerCase();
  const filteredProducts = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    if (stockFilter === 'low') return p.stock > 0 && p.stock <= p.minStock;
    if (stockFilter === 'out') return p.stock === 0;
    if (stockFilter === 'healthy') return p.stock > p.minStock;
    return true;
  });

  return (
    <div>
      <Header title="Stock Logistics & Warehouse" subtitle="Live stock levels, low-stock alerts and recorded adjustments" />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SpotlightCard className="border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Total Units</span>
              <Warehouse size={18} className="text-blue-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-white">{totalStockUnits.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400 mt-1">Across the live catalog</p>
          </SpotlightCard>
          <GlassCard className="border-emerald-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Healthy</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-400">{healthyItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Above threshold</p>
          </GlassCard>
          <GlassCard className="border-amber-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Low Stock</span>
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-400" data-testid="low-stock-count">{lowStockItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">At or below threshold</p>
          </GlassCard>
          <GlassCard className="border-rose-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-semibold text-slate-400">Out of Stock</span>
              <TrendingDown size={18} className="text-rose-400" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-400">{outOfStockItems.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">Needs replenishment</p>
          </GlassCard>
        </div>

        {lowStockItems.length + outOfStockItems.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200 flex items-start gap-3" role="status">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <p>
              <strong>Low-stock alert:</strong>{' '}
              {[...outOfStockItems, ...lowStockItems].slice(0, 4).map((p) => p.name).join(', ')}
              {lowStockItems.length + outOfStockItems.length > 4 ? ` and ${lowStockItems.length + outOfStockItems.length - 4} more` : ''} need restocking.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" aria-label="Search inventory" placeholder="Search inventory by title or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input pl-10 text-sm h-11" />
          </div>
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Stock filter">
            {['all', 'healthy', 'low', 'out'].map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setStockFilter(filterKey)}
                aria-pressed={stockFilter === filterKey}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                  stockFilter === filterKey ? 'bg-blue-600 text-white border-blue-400 shadow-md' : 'bg-white/[0.03] text-slate-400 border-white/5 hover:text-white'
                }`}
              >
                {filterKey}
              </button>
            ))}
          </div>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="table" skeletonCount={6} message="Loading stock levels…">
          <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5 font-semibold">Product</th>
                    <th className="px-5 py-3.5 font-semibold">SKU</th>
                    <th className="px-5 py-3.5 font-semibold">Stock Level</th>
                    <th className="px-5 py-3.5 font-semibold">Min Reserve</th>
                    <th className="px-5 py-3.5 font-semibold text-center">Quick Adjust</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredProducts.map((p) => {
                    const pct = Math.min(100, Math.round((p.stock / (p.minStock * 2 || 20)) * 100));
                    const temp = p.id.startsWith('tmp-');
                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors" data-testid="inventory-row" data-sku={p.sku}>
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            ${p.price.toFixed(2)} / unit
                            {pending[p.id] && <span className="ml-2 text-blue-300">· saving…</span>}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-blue-400">{p.sku}</td>
                        <td className="px-5 py-4">
                          <div className="space-y-1.5 w-32">
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-white" data-testid="stock-value">{p.stock} units</span>
                              <span className="text-[10px] text-slate-400">{pct}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${p.stock === 0 ? 'bg-rose-500' : p.stock <= p.minStock ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                style={{ width: `${Math.max(5, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-400">{p.minStock}</td>
                        <td className="px-5 py-4 text-center">
                          {canAdjust ? (
                            <div className="inline-flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-white/10">
                              <button onClick={() => handleQuickAdjust(p, -1)} disabled={p.stock === 0 || temp} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-rose-600/30 text-rose-400 disabled:opacity-20 transition-colors" aria-label={`Remove 1 unit of ${p.name}`}>
                                <Minus size={13} />
                              </button>
                              <button onClick={() => handleQuickAdjust(p, 5)} disabled={temp} className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold transition-colors disabled:opacity-20" aria-label={`Add 5 units of ${p.name}`}>
                                +5
                              </button>
                              <button onClick={() => handleQuickAdjust(p, 20)} disabled={temp} className="px-2.5 h-8 rounded-lg flex items-center justify-center hover:bg-blue-600/30 text-blue-400 text-xs font-bold transition-colors disabled:opacity-20" aria-label={`Add 20 units of ${p.name}`}>
                                +20
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">View only</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <button onClick={() => setHistoryFor(p)} disabled={temp} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white disabled:opacity-30" aria-label={`Stock history for ${p.name}`} title="Stock history">
                            <History size={15} />
                          </button>
                          {canAdjust && (
                            <button
                              onClick={() => {
                                setFormError(null);
                                setAdjustModal({ product: p, amount: 50, direction: 'add', reason: 'Restock PO' });
                              }}
                              disabled={temp}
                              className="btn-ghost text-xs px-3 py-2 border border-white/10 hover:border-blue-500 hover:text-blue-400 disabled:opacity-30"
                            >
                              Adjust
                            </button>
                          )}
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

      <Modal isOpen={!!adjustModal} onClose={() => setAdjustModal(null)} title="Stock Adjustment" size="md">
        {adjustModal && (
          <form onSubmit={handleAdjustSubmit} className="space-y-4" noValidate>
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Product</p>
              <p className="text-base font-bold text-white mt-0.5">{adjustModal.product.name}</p>
              <p className="text-xs font-mono text-blue-400">
                {adjustModal.product.sku} · {adjustModal.product.stock} in stock
              </p>
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Direction">
              {[
                ['add', 'Add stock'],
                ['remove', 'Remove stock'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={adjustModal.direction === value}
                  onClick={() => setAdjustModal({ ...adjustModal, direction: value })}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border ${adjustModal.direction === value ? 'bg-blue-600 border-blue-400 text-white' : 'border-white/10 text-slate-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="adj-amount" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Units
              </label>
              <input id="adj-amount" type="number" min="1" step="1" value={adjustModal.amount} onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })} className="glass-input text-base font-black text-emerald-400" />
            </div>
            <div>
              <label htmlFor="adj-reason" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Reason
              </label>
              <input id="adj-reason" type="text" maxLength={200} value={adjustModal.reason} onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })} className="glass-input text-sm" placeholder="e.g. Supplier delivery, damaged goods, stock count" />
            </div>
            {formError && (
              <p className="text-xs text-rose-400" role="alert">
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-3 border-t border-white/10">
              <button type="button" onClick={() => setAdjustModal(null)} className="btn-ghost flex-1 py-3 text-sm justify-center">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-blue-600/30">
                Save Adjustment
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Sheet isOpen={!!historyFor} onClose={() => setHistoryFor(null)} title={historyFor ? `Stock history · ${historyFor.name}` : 'Stock history'}>
        {historyFor && <MovementHistory product={historyFor} />}
      </Sheet>
    </div>
  );
};

export default InventoryPage;
