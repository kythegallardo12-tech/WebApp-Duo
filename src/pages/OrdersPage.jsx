import { useState, useCallback, useMemo } from 'react';
import { Plus, Search, Eye, XCircle, ArrowRight, Trash2, AlertCircle, ShoppingCart } from 'lucide-react';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import { Stat } from '../components/ui/Stat';
import { orderStatus, PAGE } from '../components/ui/status';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useCurrency } from '../hooks/useCurrency';
import { useCompact } from '../hooks/useMediaQuery';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Orders
 * - Fulfillment path: pending → processing → shipped → delivered, one explicit step at a time.
 * - Cancellation is allowed while an order is pending or processing; it returns the reserved
 *   stock. Shipped and delivered orders cannot be cancelled.
 * - The server prices every order; totals shown before saving are estimates.
 */

const CANCELLABLE = ['pending', 'processing'];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const emptyForm = () => ({ customer: '', email: '', address: '', lines: [{ productId: '', qty: 1 }] });

const OrdersPage = () => {
  const { money } = useCurrency();
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const pending = useStore((s) => s.pending);
  const loadOrders = useStore((s) => s.loadOrders);
  const createOrder = useStore((s) => s.createOrder);
  const transitionOrder = useStore((s) => s.transitionOrder);
  const cancelOrder = useStore((s) => s.cancelOrder);
  const addToast = useStore((s) => s.addToast);
  const canWrite = useAuth((s) => s.can)('orders:write');
  const compact = useCompact();

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
    const next = orderStatus[order.status]?.next;
    if (!next || !canWrite || order.optimistic) return;
    const res = await transitionOrder(order.id, next);
    if (res.ok) {
      addToast({
        type: next === 'delivered' ? 'success' : 'info',
        title: next === 'delivered' ? 'Order delivered' : 'Status updated',
        message: `${res.order.orderNumber} is now ${orderStatus[next].label.toLowerCase()}.`,
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
    if (!form.customer.trim() || !form.address.trim()) return setFormError('Customer name and delivery address are required.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setFormError('Enter a valid customer email.');
    if (!lines.length) return setFormError('Add at least one product.');
    if (lines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) return setFormError('Quantities must be whole numbers of at least 1.');
    // Combine duplicate products and check visible stock (the server re-checks atomically).
    const combined = new Map();
    for (const l of lines) combined.set(l.productId, (combined.get(l.productId) || 0) + Number(l.qty));
    for (const [id, qty] of combined) {
      const p = products.find((x) => x.id === id);
      if (p && qty > p.stock) return setFormError(`Only ${p.stock} of “${p.name}” in stock.`);
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

  // Next step, details and cancel always sit in the same three slots so rows line up.
  const orderActions = ({ ord, st, busy }) => (
    <div className="inline-flex items-center gap-1">
      {canWrite && st.next && !busy && (
        <button type="button" onClick={() => handleAdvanceStatus(ord)} className="btn btn-secondary btn-sm" aria-label={`${st.action}: ${ord.orderNumber}`} data-testid="order-advance">
          {st.action} <ArrowRight size={13} aria-hidden="true" />
        </button>
      )}
      <button type="button" onClick={() => setInspectId(ord.id)} className="icon-btn" aria-label={`Details of ${ord.orderNumber}`} title="Details">
        <Eye size={16} />
      </button>
      {canWrite &&
        (CANCELLABLE.includes(ord.status) && !busy ? (
          <button type="button" onClick={() => setCancelTarget(ord)} className="icon-btn icon-btn-danger" aria-label={`Cancel ${ord.orderNumber}`} title="Cancel order">
            <XCircle size={16} />
          </button>
        ) : (
          <span className="w-9 max-[639px]:hidden" aria-hidden="true" />
        ))}
    </div>
  );

  const q = search.toLowerCase();
  const filteredOrders = orders.filter((o) => {
    if (q && ![o.orderNumber, o.customer, o.email].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  const live = orders.filter((o) => o.status !== 'cancelled');
  const delivered = live.filter((o) => o.status === 'delivered').length;

  return (
    <>
      <Header title="Orders" subtitle="From pending to delivered" />

      <div className={PAGE}>
        <section aria-label="Order summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat label="Active orders" value={live.length} meta="Excluding cancelled" />
          <Stat label="To process" value={orders.filter((o) => o.status === 'pending' || o.status === 'processing').length} tone="warning" meta="Pending or processing" />
          <Stat label="Shipped" value={orders.filter((o) => o.status === 'shipped').length} meta="On the way" />
          <Stat label="Delivered" value={`${Math.round((delivered / (live.length || 1)) * 100)}%`} tone="success" meta="Of active orders" />
        </section>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="search flex-1 sm:max-w-md">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Search orders" placeholder="Search by order number, customer or email" value={search} onChange={(e) => setSearch(e.target.value)} className="input" />
          </div>
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input sm:w-44">
            <option value="all">All statuses</option>
            {Object.entries(orderStatus).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setCreateSheet(true);
              }}
              className="btn btn-primary sm:ml-auto"
            >
              <Plus size={17} aria-hidden="true" />
              <span>New order</span>
            </button>
          )}
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="table" skeletonCount={5} message="Loading orders…">
          <div className="card overflow-hidden">
            {compact ? (
              <ul className="divide-y divide-line">
                {filteredOrders.map((ord) => {
                  const st = orderStatus[ord.status] || orderStatus.pending;
                  const busy = !!pending[ord.id] || ord.optimistic;
                  return (
                    <li key={ord.id} className="p-4 space-y-2.5" data-testid="order-row" data-order={ord.orderNumber}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{ord.customer}</p>
                          <p className="text-xs text-ink-3">
                            <span className="font-mono">{ord.orderNumber}</span> · {fmtDate(ord.date)}
                          </p>
                        </div>
                        <p className="font-semibold text-ink tabular">{money(ord.total)}</p>
                      </div>
                      <p className="text-sm text-ink-2">{ord.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className={`badge ${st.badge}`} data-testid="order-status">
                          {busy ? 'Saving…' : st.label}
                        </span>
                        {orderActions({ ord, st, busy })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <div className="table-wrap">
              <table className="table min-w-[60rem]">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Items</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((ord) => {
                    const st = orderStatus[ord.status] || orderStatus.pending;
                    const busy = !!pending[ord.id] || ord.optimistic;
                    return (
                      <tr key={ord.id} data-testid="order-row" data-order={ord.orderNumber}>
                        <td className="whitespace-nowrap">
                          <p className="font-mono text-[0.8125rem] text-ink">{ord.orderNumber}</p>
                          <p className="text-xs text-ink-3">{fmtDate(ord.date)}</p>
                        </td>
                        <td>
                          <p className="font-medium text-ink">{ord.customer}</p>
                          <p className="text-xs text-ink-3">{ord.email}</p>
                        </td>
                        <td className="text-ink-2 max-w-[16rem]">
                          <p className="line-clamp-2">{ord.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</p>
                        </td>
                        <td className="text-right font-medium text-ink tabular whitespace-nowrap">{money(ord.total)}</td>
                        <td>
                          <span className={`badge ${st.badge}`} data-testid="order-status">
                            {busy ? 'Saving…' : st.label}
                          </span>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {orderActions({ ord, st, busy })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {filteredOrders.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <span className="mx-auto mb-3 flex w-11 h-11 items-center justify-center rounded-full bg-raised text-ink-3">
                    <ShoppingCart size={20} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium text-ink">{orders.length ? 'No orders match these filters' : 'No orders yet'}</p>
                  <p className="text-sm text-ink-3 mt-1">{orders.length ? 'Try another search or status.' : 'New orders appear here as soon as they are created.'}</p>
                </div>
              )}
          </div>
        </SmartLoadingWrapper>
      </div>

      <Sheet isOpen={createSheet} onClose={() => setCreateSheet(false)} title="New order" width="34rem">
        <form onSubmit={handleCreateOrder} className="space-y-5" noValidate>
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-ink mb-3">Customer</legend>
            {[
              ['customer', 'Customer name', 'text', 'e.g. Elena Rostova', 'name'],
              ['email', 'Customer email', 'email', 'name@example.com', 'email'],
              ['address', 'Delivery address', 'text', 'Street, city', 'street-address'],
            ].map(([key, label, type, placeholder, autoComplete], i) => (
              <div key={key}>
                <label htmlFor={`order-${key}`} className="field-label">
                  {label}
                </label>
                <input
                  id={`order-${key}`}
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="input"
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  required
                  {...(i === 0 ? { 'data-autofocus': true } : {})}
                />
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-3 pt-5 border-t border-line">
            <legend className="text-sm font-semibold text-ink mb-3 float-left w-full">Items</legend>
            {form.lines.map((line, i) => {
              const p = products.find((x) => x.id === line.productId);
              return (
                <div key={i} className="flex gap-2 items-start" data-testid="order-line">
                  <div className="flex-1 min-w-0">
                    <select aria-label={`Product for line ${i + 1}`} value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className="input">
                      <option value="">Choose a product…</option>
                      {orderable.map((op) => (
                        <option key={op.id} value={op.id} disabled={op.stock === 0}>
                          {op.name} — {money(op.price)} ({op.stock} in stock)
                        </option>
                      ))}
                    </select>
                    {p && p.stock <= p.minStock && <p className="text-xs text-warning mt-1">Low stock: {p.stock} left</p>}
                  </div>
                  <input aria-label={`Quantity for line ${i + 1}`} type="number" min="1" step="1" inputMode="numeric" value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="input w-20 tabular" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines }))}
                    disabled={form.lines.length === 1}
                    className="icon-btn icon-btn-danger h-10"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, { productId: '', qty: 1 }] }))} className="btn btn-ghost btn-sm -ml-2">
              <Plus size={15} aria-hidden="true" /> Add item
            </button>
          </fieldset>

          <div className="rounded-xl bg-raised border border-line p-4">
            <div className="flex justify-between items-baseline text-sm">
              <span className="text-ink-2">Estimated total</span>
              <span className="text-lg font-semibold text-ink tabular">{money(preview)}</span>
            </div>
            <p className="text-xs text-ink-3 mt-1">Prices and stock are confirmed by the server when the order is saved.</p>
          </div>

          {formError && (
            <div className="banner banner-danger" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-5 border-t border-line">
            <button type="button" onClick={() => setCreateSheet(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create order
            </button>
          </div>
        </form>
      </Sheet>

      <Sheet isOpen={!!inspect} onClose={() => setInspectId(null)} title={inspect ? `Order ${inspect.orderNumber}` : 'Order'}>
        {inspect && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-ink-3">Total</p>
                <p className="text-2xl font-semibold tracking-tight text-ink tabular">{money(inspect.total)}</p>
              </div>
              <span className={`badge ${orderStatus[inspect.status]?.badge || ''}`}>{orderStatus[inspect.status]?.label}</span>
            </div>
            <dl className="rounded-xl border border-line divide-y divide-line text-sm">
              {[
                ['Customer', inspect.customer],
                ['Email', inspect.email],
                ['Delivery address', inspect.address],
                ['Placed', new Date(inspect.date).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-4 px-4 py-3">
                  <dt className="w-32 shrink-0 text-ink-3">{label}</dt>
                  <dd className="text-ink min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="text-sm font-semibold text-ink mb-1">Items</h3>
              <p className="text-xs text-ink-3 mb-3">Prices at the time of the order</p>
              <ul className="rounded-xl border border-line divide-y divide-line">
                {inspect.items.map((item, idx) => (
                  <li key={idx} className="flex justify-between items-center gap-4 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{item.name}</p>
                      <p className="text-xs text-ink-3">
                        <span className="font-mono">{item.sku}</span> · {item.qty} × {money(item.price)}
                      </p>
                    </div>
                    <span className="font-medium text-ink tabular">{money(item.qty * item.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {inspect.statusHistory?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink mb-3">History</h3>
                <ol className="space-y-2 text-sm">
                  {inspect.statusHistory.map((h, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-3" aria-hidden="true" />
                      <span className="font-medium text-ink capitalize">{h.status}</span>
                      <span className="text-ink-3">{new Date(h.at).toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Modal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.orderNumber ?? 'order'}?`}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setCancelTarget(null)} className="btn btn-secondary" data-autofocus>
              Keep order
            </button>
            <button type="button" onClick={handleCancelConfirm} className="btn btn-danger">
              Cancel order
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          The order for <strong className="text-ink font-medium">{cancelTarget?.customer}</strong> is cancelled and its items go back into stock. This cannot be undone.
        </p>
      </Modal>
    </>
  );
};

export default OrdersPage;
