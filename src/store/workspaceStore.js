import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, newIdempotencyKey, withRetry } from '../api/client.js';

const statusOf = p => p.stock <= 0 ? 'out_of_stock' : p.stock <= p.minStock ? 'low_stock' : 'active';
const cancelled = () => ({ ok: false, cancelled: true });
const titles = { validation: 'Please check the form', auth: 'Signed out', forbidden: 'Not allowed', conflict: 'Conflict', notfound: 'Not found', network: 'Connection problem', server: 'Server error' };

/** Injectable dependencies let regression tests exercise the same store as the app. */
export function createWorkspaceStore({ client = api, retry = withRetry, storage = createJSONStorage(() => localStorage) } = {}) {
  return create(persist((set, get) => {
    let generation = 0, productFetchSeq = 0, orderFetchSeq = 0, categoryFetchSeq = 0, settingsFetchSeq = 0, toastSeq = 0;
    const current = epoch => epoch === generation;
    const fail = err => {
      if (err?.kind !== 'auth') get().addToast({ type: 'error', title: titles[err?.kind] || 'Error', message: err?.message || 'Something went wrong.' });
    };
    const upsertProduct = product => set(s => ({
      products: s.products.some(p => p.id === product.id) ? s.products.map(p => p.id === product.id ? product : p) : [...s.products, product],
    }));
    const patchProduct = (id, fn) => set(s => ({ products: s.products.map(p => p.id === id ? fn(p) : p) }));
    const shiftStock = (id, delta) => patchProduct(id, p => {
      const stock = Math.max(0, p.stock + delta);
      return { ...p, stock, status: statusOf({ ...p, stock }) };
    });
    const replaceOrder = (id, order) => set(s => ({ orders: s.orders.map(o => o.id === id ? order : o) }));
    const begin = ids => {
      const seqs = {};
      set(s => {
        const pending = { ...s.pending }, entitySeq = { ...s.entitySeq };
        for (const id of ids) { seqs[id] = entitySeq[id] = (entitySeq[id] || 0) + 1; pending[id] = (pending[id] || 0) + 1; }
        return { pending, entitySeq, sync: { ...s.sync, inFlight: s.sync.inFlight + 1, error: null } };
      });
      return seqs;
    };
    const finish = (ids, error) => set(s => {
      const pending = { ...s.pending };
      for (const id of ids) { pending[id] = Math.max(0, (pending[id] || 0) - 1); if (!pending[id]) delete pending[id]; }
      return {
        pending, dataVersion: s.dataVersion + 1,
        sync: { ...s.sync, error: error ? { kind: error.kind || 'server', message: error.message } : s.sync.error },
      };
    });
    const latest = (id, seq) => get().entitySeq[id] === seq;

    // Request start order does not imply server commit order. Re-read when the
    // final operation for an entity finishes, and reject a read overtaken by a new mutation.
    const reconcileProduct = async (id, epoch) => {
      if (!current(epoch) || get().pending[id]) return;
      const seq = get().entitySeq[id];
      try {
        const { product } = await client.getProduct(id);
        if (current(epoch) && !get().pending[id] && latest(id, seq)) upsertProduct(product);
      } catch (err) {
        if (!current(epoch) || get().pending[id] || !latest(id, seq)) return;
        if (err.status === 404) set(s => ({ products: s.products.filter(p => p.id !== id) }));
        else { set(s => ({ sync: { ...s.sync, error: { kind: err.kind || 'network', message: 'Could not verify the latest stock. Refresh before making another adjustment.' } } })); }
      }
    };
    const reconcileOrder = async (id, epoch) => {
      if (!current(epoch) || get().pending[id]) return;
      const seq = get().entitySeq[id];
      try {
        const { order } = await client.getOrder(id);
        if (current(epoch) && !get().pending[id] && latest(id, seq)) replaceOrder(id, order);
      } catch { /* the original error remains visible */ }
    };
    const allPages = async (fetchPage, valid) => {
      const items = [];
      for (let page = 1; ; page++) {
        const result = await fetchPage(page);
        if (!valid()) return null;
        items.push(...result.items);
        if (page >= (result.pages || 1)) return items;
      }
    };
    const mergeList = (items, local, startedSeqs) => {
      const state = get(), byId = new Map(local.map(p => [p.id, p]));
      const changed = id => state.pending[id] || state.entitySeq[id] !== startedSeqs[id];
      const merged = items.flatMap(p => changed(p.id) ? (byId.has(p.id) ? [byId.get(p.id)] : []) : [p]);
      const included = new Set(merged.map(p => p.id));
      return [...local.filter(p => !included.has(p.id) && (p.id.startsWith('tmp-') || changed(p.id))), ...merged];
    };
    const requireProduct = async (id, snapshot, epoch) => {
      const product = snapshot || get().products.find(p => p.id === id) || (await client.getProduct(id)).product;
      if (!current(epoch)) return null;
      if (!get().pending[id]) upsertProduct(product);
      return product;
    };

    const mutate = async ({ ids, products = [], apply, request, commit, rollback, recover, success }) => {
      const epoch = generation, seqs = begin(ids);
      apply?.();
      try {
        const result = await request();
        if (!current(epoch)) return cancelled();
        commit?.(result, seqs);
        finish(ids);
        await Promise.all(products.map(id => reconcileProduct(id, epoch)));
        if (!current(epoch)) return cancelled();
        set(s => ({ sync: { ...s.sync, inFlight: Math.max(0, s.sync.inFlight - 1), lastSavedAt: Date.now() } }));
        success?.(result);
        return { ok: true, ...result };
      } catch (err) {
        if (!current(epoch)) return cancelled();
        rollback?.(err, seqs);
        finish(ids, err);
        // Reconcile definite failures too: overlapping optimistic deltas can
        // have been clamped to zero or superseded by another server response.
        await Promise.all(products.map(id => reconcileProduct(id, epoch)));
        if (!current(epoch)) return cancelled();
        await recover?.(err, epoch);
        if (!current(epoch)) return cancelled();
        set(s => ({ sync: { ...s.sync, inFlight: Math.max(0, s.sync.inFlight - 1) } }));
        fail(err);
        return { ok: false, error: err };
      }
    };

    return {
      products: [], productsStatus: 'idle', productsError: null,
      orders: [], ordersStatus: 'idle', ordersError: null,
      categories: [], settings: null, pending: {}, entitySeq: {}, dataVersion: 0,
      sync: { inFlight: 0, error: null, lastSavedAt: null },
      sidebarOpen: true, mobileNavOpen: false, productView: 'grid', toasts: [], searchQuery: '',
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setMobileNav: mobileNavOpen => set({ mobileNavOpen }),
      setProductView: productView => set({ productView }),
      setSearchQuery: searchQuery => set({ searchQuery }),
      clearSyncError: () => set(s => ({ sync: { ...s.sync, error: null } })),
      addToast: toast => {
        const id = 't' + ++toastSeq;
        set(s => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
        const timer = setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), toast.type === 'error' ? 7000 : 4000);
        timer.unref?.();
      },
      removeToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
      resetWorkspace: () => {
        generation++; productFetchSeq++; orderFetchSeq++; categoryFetchSeq++; settingsFetchSeq++;
        set(s => ({
          products: [], orders: [], categories: [], settings: null, productsStatus: 'idle', ordersStatus: 'idle',
          productsError: null, ordersError: null, pending: {}, entitySeq: {}, toasts: [], searchQuery: '', mobileNavOpen: false,
          dataVersion: s.dataVersion + 1, sync: { inFlight: 0, error: null, lastSavedAt: null },
        }));
      },
      loadCategories: async () => {
        const epoch = generation, seq = ++categoryFetchSeq;
        const { items } = await client.categories();
        if (current(epoch) && seq === categoryFetchSeq) set({ categories: items });
        return current(epoch) ? items : [];
      },
      loadSettings: async () => {
        const epoch = generation, seq = ++settingsFetchSeq;
        const { settings } = await client.settings();
        if (current(epoch) && seq === settingsFetchSeq) set({ settings });
        return current(epoch) ? settings : null;
      },
      loadProducts: async () => {
        const epoch = generation, seq = ++productFetchSeq, startedSeqs = { ...get().entitySeq };
        const valid = () => current(epoch) && seq === productFetchSeq;
        if (get().productsStatus !== 'ready') set({ productsStatus: 'loading', productsError: null });
        try {
          const items = await allPages(page => client.listProducts({ page, limit: 500, sort: 'name' }), valid);
          if (!valid()) return get().products;
          set(s => ({ products: mergeList(items, s.products, startedSeqs), productsStatus: 'ready', productsError: null }));
          return get().products;
        } catch (err) {
          if (!valid()) return get().products;
          set({ productsStatus: get().products.length ? 'ready' : 'error', productsError: err });
          throw err;
        }
      },
      loadOrders: async () => {
        const epoch = generation, seq = ++orderFetchSeq, startedSeqs = { ...get().entitySeq };
        const valid = () => current(epoch) && seq === orderFetchSeq;
        if (get().ordersStatus !== 'ready') set({ ordersStatus: 'loading', ordersError: null });
        try {
          const items = await allPages(page => client.listOrders({ page, limit: 200 }), valid);
          if (!valid()) return get().orders;
          set(s => ({ orders: mergeList(items, s.orders, startedSeqs), ordersStatus: 'ready', ordersError: null }));
          return get().orders;
        } catch (err) {
          if (!valid()) return get().orders;
          set({ ordersStatus: get().orders.length ? 'ready' : 'error', ordersError: err });
          throw err;
        }
      },
      createProduct: form => {
        const id = 'tmp-prod-' + newIdempotencyKey();
        const optimistic = { ...form, id, version: 0, sales: 0, status: statusOf(form), createdAt: new Date().toISOString() };
        return mutate({
          ids: [id], apply: () => set(s => ({ products: [optimistic, ...s.products] })),
          request: () => client.createProduct(form),
          commit: ({ product }) => set(s => ({
            products: s.products.map(p => p.id === id ? product : p),
            entitySeq: { ...s.entitySeq, [product.id]: (s.entitySeq[product.id] || 0) + 1 },
          })),
          rollback: () => set(s => ({ products: s.products.filter(p => p.id !== id) })),
          success: ({ product }) => get().addToast({ type: 'success', title: 'Product saved', message: '"' + product.name + '" was added to the catalog.' }),
        });
      },
      updateProduct: async (id, changes, snapshot) => {
        const epoch = generation;
        let before;
        try { before = await requireProduct(id, snapshot, epoch); }
        catch (err) { if (!current(epoch)) return cancelled(); fail(err); return { ok: false, error: err }; }
        if (!before || !current(epoch)) return cancelled();
        return mutate({
          ids: [id], products: [id],
          apply: () => patchProduct(id, p => { const next = { ...p, ...changes }; return { ...next, status: statusOf(next) }; }),
          request: () => client.updateProduct(id, { ...changes, version: before.version }),
          commit: ({ product }, seqs) => { if (latest(id, seqs[id]) && get().pending[id] === 1) upsertProduct(product); },
          rollback: (err, seqs) => {
            if (!latest(id, seqs[id])) return;
            if (err.code === 'STALE_VERSION' && err.details?.current) upsertProduct(err.details.current);
            else patchProduct(id, p => ({ ...before, stock: p.stock, status: statusOf({ ...before, stock: p.stock }) }));
          },
          success: ({ product }) => get().addToast({ type: 'success', title: 'Changes saved', message: '"' + product.name + '" was updated.' }),
        });
      },
      deleteProduct: async (id, snapshot) => {
        const epoch = generation;
        let before;
        try { before = await requireProduct(id, snapshot, epoch); }
        catch (err) { if (!current(epoch)) return cancelled(); fail(err); return { ok: false, error: err }; }
        if (!before || !current(epoch)) return cancelled();
        return mutate({
          ids: [id], products: [id],
          apply: () => set(s => ({ products: s.products.filter(p => p.id !== id) })),
          request: () => client.deleteProduct(id),
          rollback: err => { if (err.status !== 404 && !err.ambiguous) upsertProduct(before); },
          success: () => get().addToast({ type: 'info', title: 'Product removed', message: '"' + before.name + '" was removed. Past orders keep their records.' }),
        });
      },
      adjustStock: (id, delta, reason) => {
        const key = newIdempotencyKey();
        return mutate({
          ids: [id], products: [id], apply: () => shiftStock(id, delta),
          request: () => retry(() => client.adjustStock(id, { delta, reason }, key)),
          rollback: err => { if (!err.ambiguous) shiftStock(id, -delta); },
        });
      },
      createOrder: ({ customer, email, address, items }) => {
        const id = 'tmp-ord-' + newIdempotencyKey(), key = newIdempotencyKey();
        const lines = items.map(i => {
          const p = get().products.find(x => x.id === i.productId);
          return { ...i, name: p?.name || 'Item', sku: p?.sku || '', price: p?.price || 0 };
        });
        const productIds = [...new Set(items.map(i => i.productId))];
        const optimistic = { id, orderNumber: 'Saving…', customer, email, address, items: lines, total: Math.round(lines.reduce((s, l) => s + l.qty * l.price * 100, 0)) / 100, status: 'pending', stockReserved: true, date: new Date().toISOString(), optimistic: true };
        return mutate({
          ids: [id, ...productIds], products: productIds,
          apply: () => { set(s => ({ orders: [optimistic, ...s.orders] })); for (const l of items) shiftStock(l.productId, -l.qty); },
          request: () => retry(() => client.createOrder({ customer, email, address, items }, key)),
          commit: ({ order }) => set(s => ({
            orders: s.orders.map(o => o.id === id ? order : o),
            entitySeq: { ...s.entitySeq, [order.id]: (s.entitySeq[order.id] || 0) + 1 },
          })),
          rollback: err => {
            set(s => ({ orders: s.orders.filter(o => o.id !== id) }));
            if (!err.ambiguous) for (const l of items) shiftStock(l.productId, l.qty);
          },
          recover: async (err, epoch) => { if (err.ambiguous && current(epoch)) await get().loadOrders().catch(() => {}); },
          success: ({ order }) => get().addToast({ type: 'success', title: 'Order created', message: order.orderNumber + ' for ' + order.customer }),
        });
      },
      transitionOrder: (id, to) => {
        const before = get().orders.find(o => o.id === id);
        if (!before) return Promise.resolve({ ok: false, error: new Error('Order is not loaded. Refresh and try again.') });
        return mutate({
          ids: [id], apply: () => replaceOrder(id, { ...before, status: to }),
          request: () => client.transitionOrder(id, to),
          commit: ({ order }, seqs) => { if (latest(id, seqs[id])) replaceOrder(id, order); },
          rollback: (_err, seqs) => { if (latest(id, seqs[id])) replaceOrder(id, before); },
          recover: (_err, epoch) => reconcileOrder(id, epoch),
        });
      },
      cancelOrder: (id, reason) => {
        const before = get().orders.find(o => o.id === id);
        if (!before) return Promise.resolve({ ok: false, error: new Error('Order is not loaded. Refresh and try again.') });
        const products = [...new Set(before.items.map(i => i.productId).filter(Boolean))], key = newIdempotencyKey();
        return mutate({
          ids: [id, ...products], products,
          apply: () => { replaceOrder(id, { ...before, status: 'cancelled' }); if (before.stockReserved !== false) for (const i of before.items) if (i.productId) shiftStock(i.productId, i.qty); },
          request: () => retry(() => client.cancelOrder(id, key, reason)),
          commit: ({ order }) => replaceOrder(id, order),
          rollback: err => {
            if (!err.ambiguous) {
              replaceOrder(id, before);
              if (before.stockReserved !== false) for (const i of before.items) if (i.productId) shiftStock(i.productId, -i.qty);
            }
          },
          recover: (_err, epoch) => reconcileOrder(id, epoch),
          success: ({ order }) => get().addToast({ type: 'info', title: 'Order cancelled', message: order.orderNumber + ' was cancelled.' }),
        });
      },
      saveSettings: async values => {
        const epoch = generation; settingsFetchSeq++;
        try {
          const { settings } = await client.saveSettings({ ...values, version: get().settings?.version ?? 0 });
          if (!current(epoch)) return cancelled();
          set({ settings }); get().addToast({ type: 'success', title: 'Settings saved', message: 'Business settings were updated.' });
          return { ok: true };
        } catch (err) {
          if (!current(epoch)) return cancelled();
          if (err.code === 'STALE_VERSION' && err.details?.current) set({ settings: err.details.current });
          fail(err); return { ok: false, error: err };
        }
      },
    };
  }, { name: 'stockflow-ui-preferences', storage, partialize: s => ({ sidebarOpen: s.sidebarOpen, productView: s.productView }) }));
}
