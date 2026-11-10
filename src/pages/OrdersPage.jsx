import { useState, useCallback } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  PackageCheck,
  AlertCircle,
  Eye,
  Trash2,
  ChevronRight,
  User,
  MapPin,
  Calendar,
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
 * Orders Management Page
 * Applies:
 * - Peak-End Rule: Marking order as "Delivered" displays positive feedback celebration toast
 * - Fitts' Law: Large status progression pills allow effortless state mutation
 * - Optimistic Updates: Tapping status advances local progress without waiting for remote server
 * - Sheets for multi-item order configuration; Modals for order cancellation confirmation
 */

const statusConfig = {
  pending: { label: 'Pending Payment', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', next: 'processing', icon: Clock },
  processing: { label: 'In Processing', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', next: 'shipped', icon: AlertCircle },
  shipped: { label: 'Shipped', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', next: 'delivered', icon: Truck },
  delivered: { label: 'Fulfilled & Delivered', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', next: null, icon: PackageCheck },
};

const OrdersPage = () => {
  const orders = useStore((s) => s.orders);
  const products = useStore((s) => s.products);
  const addOrder = useStore((s) => s.addOrder);
  const updateOrder = useStore((s) => s.updateOrder);
  const deleteOrder = useStore((s) => s.deleteOrder);
  const addToast = useStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sheet & Modal state
  const [createSheet, setCreateSheet] = useState(false);
  const [inspectSheet, setInspectSheet] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, order: null });

  // New Order Form state
  const [newOrderForm, setNewOrderForm] = useState({
    customer: '',
    email: '',
    address: '',
    selectedProduct: products[0]?.id || '',
    quantity: 1,
  });

  const { execute: optimisticExecute, isSyncing, syncErrors } = useOptimisticUpdate();

  const fetchOrders = useCallback(
    (onProgress) => simulateApiWithProgress(orders, onProgress),
    []
  );
  const { loadingState, progress, timeLeft } = useSmartLoader(fetchOrders, []);

  // Instant single-tap status cycle
  const handleAdvanceStatus = (order) => {
    const nextStatus = statusConfig[order.status]?.next;
    if (!nextStatus) return;

    optimisticExecute({
      localUpdate: () => {
        updateOrder(order.id, { status: nextStatus });
      },
      serverSync: async () => {},
      rollback: () => {
        updateOrder(order.id, { status: order.status });
      },
    });

    addToast({
      type: nextStatus === 'delivered' ? 'success' : 'info',
      title: 'Order Status Advanced',
      message: `${order.id} is now marked as "${statusConfig[nextStatus].label}"`,
    });
  };

  const handleCreateOrder = (e) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === newOrderForm.selectedProduct) || products[0];
    const qty = parseInt(newOrderForm.quantity, 10) || 1;
    const total = prod.price * qty;

    const newRecord = {
      id: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
      customer: newOrderForm.customer,
      email: newOrderForm.email,
      address: newOrderForm.address,
      items: [{ productId: prod.id, name: prod.name, qty, price: prod.price }],
      total,
      status: 'pending',
      date: new Date().toISOString().split('T')[0],
    };

    optimisticExecute({
      localUpdate: () => addOrder(newRecord),
      serverSync: async () => {},
      rollback: () => deleteOrder(newRecord.id),
    });

    addToast({
      type: 'success',
      title: 'Order Created (Optimistic)',
      message: `Invoice created for ${newRecord.customer} - $${total.toFixed(2)}`,
    });

    setCreateSheet(false);
    setNewOrderForm({
      customer: '',
      email: '',
      address: '',
      selectedProduct: products[0]?.id || '',
      quantity: 1,
    });
  };

  const handleDeleteConfirm = () => {
    const ord = deleteModal.order;
    if (!ord) return;

    optimisticExecute({
      localUpdate: () => deleteOrder(ord.id),
      serverSync: async () => {},
      rollback: () => addOrder(ord),
    });

    addToast({
      type: 'info',
      title: 'Order Cancelled',
      message: `${ord.id} removed from dispatch.`,
    });

    setDeleteModal({ open: false, order: null });
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.toLowerCase().includes(search.toLowerCase()) ||
      o.email.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <Header
        title="Fulfillment & Dispatch Pipeline"
        subtitle="End-to-end customer order processing and lifecycle orchestration"
        syncState={{ isSyncing, syncErrors }}
      />

      <div className="p-6 space-y-6">
        {/* Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SpotlightCard className="border-blue-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Total Volume</span>
            <span className="text-3xl font-black text-white">{orders.length} Orders</span>
          </SpotlightCard>

          <GlassCard className="border-amber-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Awaiting Processing</span>
            <span className="text-3xl font-black text-amber-400">
              {orders.filter((o) => o.status === 'pending' || o.status === 'processing').length}
            </span>
          </GlassCard>

          <GlassCard className="border-purple-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">In Transit / Courier</span>
            <span className="text-3xl font-black text-purple-400">
              {orders.filter((o) => o.status === 'shipped').length}
            </span>
          </GlassCard>

          <GlassCard className="border-emerald-500/20">
            <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">Fulfillment Rate</span>
            <span className="text-3xl font-black text-emerald-400">
              {Math.round((orders.filter((o) => o.status === 'delivered').length / (orders.length || 1)) * 100)}%
            </span>
          </GlassCard>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-1 gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders by customer or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input pl-10 text-sm h-11"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-input text-sm h-11 w-44"
            >
              <option value="all" className="bg-slate-900 text-white">All Dispatches</option>
              <option value="pending" className="bg-slate-900 text-white">Pending</option>
              <option value="processing" className="bg-slate-900 text-white">Processing</option>
              <option value="shipped" className="bg-slate-900 text-white">Shipped</option>
              <option value="delivered" className="bg-slate-900 text-white">Delivered</option>
            </select>
          </div>

          <button
            onClick={() => setCreateSheet(true)}
            className="btn-primary h-11 px-5 text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2"
          >
            <Plus size={18} />
            <span>Generate New Order</span>
          </button>
        </div>

        {/* Smart Loading Wrapper */}
        <SmartLoadingWrapper
          loadingState={loadingState}
          progress={progress}
          timeLeft={timeLeft}
          skeletonType="table"
          skeletonCount={5}
          message="Retrieving order records from distributed queue..."
        >
          <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5 font-semibold">Order Reference</th>
                    <th className="px-5 py-3.5 font-semibold">Client</th>
                    <th className="px-5 py-3.5 font-semibold">Purchased Items</th>
                    <th className="px-5 py-3.5 font-semibold">Grand Total</th>
                    <th className="px-5 py-3.5 font-semibold">Status (Tap to Advance)</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredOrders.map((ord) => {
                    const cfg = statusConfig[ord.status] || statusConfig.pending;
                    const StatusIcon = cfg.icon;

                    return (
                      <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-mono text-xs font-bold text-blue-400">{ord.id}</p>
                          <p className="text-[11px] text-slate-400">{ord.date}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{ord.customer}</p>
                          <p className="text-xs text-slate-400">{ord.email}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-300">
                          {ord.items.map((i) => `${i.name} (×${i.qty})`).join(', ')}
                        </td>
                        <td className="px-5 py-4 font-black text-white">${ord.total.toFixed(2)}</td>
                        {/* Tap to update status without waiting */}
                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleAdvanceStatus(ord)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5 transition-all hover:scale-105 ${cfg.color}`}
                            title={cfg.next ? `Tap to advance to ${cfg.next}` : 'Order Complete'}
                          >
                            <StatusIcon size={12} />
                            <span>{cfg.label}</span>
                            {cfg.next && <ChevronRight size={12} className="opacity-60" />}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setInspectSheet(ord)}
                              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
                              title="Inspect Details"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ open: true, order: ord })}
                              className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400"
                              title="Cancel Order"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
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

      {/* Sheet: Create Order */}
      <Sheet
        isOpen={createSheet}
        onClose={() => setCreateSheet(false)}
        title="Dispatch New Enterprise Invoice"
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Customer Full Name
            </label>
            <input
              type="text"
              value={newOrderForm.customer}
              onChange={(e) => setNewOrderForm({ ...newOrderForm, customer: e.target.value })}
              className="glass-input text-sm"
              placeholder="e.g. Elena Rostova"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Corporate Email
            </label>
            <input
              type="email"
              value={newOrderForm.email}
              onChange={(e) => setNewOrderForm({ ...newOrderForm, email: e.target.value })}
              className="glass-input text-sm"
              placeholder="elena@enterprise.org"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Delivery Logistics Address
            </label>
            <input
              type="text"
              value={newOrderForm.address}
              onChange={(e) => setNewOrderForm({ ...newOrderForm, address: e.target.value })}
              className="glass-input text-sm"
              placeholder="88 Tech Boulevard, Sector 4"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Target Product
              </label>
              <select
                value={newOrderForm.selectedProduct}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, selectedProduct: e.target.value })}
                className="glass-input text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                    {p.name} (${p.price.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Unit Quantity
              </label>
              <input
                type="number"
                min="1"
                value={newOrderForm.quantity}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, quantity: e.target.value })}
                className="glass-input text-sm font-bold text-white"
                required
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex gap-3">
            <button
              type="button"
              onClick={() => setCreateSheet(false)}
              className="btn-ghost flex-1 py-3 text-sm justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-blue-600/30"
            >
              Generate Order
            </button>
          </div>
        </form>
      </Sheet>

      {/* Sheet: Order Inspector */}
      <Sheet
        isOpen={!!inspectSheet}
        onClose={() => setInspectSheet(null)}
        title="Order Specification Summary"
      >
        {inspectSheet && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-xs font-mono text-blue-400 block font-semibold">{inspectSheet.id}</span>
              <p className="text-lg font-black text-white mt-1">Invoice Total: ${inspectSheet.total.toFixed(2)}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <User size={16} className="text-blue-400" />
                <span>{inspectSheet.customer} ({inspectSheet.email})</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <MapPin size={16} className="text-blue-400" />
                <span>{inspectSheet.address}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Calendar size={16} className="text-blue-400" />
                <span>Timestamp: {inspectSheet.date}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase font-semibold text-slate-400 mb-3">Line Items</h4>
              <div className="space-y-2">
                {inspectSheet.items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-bold text-white">{item.name}</p>
                      <p className="text-xs text-slate-400">Qty: {item.qty} × ${item.price.toFixed(2)}</p>
                    </div>
                    <span className="font-black text-emerald-400">${(item.qty * item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {/* Modal: Delete Confirmation */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, order: null })}
        title="Void Customer Order"
        size="sm"
      >
        <div className="text-center py-2">
          <p className="text-sm text-slate-300 mb-6">
            Are you sure you wish to void order <strong className="text-white">{deleteModal.order?.id}</strong>?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteModal({ open: false, order: null })}
              className="btn-ghost flex-1 py-3 text-sm justify-center"
            >
              Abort
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="btn-danger flex-1 py-3 text-sm font-bold justify-center"
            >
              Confirm Void
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OrdersPage;

