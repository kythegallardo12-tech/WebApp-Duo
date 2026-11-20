import { useState, useCallback } from 'react';
import { AlertTriangle, Minus, Search, History, SlidersHorizontal, AlertCircle } from 'lucide-react';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import { Stat } from '../components/ui/Stat';
import { PAGE } from '../components/ui/status';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useCurrency } from '../hooks/useCurrency';
import { useCompact } from '../hooks/useMediaQuery';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Inventory and stock adjustments
 * - One-tap −1 / +5 / +20 buttons; each tap is its own idempotent adjustment, so retries never
 *   double-apply. The new level shows at once and is confirmed by the server.
 * - Every change is recorded with who made it, when and why (movement history).
 */

const typeLabel = { initial: 'Opening stock', adjustment: 'Adjustment', order: 'Order', cancel: 'Cancellation' };

const MovementHistory = ({ product }) => {
  const fetchMoves = useCallback(() => api.movements({ product: product.id, limit: 50 }), [product.id]);
  const { data, loadingState, error, refetch } = useSmartLoader(fetchMoves, [product.id]);
  return (
    <SmartLoadingWrapper loadingState={loadingState} error={error} onRetry={refetch} skeletonType="table" skeletonCount={4} message="Loading stock history…">
      <ol className="divide-y divide-line rounded-xl border border-line overflow-hidden" data-testid="movement-list">
        {(data?.items || []).map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-4 p-3.5 bg-surface">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{typeLabel[m.type] || m.type}</p>
              <p className="text-sm text-ink-2 break-words">{m.reason || '—'}</p>
              <p className="text-xs text-ink-3 mt-0.5">
                {new Date(m.createdAt).toLocaleString()}
                {m.actor?.name && ` · by ${m.actor.name}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-semibold tabular ${m.delta > 0 ? 'text-success' : 'text-danger'}`}>
                {m.delta > 0 ? '+' : ''}
                {m.delta}
              </p>
              <p className="text-xs text-ink-3 tabular">→ {m.stockAfter}</p>
            </div>
          </li>
        ))}
        {data && data.items.length === 0 && <li className="p-4 text-sm text-ink-3">No stock movements recorded yet.</li>}
      </ol>
    </SmartLoadingWrapper>
  );
};

const StockLevel = ({ product: p }) => {
  const pct = Math.min(100, Math.round((p.stock / (p.minStock * 2 || 20)) * 100));
  const tone = p.stock === 0 ? 'bg-danger' : p.stock <= p.minStock ? 'bg-warning' : 'bg-success';
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold text-ink tabular" data-testid="stock-value">
        {p.stock} units
      </span>
      <div className="meter" aria-hidden="true">
        <span className={tone} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
};

const QuickAdjust = ({ product: p, disabled, onAdjust }) => (
  <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-line-strong bg-canvas p-0.5" role="group" aria-label={`Quick adjust ${p.name}`}>
    <button type="button" onClick={() => onAdjust(p, -1)} disabled={p.stock === 0 || disabled} className="icon-btn w-9 h-8" aria-label={`Remove 1 unit of ${p.name}`} title="Remove 1">
      <Minus size={14} />
    </button>
    <button type="button" onClick={() => onAdjust(p, 5)} disabled={disabled} className="icon-btn w-10 h-8 text-xs font-semibold text-ink" aria-label={`Add 5 units of ${p.name}`}>
      +5
    </button>
    <button type="button" onClick={() => onAdjust(p, 20)} disabled={disabled} className="icon-btn w-10 h-8 text-xs font-semibold text-ink" aria-label={`Add 20 units of ${p.name}`}>
      +20
    </button>
  </div>
);

const HistoryButton = ({ product: p, disabled, onClick }) => (
  <button type="button" onClick={() => onClick(p)} disabled={disabled} className="icon-btn" aria-label={`Stock history for ${p.name}`} title="Stock history">
    <History size={16} />
  </button>
);

