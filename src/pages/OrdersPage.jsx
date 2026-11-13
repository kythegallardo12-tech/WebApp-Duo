import { useState, useCallback, useMemo } from 'react';
import { Plus, Search, Clock, Truck, PackageCheck, AlertCircle, Eye, XCircle, ChevronRight, User, MapPin, Calendar, Trash2, Ban } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Orders
 * - Fulfillment path: pending -> processing -> shipped -> delivered (one tap per step)
 * - Cancellation is allowed while an order is pending or processing; it returns the
 *   reserved stock. Shipped and delivered orders cannot be cancelled.
 * - The server prices every order; the totals shown here before confirmation are previews.
 * - Peak-End Rule: delivering an order ends with a positive confirmation.
 */

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', next: 'processing', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', next: 'shipped', icon: AlertCircle },
  shipped: { label: 'Shipped', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', next: 'delivered', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', next: null, icon: PackageCheck },
  cancelled: { label: 'Cancelled', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', next: null, icon: Ban },
};
const CANCELLABLE = ['pending', 'processing'];
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const emptyForm = () => ({ customer: '', email: '', address: '', lines: [{ productId: '', qty: 1 }] });

const OrdersPage = () => {
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const pending = useStore((s) => s.pending);
  const loadOrders = useStore((s) => s.loadOrders);
  const createOrder = useStore((s) => s.createOrder);
  const transitionOrder = useStore((s) => s.transitionOrder);
  const cancelOrder = useStore((s) => s.cancelOrder);
  const addToast = useStore((s) => s.addToast);
  const canWrite = useAuth((s) => s.can)('orders:write');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createSheet, setCreateSheet] = useState(false);
  const [inspectId, setInspectId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);

  const fetchOrders = useCallback(() => loadOrders(), [loadOrders]);
  const { loadingState, progress, timeLeft, error, refetch } = useSmartLoader(fetchOrders, []);

  const orderable = products.filter((p) => !p.id.startsWith('tmp-'));
  const inspect = orders.find((o) => o.id === inspectId);

  const handleAdvanceStatus = async (order) => {
    const next = statusConfig[order.status]?.next;
    if (!next || !canWrite || order.optimistic) return;
    const res = await transitionOrder(order.id, next);
    if (res.ok) {
      addToast({
        type: next === 'delivered' ? 'success' : 'info',
        title: next === 'delivered' ? 'Order delivered' : 'Status updated',
        message: `${res.order.orderNumber} is now ${statusConfig[next].label.toLowerCase()}.`,
      });
    }
  };

  const preview = useMemo(
    () =>
      form.lines.reduce((sum, l) => {
        const p = products.find((x) => x.id === l.productId);
        return sum + (p ? p.price * (Number(l.qty) || 0) : 0);
      }, 0),
    [form.lines, products]
  );

  const setLine = (i, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setFormError(null);
    const lines = form.lines.filter((l) => l.productId);
    if (!form.customer.trim() || !form.address.trim()) return setFormError('Customer name and address are required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setFormError('Enter a valid customer email.');
    if (!lines.length) return setFormError('Add at least one product.');
    if (lines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) return setFormError('Quantities must be whole numbers of at least 1.');
    // Combine duplicate products and check visible stock (the server re-checks atomically).
    const combined = new Map();
    for (const l of lines) combined.set(l.productId, (combined.get(l.productId) || 0) + Number(l.qty));
    for (const [id, qty] of combined) {
      const p = products.find((x) => x.id === id);
      if (p && qty > p.stock) return setFormError(`Only ${p.stock} of "${p.name}" in stock.`);
    }
    const payload = {
      customer: form.customer.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      items: [...combined].map(([productId, qty]) => ({ productId, qty })),
    };
    setCreateSheet(false);
    const res = await createOrder(payload);
    if (res.ok) {
      setForm(emptyForm());
    } else if (['validation', 'conflict'].includes(res.error?.kind)) {
      setFormError(res.error.message);
      setCreateSheet(true); // keep what the user entered
    }
  };

  const handleCancelConfirm = async () => {
    const ord = cancelTarget;
    setCancelTarget(null);
    if (ord) await cancelOrder(ord.id);
  };

  const q = search.toLowerCase();
  const filteredOrders = orders.filter((o) => {
    if (q && ![o.orderNumber, o.customer, o.email].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  const live = orders.filter((o) => o.status !== 'cancelled');
  const delivered = live.filter((o) => o.status === 'delivered').length;

  return (
    <div>
      <Header title="Fulfillment & Dispatch Pipeline" subtitle="Order processing from pending to delivered" />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SpotlightCard className="border-blue-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Active Orders</span>
            <span className="text-2xl sm:text-3xl font-black text-white">{live.length}</span>
          </SpotlightCard>
          <GlassCard className="border-amber-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Awaiting Processing</span>
            <span className="text-2xl sm:text-3xl font-black text-amber-400">{orders.filter((o) => o.status === 'pending' || o.status === 'processing').length}</span>
          </GlassCard>
          <GlassCard className="border-purple-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">In Transit</span>
            <span className="text-2xl sm:text-3xl font-black text-purple-400">{orders.filter((o) => o.status === 'shipped').length}</span>
          </GlassCard>
          <GlassCard className="border-emerald-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Fulfillment Rate</span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-400">{Math.round((delivered / (live.length || 1)) * 100)}%</span>
          </GlassCard>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" aria-label="Search orders" placeholder="Search by order number, customer or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="glass-input pl-10 text-sm h-11" />
            </div>
            <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="glass-input text-sm h-11 w-full sm:w-44">
              <option value="all" className="bg-slate-900 text-white">All orders</option>
              {Object.entries(statusConfig).map(([k, v]) => (
                <option key={k} value={k} className="bg-slate-900 text-white">
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                setFormError(null);
                setCreateSheet(true);
              }}
              className="btn-primary h-11 px-5 text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <Plus size={18} />
              <span>New Order</span>
            </button>
          )}
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="table" skeletonCount={5} message="Loading orders…">
          <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5 font-semibold">Order</th>
                    <th className="px-5 py-3.5 font-semibold">Customer</th>
                    <th className="px-5 py-3.5 font-semibold">Items</th>
                    <th className="px-5 py-3.5 font-semibold">Total</th>
                    <th className="px-5 py-3.5 font-semibold">Status{canWrite ? ' (tap to advance)' : ''}</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredOrders.map((ord) => {
                    const cfg = statusConfig[ord.status] || statusConfig.pending;
                    const StatusIcon = cfg.icon;
                    const busy = !!pending[ord.id] || ord.optimistic;
                    return (
                      <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors" data-testid="order-row" data-order={ord.orderNumber}>
                        <td className="px-5 py-4">
                          <p className="font-mono text-xs font-bold text-blue-400">{ord.orderNumber}</p>
                          <p className="text-[11px] text-slate-400">{fmtDate(ord.date)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{ord.customer}</p>
                          <p className="text-xs text-slate-400">{ord.email}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-300 max-w-[260px]">{ord.items.map((i) => `${i.name} (×${i.qty})`).join(', ')}</td>
                        <td className="px-5 py-4 font-black text-white whitespace-nowrap">{money(ord.total)}</td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleAdvanceStatus(ord)}
                            disabled={!cfg.next || !canWrite || busy}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 transition-all enabled:hover:scale-105 disabled:cursor-default ${cfg.color}`}
                            aria-label={cfg.next && canWrite ? `${ord.orderNumber}: ${cfg.label}. Advance to ${statusConfig[cfg.next].label}` : `${ord.orderNumber}: ${cfg.label}`}
                            data-testid="order-status"
                          >
                            <StatusIcon size={12} />
                            <span>{busy ? 'Saving…' : cfg.label}</span>
                            {cfg.next && canWrite && !busy && <ChevronRight size={12} className="opacity-60" />}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <button onClick={() => setInspectId(ord.id)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white" aria-label={`Details of ${ord.orderNumber}`}>
                            <Eye size={15} />
                          </button>
                          {canWrite && CANCELLABLE.includes(ord.status) && !busy && (
                            <button onClick={() => setCancelTarget(ord)} className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400" aria-label={`Cancel ${ord.orderNumber}`} title="Cancel order">
                              <XCircle size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredOrders.length === 0 && <p className="text-center text-sm text-slate-400 py-12">No orders match these filters.</p>}
            </div>
          </GlassCard>
        </SmartLoadingWrapper>
      </div>

      <Sheet isOpen={createSheet} onClose={() => setCreateSheet(false)} title="Create Order">
        <form onSubmit={handleCreateOrder} className="space-y-4" noValidate>
          {[
            ['customer', 'Customer Full Name', 'text', 'e.g. Elena Rostova'],
            ['email', 'Customer Email', 'email', 'elena@example.org'],
            ['address', 'Delivery Address', 'text', '88 Tech Boulevard, Sector 4'],
          ].map(([key, label, type, placeholder]) => (
            <div key={key}>
              <label htmlFor={`order-${key}`} className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                {label}
              </label>
              <input id={`order-${key}`} type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="glass-input text-sm" placeholder={placeholder} required />
            </div>
          ))}

          <fieldset className="space-y-3">
            <legend className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Items</legend>
            {form.lines.map((line, i) => {
              const p = products.find((x) => x.id === line.productId);
              return (
                <div key={i} className="flex gap-2 items-start" data-testid="order-line">
                  <div className="flex-1 min-w-0">
                    <select aria-label={`Product for line ${i + 1}`} value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className="glass-input text-sm">
                      <option value="" className="bg-slate-900 text-white">Choose a product…</option>
                      {orderable.map((op) => (
                        <option key={op.id} value={op.id} disabled={op.stock === 0} className="bg-slate-900 text-white">
                          {op.name} — {money(op.price)} ({op.stock} in stock)
                        </option>
                      ))}
                    </select>
                    {p && p.stock <= p.minStock && <p className="text-[11px] text-amber-400 mt-1">Low stock: {p.stock} left</p>}
                  </div>
                  <input aria-label={`Quantity for line ${i + 1}`} type="number" min="1" step="1" value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="glass-input text-sm font-bold w-20" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines }))}
                    disabled={form.lines.length === 1}
                    className="p-3 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 disabled:opacity-20"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { productId: '', qty: 1 }] }))} className="btn-ghost text-xs px-3 py-2 border border-white/10">
              <Plus size={14} /> Add item
            </button>
          </fieldset>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between text-sm">
            <span className="text-slate-400">Estimated total</span>
            <span className="font-black text-white">{money(preview)}</span>
          </div>
          <p className="text-[11px] text-slate-500">Prices and stock are confirmed by the server when the order is saved.</p>

          {formError && (
            <p className="text-xs text-rose-400" role="alert">
              {formError}
            </p>
          )}

          <div className="pt-4 border-t border-white/10 flex gap-3">
            <button type="button" onClick={() => setCreateSheet(false)} className="btn-ghost flex-1 py-3 text-sm justify-center">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-blue-600/30">
              Create Order
            </button>
          </div>
        </form>
      </Sheet>

      <Sheet isOpen={!!inspect} onClose={() => setInspectId(null)} title="Order Summary">
        {inspect && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-xs font-mono text-blue-400 block font-semibold">{inspect.orderNumber}</span>
              <p className="text-lg font-black text-white mt-1">Total: {money(inspect.total)}</p>
              <span className={`inline-block mt-2 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${statusConfig[inspect.status]?.color}`}>{statusConfig[inspect.status]?.label}</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <User size={16} className="text-blue-400 flex-shrink-0" />
                <span>
                  {inspect.customer} ({inspect.email})
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <MapPin size={16} className="text-blue-400 flex-shrink-0" />
                <span>{inspect.address}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Calendar size={16} className="text-blue-400 flex-shrink-0" />
                <span>{new Date(inspect.date).toLocaleString()}</span>
              </div>
            </div>
            <div>
              <h4 className="text-xs uppercase font-semibold text-slate-400 mb-3">Line Items (prices at time of order)</h4>
              <div className="space-y-2">
                {inspect.items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-bold text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.sku} · {item.qty} × {money(item.price)}
                      </p>
                    </div>
                    <span className="font-black text-emerald-400">{money(item.qty * item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
            {inspect.statusHistory?.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-semibold text-slate-400 mb-3">History</h4>
                <ol className="space-y-1 text-xs text-slate-300">
                  {inspect.statusHistory.map((h, i) => (
                    <li key={i}>
                      <span className="font-semibold capitalize">{h.status}</span> · {new Date(h.at).toLocaleString()}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Order" size="sm">
        <div className="text-center py-2">
          <p className="text-sm text-slate-300 mb-2">
            Cancel order <strong className="text-white">{cancelTarget?.orderNumber}</strong> for {cancelTarget?.customer}?
          </p>
          <p className="text-xs text-slate-400 mb-6">The reserved items go back into stock. This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setCancelTarget(null)} className="btn-ghost flex-1 py-3 text-sm justify-center">
              Keep Order
            </button>
            <button onClick={handleCancelConfirm} className="btn-danger flex-1 py-3 text-sm font-bold justify-center">
              Cancel Order
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OrdersPage;
