import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, newIdempotencyKey, withRetry } from '../api/client';

/**
 * Workspace store.
 *
 * Business data (products, orders, categories, settings) comes from the API and
 * MongoDB is the source of truth. Nothing business-related is persisted in the
 * browser; only harmless interface preferences are (sidebar, default view).
 *
 * Optimistic updates are applied per entity and tracked:
 *  - every mutation bumps that entity's sequence number;
 *  - a server response is applied only if no newer mutation of the same entity
 *    has started since (so a slow response cannot overwrite newer state);
 *  - a failure undoes only that change (stock deltas are reversed, not reset);
 *  - temporary ids are replaced by the server id once confirmed;
 *  - list refreshes keep the local copy of entities with in-flight mutations.
 */

const statusOf = (p) => (p.stock <= 0 ? 'out_of_stock' : p.stock <= p.minStock ? 'low_stock' : 'active');
const tempId = (prefix) => `tmp-${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const ERROR_TITLES = {
  validation: 'Please check the form',
  auth: 'Signed out',
  forbidden: 'Not allowed',
  conflict: 'Conflict',
  notfound: 'Not found',
  network: 'Connection problem',
  server: 'Server error',
};

let toastSeq = 0;
let productFetchSeq = 0;
let orderFetchSeq = 0;

const useStore = create(
  persist(
    (set, get) => {
      /* ── mutation bookkeeping ─────────────────────────── */
      const begin = (ids) => {
        const seqs = {};
        set((s) => {
          const entitySeq = { ...s.entitySeq };
          const pending = { ...s.pending };
          for (const id of ids) {
            entitySeq[id] = (entitySeq[id] || 0) + 1;
            seqs[id] = entitySeq[id];
            pending[id] = (pending[id] || 0) + 1;
          }
          return { entitySeq, pending, sync: { ...s.sync, inFlight: s.sync.inFlight + 1, error: null } };
        });
        return seqs;
      };
      const finish = (ids, error) =>
        set((s) => {
          const pending = { ...s.pending };
          for (const id of ids) {
            pending[id] = Math.max(0, (pending[id] || 0) - 1);
            if (!pending[id]) delete pending[id];
          }
          const inFlight = Math.max(0, s.sync.inFlight - 1);
          return {
            pending,
            sync: error
              ? { inFlight, error: { kind: error.kind || 'server', message: error.message }, lastSavedAt: s.sync.lastSavedAt }
              : { inFlight, error: null, lastSavedAt: Date.now() },
            dataVersion: error ? s.dataVersion : s.dataVersion + 1,
          };
        });
      const isLatest = (id, seq) => get().entitySeq[id] === seq;
      const fail = (err, fallbackTitle) => {
        if (err?.kind === 'auth') return; // the auth store shows the login screen
        get().addToast({ type: 'error', title: ERROR_TITLES[err?.kind] || fallbackTitle || 'Error', message: err?.message || 'Something went wrong.' });
      };

      const replaceProduct = (id, product) =>
        set((s) => ({ products: s.products.map((p) => (p.id === id ? product : p)) }));
      const patchProduct = (id, fn) => set((s) => ({ products: s.products.map((p) => (p.id === id ? fn(p) : p)) }));
      const shiftStock = (id, delta) =>
        patchProduct(id, (p) => {
          const stock = Math.max(0, p.stock + delta);
          return { ...p, stock, status: statusOf({ ...p, stock }) };
        });
      const replaceOrder = (id, order) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? order : o)) }));

      /** Re-read one product from the server (used after ambiguous failures). */
      const reconcileProduct = async (id) => {
        try {
          const { product } = await api.getProduct(id);
          if (!get().pending[id]) replaceProduct(id, product);
        } catch (err) {
          if (err.status === 404) set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
        }
      };

      return {
        /* ── data (from the API) ───────────────────────── */
        products: [],
        productsStatus: 'idle', // idle | loading | ready | error
        productsError: null,
        orders: [],
        ordersStatus: 'idle',
        ordersError: null,
        categories: [],
        settings: null,
        pending: {}, // entityId -> number of in-flight mutations
        entitySeq: {}, // entityId -> latest mutation sequence
        dataVersion: 0, // bumped after every confirmed change (pages refetch aggregates)
        sync: { inFlight: 0, error: null, lastSavedAt: null },

        /* ── interface preferences (persisted locally) ─── */
        sidebarOpen: true,
        mobileNavOpen: false,
        productView: 'grid',
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
        setMobileNav: (open) => set({ mobileNavOpen: open }),
        setProductView: (v) => set({ productView: v }),

        /* ── toasts ─────────────────────────────────────── */
        toasts: [],
        addToast: (toast) => {
          const id = `t${++toastSeq}`;
          set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
          setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), toast.type === 'error' ? 7000 : 4000);
        },
        removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        searchQuery: '',
        setSearchQuery: (q) => set({ searchQuery: q }),

        clearSyncError: () => set((s) => ({ sync: { ...s.sync, error: null } })),

        /** Forget all business data (on sign-out). */
        resetWorkspace: () =>
          set({ products: [], orders: [], categories: [], settings: null, productsStatus: 'idle', ordersStatus: 'idle', pending: {}, entitySeq: {} }),

        /* ── loading ───────────────────────────────────── */
        loadCategories: async () => {
          const { items } = await api.categories();
          set({ categories: items });
          return items;
        },
        loadSettings: async () => {
          const { settings } = await api.settings();
          set({ settings });
          return settings;
        },
        /** Load the full live catalog (used by inventory, order form and overlays). */
        loadProducts: async () => {
          const seq = ++productFetchSeq;
          if (get().productsStatus !== 'ready') set({ productsStatus: 'loading', productsError: null });
          try {
            const { items } = await api.listProducts({ limit: 500, sort: 'name' });
            if (seq !== productFetchSeq) return get().products; // a newer refresh superseded this one
            set((s) => {
              const local = new Map(s.products.map((p) => [p.id, p]));
              const merged = items.map((p) => (s.pending[p.id] ? local.get(p.id) || p : p));
              const temps = s.products.filter((p) => p.id.startsWith('tmp-'));
              return { products: [...temps, ...merged], productsStatus: 'ready', productsError: null };
            });
            return get().products;
          } catch (err) {
            if (seq === productFetchSeq) set({ productsStatus: get().products.length ? 'ready' : 'error', productsError: err });
            throw err;
          }
        },
        loadOrders: async () => {
          const seq = ++orderFetchSeq;
          if (get().ordersStatus !== 'ready') set({ ordersStatus: 'loading', ordersError: null });
          try {
            const { items } = await api.listOrders({ limit: 200 });
            if (seq !== orderFetchSeq) return get().orders;
            set((s) => {
              const local = new Map(s.orders.map((o) => [o.id, o]));
              const merged = items.map((o) => (s.pending[o.id] ? local.get(o.id) || o : o));
              const temps = s.orders.filter((o) => o.id.startsWith('tmp-'));
              return { orders: [...temps, ...merged], ordersStatus: 'ready', ordersError: null };
            });
            return get().orders;
          } catch (err) {
            if (seq === orderFetchSeq) set({ ordersStatus: get().orders.length ? 'ready' : 'error', ordersError: err });
            throw err;
          }
        },

        /* ── products ──────────────────────────────────── */
        createProduct: async (form) => {
          const id = tempId('prod');
          const optimistic = { ...form, id, version: 0, sales: 0, status: statusOf(form), createdAt: new Date().toISOString() };
          set((s) => ({ products: [optimistic, ...s.products] }));
          begin([id]);
          try {
            const { product } = await api.createProduct(form);
            // Reconcile the temporary id with the server id.
            set((s) => ({ products: s.products.map((p) => (p.id === id ? product : p)) }));
            finish([id]);
            get().addToast({ type: 'success', title: 'Product saved', message: `"${product.name}" was added to the catalog.` });
            return { ok: true, product };
          } catch (err) {
            set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
            finish([id], err);
            fail(err, 'Could not create product');
            return { ok: false, error: err };
          }
        },

        updateProduct: async (id, changes) => {
          const before = get().products.find((p) => p.id === id);
          if (!before) return { ok: false };
          const seq = begin([id])[id];
          patchProduct(id, (p) => {
            const next = { ...p, ...changes };
            return { ...next, status: statusOf(next) };
          });
          try {
            const { product } = await api.updateProduct(id, { ...changes, version: before.version });
            if (isLatest(id, seq)) replaceProduct(id, product);
            finish([id]);
            get().addToast({ type: 'success', title: 'Changes saved', message: `"${product.name}" was updated.` });
            return { ok: true, product };
          } catch (err) {
            if (err.code === 'STALE_VERSION' && err.details?.current) {
              // Someone else saved first: show their version and let the user redo the edit.
              replaceProduct(id, err.details.current);
            } else if (isLatest(id, seq)) {
              // Undo only this edit. Keep the latest stock in case it changed meanwhile.
              patchProduct(id, (p) => ({ ...before, stock: p.stock, status: statusOf({ ...before, stock: p.stock }) }));
            }
            finish([id], err);
            fail(err, 'Could not save product');
            if (err.ambiguous) reconcileProduct(id);
            return { ok: false, error: err };
          }
        },

        deleteProduct: async (id) => {
          const before = get().products.find((p) => p.id === id);
          const index = get().products.findIndex((p) => p.id === id);
          if (!before) return { ok: false };
          begin([id]);
          set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
          try {
            await api.deleteProduct(id);
            finish([id]);
            get().addToast({ type: 'info', title: 'Product removed', message: `"${before.name}" was removed. Past orders keep their records.` });
            return { ok: true };
          } catch (err) {
            if (err.status !== 404) {
              set((s) => {
                const products = [...s.products];
                products.splice(Math.min(index, products.length), 0, before);
                return { products };
              });
            }
            finish([id], err);
            fail(err, 'Could not delete product');
            return { ok: false, error: err };
          }
        },

        /**
         * Stock adjustment. Applied locally at once; sent with an idempotency key and
         * retried with the SAME key after ambiguous failures, so it is applied once.
         */
        adjustStock: async (id, delta, reason) => {
          const product = get().products.find((p) => p.id === id);
          if (!product) return { ok: false };
          const key = newIdempotencyKey();
          const seq = begin([id])[id];
          shiftStock(id, delta);
          try {
            const res = await withRetry(() => api.adjustStock(id, { delta, reason }, key));
            if (isLatest(id, seq)) replaceProduct(id, res.product);
            finish([id]);
            return { ok: true, product: res.product };
          } catch (err) {
            if (err.ambiguous) {
              // We cannot know whether it was applied: ask the server instead of guessing.
              finish([id], err);
              await reconcileProduct(id);
            } else {
              shiftStock(id, -delta); // undo just this delta
              finish([id], err);
            }
            fail(err, 'Stock not updated');
            return { ok: false, error: err };
          }
        },

        /* ── orders ────────────────────────────────────── */
        createOrder: async ({ customer, email, address, items }) => {
          const id = tempId('ord');
          const products = get().products;
          const lines = items.map((i) => {
            const p = products.find((x) => x.id === i.productId);
            return { productId: i.productId, name: p?.name || 'Item', sku: p?.sku || '', qty: i.qty, price: p?.price || 0 };
          });
          const optimistic = {
            id,
            orderNumber: 'Saving…',
            customer,
            email,
            address,
            items: lines,
            total: Math.round(lines.reduce((s, l) => s + l.qty * l.price * 100, 0)) / 100,
            status: 'pending',
            date: new Date().toISOString(),
            optimistic: true,
          };
          const productIds = [...new Set(items.map((i) => i.productId))];
          const key = newIdempotencyKey();
          set((s) => ({ orders: [optimistic, ...s.orders] }));
          const seqs = begin([id, ...productIds]);
          for (const l of items) shiftStock(l.productId, -l.qty);
          try {
            const { order } = await withRetry(() => api.createOrder({ customer, email, address, items }, key));
            set((s) => ({ orders: s.orders.map((o) => (o.id === id ? order : o)) }));
            finish([id, ...productIds]);
            // Server-confirmed stock for the reserved products.
            await Promise.all(productIds.filter((pid) => isLatest(pid, seqs[pid])).map(reconcileProduct));
            get().addToast({ type: 'success', title: 'Order created', message: `${order.orderNumber} for ${order.customer} — $${order.total.toFixed(2)}` });
            return { ok: true, order };
          } catch (err) {
            set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
            if (err.ambiguous) {
              finish([id, ...productIds], err);
              await Promise.all([get().loadOrders().catch(() => {}), ...productIds.map(reconcileProduct)]);
            } else {
              for (const l of items) shiftStock(l.productId, l.qty);
              finish([id, ...productIds], err);
            }
            fail(err, 'Order not created');
            return { ok: false, error: err };
          }
        },

        transitionOrder: async (id, to) => {
          const before = get().orders.find((o) => o.id === id);
          if (!before) return { ok: false };
          const seq = begin([id])[id];
          replaceOrder(id, { ...before, status: to });
          try {
            const { order } = await api.transitionOrder(id, to);
            if (isLatest(id, seq)) replaceOrder(id, order);
            finish([id]);
            return { ok: true, order };
          } catch (err) {
            if (isLatest(id, seq)) replaceOrder(id, { ...get().orders.find((o) => o.id === id), status: before.status });
            finish([id], err);
            fail(err, 'Status not changed');
            if (err.kind === 'conflict' || err.ambiguous) {
              api.getOrder(id).then(({ order }) => !get().pending[id] && replaceOrder(id, order)).catch(() => {});
            }
            return { ok: false, error: err };
          }
        },

        cancelOrder: async (id, reason) => {
          const before = get().orders.find((o) => o.id === id);
          if (!before) return { ok: false };
          const productIds = [...new Set(before.items.map((i) => i.productId).filter(Boolean))];
          const key = newIdempotencyKey();
          begin([id, ...productIds]);
          replaceOrder(id, { ...before, status: 'cancelled' });
          for (const i of before.items) if (i.productId) shiftStock(i.productId, i.qty);
          try {
            const { order } = await withRetry(() => api.cancelOrder(id, key, reason));
            replaceOrder(id, order);
            finish([id, ...productIds]);
            await Promise.all(productIds.map(reconcileProduct));
            get().addToast({ type: 'info', title: 'Order cancelled', message: `${order.orderNumber} was cancelled and its stock returned.` });
            return { ok: true, order };
          } catch (err) {
            if (err.ambiguous) {
              finish([id, ...productIds], err);
              await Promise.all([api.getOrder(id).then(({ order }) => replaceOrder(id, order)).catch(() => {}), ...productIds.map(reconcileProduct)]);
            } else {
              replaceOrder(id, before);
              for (const i of before.items) if (i.productId) shiftStock(i.productId, -i.qty);
              finish([id, ...productIds], err);
            }
            fail(err, 'Order not cancelled');
            return { ok: false, error: err };
          }
        },

        /* ── settings ──────────────────────────────────── */
        saveSettings: async (values) => {
          try {
            const { settings } = await api.saveSettings({ ...values, version: get().settings?.version ?? 0 });
            set({ settings });
            get().addToast({ type: 'success', title: 'Settings saved', message: 'Business settings were updated.' });
            return { ok: true };
          } catch (err) {
            if (err.code === 'STALE_VERSION' && err.details?.current) set({ settings: err.details.current });
            fail(err, 'Settings not saved');
            return { ok: false, error: err };
          }
        },
      };
    },
    {
      name: 'stockflow-ui-preferences',
      storage: createJSONStorage(() => localStorage),
      // Only interface preferences are stored in the browser.
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen, productView: s.productView }),
    }
  )
);

export default useStore;
