import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStore } from '../src/store/workspaceStore.js';
import { apiRequest, ApiError, setCsrfToken, setUnauthorizedHandler, withRetry } from '../src/api/client.js';
import { formatMoney, currencySymbol } from '../src/utils/currency.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const base = { id: 'product-1', name: 'Fixture', stock: 100, minStock: 10, version: 1, price: 1, status: 'active' };
const make = client => createWorkspaceStore({ client, retry: fn => fn(), storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
const clone = value => structuredClone(value);
const conflict = () => Object.assign(new Error('Rejected'), { status: 409, kind: 'conflict' });

test('a slow catalog refresh cannot drop a product confirmed after that refresh started', async () => {
  const listing = deferred();
  const created = { ...base, id: 'new-server-id', name: 'New product' };
  const store = make({ listProducts: () => listing.promise, createProduct: async () => ({ product: created }) });
  const load = store.getState().loadProducts();
  await store.getState().createProduct({ ...base, name: created.name });
  listing.resolve({ items: [], pages: 1 }); await load;
  assert.equal(store.getState().products[0].id, created.id);
});

test('a second-page failure never publishes a misleading partial catalog', async () => {
  const store = make({ listProducts: async ({ page }) => { if (page === 2) throw new Error('Unavailable'); return { items: [base], pages: 2 }; } });
  await assert.rejects(store.getState().loadProducts(), /Unavailable/);
  assert.equal(store.getState().products.length, 0);
  assert.equal(store.getState().productsStatus, 'error');
});


test('currency formatting follows the saved code without converting amounts', () => {
  assert.equal(formatMoney(79.99, 'USD'), '$79.99');
  assert.equal(formatMoney(79.99, 'PHP'), '₱79.99');
  assert.equal(currencySymbol('EUR'), '€');
});

test('reversed stock commits settle to the server value after the last pending request', async () => {
  const first = deferred(); let serverStock = 100;
  const store = make({
    adjustStock: async (_id, { delta }) => { if (delta === 5) { await first.promise; serverStock += 5; } else serverStock += delta; return { product: { ...base, stock: serverStock } }; },
    getProduct: async () => ({ product: { ...base, stock: serverStock } }),
  });
  store.setState({ products: [clone(base)] });
  const a = store.getState().adjustStock(base.id, 5, 'first');
  const b = store.getState().adjustStock(base.id, 20, 'second');
  await b; first.resolve(); await a;
  assert.equal(serverStock, 125);
  assert.equal(store.getState().products[0].stock, 125);
  assert.equal(store.getState().sync.inFlight, 0);
  assert.deepEqual(store.getState().pending, {});
});

test('a rejected overlapping deduction reconciles stock instead of retaining a clamped rollback', async () => {
  const first = deferred(); let stock = 1;
  const store = make({ adjustStock: async (_id, { delta }) => {
    if (delta === -1) { await first.promise; throw conflict(); }
    stock += delta; return { product: { ...base, stock } };
  }, getProduct: async () => ({ product: { ...base, stock } }) });
  store.setState({ products: [{ ...base, stock: 0 }] });
  const a = store.getState().adjustStock(base.id, -1, 'reject');
  await store.getState().adjustStock(base.id, 5, 'restock');
  first.resolve(); await a;
  assert.equal(store.getState().products[0].stock, 6);
});

test('an old reconciliation read cannot overwrite a newer successful adjustment', async () => {
  const oldRead = deferred(); let reads = 0, stock = 100;
  const store = make({
    adjustStock: async (_id, { delta }) => { stock += delta; return { product: { ...base, stock } }; },
    getProduct: async () => ++reads === 1 ? oldRead.promise : { product: { ...base, stock } },
  });
  store.setState({ products: [clone(base)] });
  const first = store.getState().adjustStock(base.id, 5, 'first');
  await new Promise(resolve => setImmediate(resolve));
  await store.getState().adjustStock(base.id, 20, 'second');
  oldRead.resolve({ product: { ...base, stock: 105 } }); await first;
  assert.equal(store.getState().products[0].stock, 125);
});

test('a list response started before an edit cannot restore the old product', async () => {
  const listing = deferred(); let product = clone(base);
  const store = make({ listProducts: () => listing.promise, updateProduct: async (_id, changes) => { product = { ...product, ...changes, version: 2 }; return { product }; }, getProduct: async () => ({ product }) });
  store.setState({ products: [clone(base)], productsStatus: 'ready' });
  const load = store.getState().loadProducts();
  await store.getState().updateProduct(base.id, { name: 'New name' });
  listing.resolve({ items: [clone(base)], pages: 1 }); await load;
  assert.equal(store.getState().products[0].name, 'New name');
});

test('a list response started before deletion cannot resurrect a deleted row', async () => {
  const listing = deferred();
  const store = make({ listProducts: () => listing.promise, deleteProduct: async () => ({}), getProduct: async () => { throw Object.assign(new Error('Gone'), { status: 404 }); } });
  store.setState({ products: [clone(base)], productsStatus: 'ready' });
  const load = store.getState().loadProducts();
  await store.getState().deleteProduct(base.id);
  listing.resolve({ items: [clone(base)], pages: 1 }); await load;
  assert.equal(store.getState().products.length, 0);
});

test('the shared catalog loads page two beyond 500 products', async () => {
  const catalog = Array.from({ length: 501 }, (_, i) => ({ ...base, id: 'p' + i }));
  const calls = [];
  const store = make({ listProducts: async ({ page, limit }) => { calls.push(page); return { items: catalog.slice((page - 1) * limit, page * limit), pages: 2, total: 501 }; } });
  await store.getState().loadProducts();
  assert.deepEqual(calls, [1, 2]);
  assert.equal(store.getState().products.length, 501);
  assert.equal(store.getState().products[500].id, 'p500');
});

test('orders include older records beyond the first 200', async () => {
  const orders = Array.from({ length: 212 }, (_, i) => ({ id: 'o' + i }));
  const store = make({ listOrders: async ({ page, limit }) => ({ items: orders.slice((page - 1) * limit, page * limit), pages: 2 }) });
  await store.getState().loadOrders();
  assert.equal(store.getState().orders.length, 212);
  assert.equal(store.getState().orders[211].id, 'o211');
});

test('an edit can use the displayed snapshot even before the shared catalog loads', async () => {
  let sent, product = clone(base);
  const store = make({
    updateProduct: async (id, changes) => { sent = { id, changes }; product = { ...product, ...changes, version: 2 }; return { product }; },
    getProduct: async () => ({ product }),
  });
  const result = await store.getState().updateProduct(base.id, { name: 'Edited' }, base);
  assert.equal(result.ok, true);
  assert.equal(sent.changes.version, 1);
  assert.equal(store.getState().products[0].name, 'Edited');
});

test('an uncached edit fetches its product and surfaces a missing product error', async () => {
  const err = Object.assign(new Error('No such product'), { status: 404, kind: 'notfound' });
  const store = make({ getProduct: async () => { throw err; } });
  const result = await store.getState().updateProduct('missing', { name: 'Edited' });
  assert.equal(result.error, err);
  assert.equal(store.getState().toasts[0].title, 'Not found');
});

test('an uncached displayed product can be deleted', async () => {
  let deleted;
  const store = make({ deleteProduct: async id => { deleted = id; return {}; }, getProduct: async () => { throw Object.assign(new Error('Gone'), { status: 404 }); } });
  assert.equal((await store.getState().deleteProduct(base.id, base)).ok, true);
  assert.equal(deleted, base.id);
  assert.equal(store.getState().products.length, 0);
});

test('sign-out invalidates late products, orders, categories and settings responses', async () => {
  const products = deferred(), orders = deferred(), categories = deferred(), settings = deferred();
  const store = make({ listProducts: () => products.promise, listOrders: () => orders.promise, categories: () => categories.promise, settings: () => settings.promise });
  const actions = [store.getState().loadProducts(), store.getState().loadOrders(), store.getState().loadCategories(), store.getState().loadSettings()];
  store.getState().addToast({ title: 'Old toast' }); store.getState().resetWorkspace();
  products.resolve({ items: [base], pages: 1 }); orders.resolve({ items: [{ id: 'old-order' }], pages: 1 }); categories.resolve({ items: [{ id: 'old-category' }] }); settings.resolve({ settings: { businessName: 'Old workspace' } });
  await Promise.all(actions);
  const state = store.getState();
  assert.deepEqual(state.products, []); assert.deepEqual(state.orders, []); assert.deepEqual(state.categories, []); assert.equal(state.settings, null); assert.deepEqual(state.toasts, []);
});

test('a late mutation from an earlier session cannot affect the new session or its pending count', async () => {
  const old = deferred(); let calls = 0;
  const store = make({ adjustStock: async () => ++calls === 1 ? old.promise : { product: { ...base, stock: 205 } }, getProduct: async () => ({ product: { ...base, stock: 205 } }) });
  store.setState({ products: [clone(base)] });
  const oldAction = store.getState().adjustStock(base.id, 5, 'old session');
  store.getState().resetWorkspace(); store.setState({ products: [{ ...base, stock: 200 }] });
  await store.getState().adjustStock(base.id, 5, 'new session');
  old.resolve({ product: { ...base, stock: 105 } });
  assert.equal((await oldAction).cancelled, true);
  assert.equal(store.getState().products[0].stock, 205);
  assert.equal(store.getState().sync.inFlight, 0);
  assert.deepEqual(store.getState().toasts, []);
});

test('a late settings save is ignored after reset', async () => {
  const save = deferred(), store = make({ saveSettings: () => save.promise });
  const action = store.getState().saveSettings({ businessName: 'Old' });
  store.getState().resetWorkspace(); save.resolve({ settings: { businessName: 'Old' } }); await action;
  assert.equal(store.getState().settings, null); assert.deepEqual(store.getState().toasts, []);
});

test('cancelling historical imported orders never optimistically adds unreserved stock', async () => {
  const cancel = deferred();
  const order = { id: 'old', orderNumber: 'LEG-1', status: 'pending', stockReserved: false, items: [{ productId: base.id, qty: 10 }] };
  const store = make({ cancelOrder: () => cancel.promise, getProduct: async () => ({ product: clone(base) }) });
  store.setState({ products: [clone(base)], orders: [order] });
  const action = store.getState().cancelOrder(order.id);
  assert.equal(store.getState().products[0].stock, 100);
  cancel.resolve({ order: { ...order, status: 'cancelled' } }); await action;
  assert.equal(store.getState().products[0].stock, 100);
});

test('an old 401 response cannot sign out a newly authenticated session', async () => {
  const oldFetch = globalThis.fetch, response = deferred(); let expired = 0;
  setCsrfToken('old-session'); setUnauthorizedHandler(() => expired++); globalThis.fetch = () => response.promise;
  try {
    const request = apiRequest('GET', '/products');
    setCsrfToken('new-session');
    response.resolve(new Response(JSON.stringify({ error: { message: 'Expired' } }), { status: 401 }));
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal(expired, 0);
  } finally { globalThis.fetch = oldFetch; setUnauthorizedHandler(null); setCsrfToken(null); }
});

test('retries stop when the authenticated session changes', async () => {
  setCsrfToken('old-retry-session'); let calls = 0; const started = deferred();
  try {
    const request = withRetry(async () => { calls++; started.resolve(); throw new ApiError({ status: 0, code: 'NETWORK', message: 'Dropped' }); }, { baseDelay: 10 });
    await started.promise; setCsrfToken('new-retry-session');
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal(calls, 1);
  } finally { setCsrfToken(null); }
});