const AdjustButton = ({ product: p, disabled, onClick }) => (
  <button type="button" onClick={() => onClick(p)} disabled={disabled} className="btn btn-secondary btn-sm">
    <SlidersHorizontal size={14} aria-hidden="true" /> Adjust
  </button>
);

const FILTERS = [
  ['all', 'All'],
  ['healthy', 'Healthy'],
  ['low', 'Low'],
  ['out', 'Out'],
];

const InventoryPage = () => {
  const { money } = useCurrency();
  const products = useStore((s) => s.products);
  const pending = useStore((s) => s.pending);
  const adjustStock = useStore((s) => s.adjustStock);
  const loadProducts = useStore((s) => s.loadProducts);
  const canAdjust = useAuth((s) => s.can)('inventory:adjust');
  const showAlerts = useStore((s) => s.settings?.lowStockAlerts !== false);
  const compact = useCompact();

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
    if (!Number.isInteger(amount) || amount <= 0) return setFormError({ field: 'adj-amount', message: 'Enter a whole number greater than 0.' });
    if (!adjustModal.reason.trim()) return setFormError({ field: 'adj-reason', message: 'Add a reason so the change can be traced later.' });
    const delta = adjustModal.direction === 'remove' ? -amount : amount;
    if (adjustModal.product.stock + delta < 0) return setFormError({ field: 'adj-amount', message: `Only ${adjustModal.product.stock} units are in stock.` });
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
  const needsRestock = [...outOfStockItems, ...lowStockItems];

  const q = search.toLowerCase();
  const filteredProducts = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    if (stockFilter === 'low') return p.stock > 0 && p.stock <= p.minStock;
    if (stockFilter === 'out') return p.stock === 0;
    if (stockFilter === 'healthy') return p.stock > p.minStock;
    return true;
  });

  const openAdjust = (p) => {
    setFormError(null);
    setAdjustModal({ product: p, amount: 50, direction: 'add', reason: 'Restock delivery' });
  };

  const fieldError = (id) => (formError?.field === id ? formError.message : null);

  return (
    <>
      <Header title="Inventory" subtitle="Stock levels, adjustments and history" />

      <div className={PAGE}>
        <section aria-label="Stock summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat label="Units in stock" value={totalStockUnits.toLocaleString()} meta="Across the catalog" />
          <Stat label="Healthy" value={healthyItems.length} tone="success" meta="Above threshold" />
          <Stat label="Low stock" value={lowStockItems.length} tone="warning" meta="At or below threshold" valueTestId="low-stock-count" />
          <Stat label="Out of stock" value={outOfStockItems.length} tone="danger" meta="Needs restocking" />
        </section>

        {showAlerts && needsRestock.length > 0 && (
          <div className="banner banner-warning" role="status" data-testid="low-stock-alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <p>
              <strong className="font-semibold">Low-stock alert:</strong> {needsRestock.slice(0, 4).map((p) => p.name).join(', ')}
              {needsRestock.length > 4 ? ` and ${needsRestock.length - 4} more` : ''} {needsRestock.length === 1 ? 'needs' : 'need'} restocking.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="search flex-1 sm:max-w-md">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Search inventory" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="input" />
          </div>
          <div className="segmented self-start" role="group" aria-label="Stock filter">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setStockFilter(key)} aria-pressed={stockFilter === key}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="table" skeletonCount={6} message="Loading stock levels…">
          <div className="card overflow-hidden">
            {compact ? (
              <ul className="divide-y divide-line">
                {filteredProducts.map((p) => {
                  const temp = p.id.startsWith('tmp-');
                  return (
                    <li key={p.id} className="p-4 space-y-3" data-testid="inventory-row" data-sku={p.sku}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{p.name}</p>
                          <p className="text-xs text-ink-3">
                            <span className="font-mono">{p.sku}</span> · {money(p.price)} each
                            {pending[p.id] && <span className="ml-1.5 text-accent-ink">· saving…</span>}
                          </p>
                        </div>
                        <HistoryButton product={p} disabled={temp} onClick={setHistoryFor} />
                      </div>
                      <StockLevel product={p} />
                      <p className="text-xs text-ink-3">Low-stock threshold: {p.minStock}</p>
                      {canAdjust && (
                        <div className="flex items-center justify-between gap-2">
                          <QuickAdjust product={p} disabled={temp} onAdjust={handleQuickAdjust} />
                          <AdjustButton product={p} disabled={temp} onClick={openAdjust} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="table-wrap">
                <table className="table min-w-[50rem]">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">SKU</th>
                      <th scope="col">Stock</th>
                      <th scope="col" className="text-right">Threshold</th>
                      <th scope="col">{canAdjust ? 'Quick adjust' : ''}</th>
                      <th scope="col" className="text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const temp = p.id.startsWith('tmp-');
                      return (
                        <tr key={p.id} data-testid="inventory-row" data-sku={p.sku}>
                          <td>
                            <p className="font-medium text-ink">{p.name}</p>
                            <p className="text-xs text-ink-3">
                              {money(p.price)} each
                              {pending[p.id] && <span className="ml-1.5 text-accent-ink">· saving…</span>}
                            </p>
                          </td>
                          <td className="font-mono text-xs text-ink-2 whitespace-nowrap">{p.sku}</td>
                          <td>
                            <div className="w-36">
                              <StockLevel product={p} />
                            </div>
                          </td>
                          <td className="text-right text-ink-2 tabular">{p.minStock}</td>
                          <td>{canAdjust ? <QuickAdjust product={p} disabled={temp} onAdjust={handleQuickAdjust} /> : <span className="text-xs text-ink-3">View only</span>}</td>
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <HistoryButton product={p} disabled={temp} onClick={setHistoryFor} />
                              {canAdjust && <AdjustButton product={p} disabled={temp} onClick={openAdjust} />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filteredProducts.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-ink">No products match</p>
                <p className="text-sm text-ink-3 mt-1">Try another search or stock filter.</p>
              </div>
            )}
          </div>
        </SmartLoadingWrapper>
      </div>

      <Modal
        isOpen={!!adjustModal}
        onClose={() => setAdjustModal(null)}
        title="Adjust stock"
        description={adjustModal ? `${adjustModal.product.name} · ${adjustModal.product.stock} in stock` : undefined}
        size="md"
      >
        {adjustModal && (
          <form onSubmit={handleAdjustSubmit} className="space-y-5" noValidate>
            <div className="segmented w-full" role="radiogroup" aria-label="Direction">
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
                  className="flex-1"
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="adj-amount" className="field-label">
                Units
              </label>
              <input
                id="adj-amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={adjustModal.amount}
                onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })}
                className="input tabular"
                aria-invalid={fieldError('adj-amount') ? true : undefined}
                aria-describedby={fieldError('adj-amount') ? 'adj-amount-error' : undefined}
                data-autofocus
              />
              {fieldError('adj-amount') && (
                <p id="adj-amount-error" className="field-error" role="alert">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {fieldError('adj-amount')}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="adj-reason" className="field-label">
                Reason
              </label>
              <input
                id="adj-reason"
                type="text"
                maxLength={200}
                value={adjustModal.reason}
                onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                className="input"
                placeholder="e.g. Supplier delivery, damaged goods, stock count"
                aria-invalid={fieldError('adj-reason') ? true : undefined}
                aria-describedby={fieldError('adj-reason') ? 'adj-reason-error' : undefined}
              />
              {fieldError('adj-reason') && (
                <p id="adj-reason-error" className="field-error" role="alert">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {fieldError('adj-reason')}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-5 border-t border-line">
              <button type="button" onClick={() => setAdjustModal(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save adjustment
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Sheet isOpen={!!historyFor} onClose={() => setHistoryFor(null)} title="Stock history" description={historyFor ? `${historyFor.name} · ${historyFor.sku}` : undefined}>
        {historyFor && <MovementHistory product={historyFor} />}
      </Sheet>
    </>
  );
};

export default InventoryPage;
