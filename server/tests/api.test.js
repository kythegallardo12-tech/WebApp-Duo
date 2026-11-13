import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startDb, stopDb, makeApp, resetData, login, key, PASSWORD } from './helpers.js';
import { Order, Product, InventoryMovement, IdempotencyRecord } from '../models/index.js';

let replSet;
let app;

before(async () => {
  replSet = await startDb();
  app = makeApp();
});
after(async () => {
  await stopDb(replSet);
});

const productBySku = (sku) => Product.findOne({ sku, deleted: false }).lean();
const firstCategory = async (c) => (await c.get('/api/categories')).body.items[0].id;

describe('authentication', () => {
  beforeEach(() => resetData());

  test('rejects anonymous access to protected routes', async () => {
    for (const url of ['/api/products', '/api/orders', '/api/dashboard', '/api/settings', '/api/auth/me']) {
      const res = await request(app).get(url);
      assert.equal(res.status, 401, url);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    }
  });

  test('login, me, logout invalidates the session', async () => {
    const c = await login(app);
    assert.equal(c.user.role, 'admin');
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'admin@test.local');
    assert.ok(me.body.csrfToken);

    const cookie = (await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD })).headers['set-cookie'];
    assert.match(cookie[0], /HttpOnly/i);
    assert.match(cookie[0], /SameSite=Lax/i);

    const out = await c.post('/api/auth/logout', {});
    assert.equal(out.status, 204);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('wrong password and unknown user get the same error; password hash never returned', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'nope-nope-nope' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope-nope-nope' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
    const c = await login(app);
    const users = await c.get('/api/users');
    assert.ok(users.body.items.every((u) => !('passwordHash' in u)));
  });

  test('sessions expire after the configured lifetime', async () => {
    const shortApp = makeApp({ sessionTtlMinutes: 0.05 }); // 3 s
    const loginRes = await request(shortApp).post('/api/auth/login').send({ email: 'admin@test.local', password: PASSWORD });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    assert.equal((await request(shortApp).get('/api/products').set('Cookie', cookie)).status, 200);
    await new Promise((r) => setTimeout(r, 3300));
    // Replay the old cookie (as a client ignoring Max-Age would): the server itself must reject it.
    const res = await request(shortApp).get('/api/products').set('Cookie', cookie);
    assert.equal(res.status, 401);

    // Absolute lifetime check: a session whose login time is older than the TTL is
    // rejected and destroyed even if the store still holds it.
    const c = await login(app);
    assert.equal((await c.get('/api/products')).status, 200);
    const { default: mongoose } = await import('mongoose');
    await mongoose.connection.db
      .collection('sessions')
      .updateMany({}, { $set: { 'session.authAt': Date.now() - 2 * 60 * 60 * 1000 } });
    const expired = await c.get('/api/products');
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error.code, 'SESSION_EXPIRED');
    assert.equal((await c.get('/api/products')).body.error.code, 'UNAUTHENTICATED');
  });

  test('login is rate limited', async () => {
    const limited = makeApp({ loginRateLimit: 3 });
    for (let i = 0; i < 3; i++) {
      await request(limited).post('/api/auth/login').send({ email: 'staff@test.local', password: 'wrong-wrong' });
    }
    const res = await request(limited).post('/api/auth/login').send({ email: 'staff@test.local', password: PASSWORD });
    assert.equal(res.status, 429);
  });

  test('mutations require a valid CSRF token', async () => {
    const c = await login(app);
    const cat = await firstCategory(c);
    const res = await c.agent.post('/api/products').send({ name: 'X', sku: 'CSRF-1', category: cat, price: 1 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CSRF_INVALID');
    const bad = await c.agent.post('/api/products').set('X-CSRF-Token', 'f'.repeat(64)).send({ name: 'X', sku: 'CSRF-1', category: cat, price: 1 });
    assert.equal(bad.status, 403);
  });

  test('deactivated users lose access immediately', async () => {
    const admin = await login(app);
    const staff = await login(app, 'staff@test.local');
    const users = (await admin.get('/api/users')).body.items;
    const staffId = users.find((u) => u.role === 'staff').id;
    assert.equal((await admin.patch(`/api/users/${staffId}`, { active: false })).status, 200);
    const res = await staff.get('/api/products');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'SESSION_REVOKED');
  });
});

describe('permissions', () => {
  beforeEach(() => resetData());

  test('staff can create/edit products, adjust stock and process orders', async () => {
    const s = await login(app, 'staff@test.local');
    const cat = await firstCategory(s);
    const created = await s.post('/api/products', { name: 'Staff Item', sku: 'stf-1', category: cat, price: '9.99', stock: 5 });
    assert.equal(created.status, 201);
    const p = created.body.product;
    assert.equal((await s.patch(`/api/products/${p.id}`, { name: 'Renamed', version: p.version })).status, 200);
    assert.equal((await s.post(`/api/products/${p.id}/adjustments`, { delta: 3, reason: 'count' }, { 'Idempotency-Key': key() })).status, 200);
    const order = await s.post('/api/orders', { customer: 'A', email: 'a@x.io', address: 'Somewhere 1', items: [{ productId: p.id, qty: 1 }] }, { 'Idempotency-Key': key() });
    assert.equal(order.status, 201);
    assert.equal((await s.post(`/api/orders/${order.body.order.id}/transition`, { to: 'processing' })).status, 200);
  });

  test('staff cannot delete products, manage users, edit settings, import or reset', async () => {
    const s = await login(app, 'staff@test.local');
    const p = await productBySku('ELEC-WBH-001');
    assert.equal((await s.del(`/api/products/${p._id}`)).status, 403);
    assert.equal((await s.get('/api/users')).status, 403);
    assert.equal((await s.post('/api/users', { email: 'n@x.io', name: 'N', role: 'admin', password: 'longenough1' })).status, 403);
    assert.equal((await s.put('/api/settings', { businessName: 'X', currency: 'USD', defaultMinStock: 1, lowStockAlerts: true, version: 1 })).status, 403);
    assert.equal((await s.post('/api/import/legacy', { source: 'stockflow-storage', data: {} })).status, 403);
    assert.equal((await s.post('/api/dev/reset', {})).status, 403);
    assert.equal((await s.post('/api/categories', { name: 'New' })).status, 403);
    const me = await s.get('/api/auth/me');
    assert.ok(!me.body.user.permissions.includes('catalog:delete'));
  });

  test('admin can manage users and settings', async () => {
    const a = await login(app);
    const u = await a.post('/api/users', { email: 'new@x.io', name: 'New', role: 'staff', password: 'longenough1' });
    assert.equal(u.status, 201);
    assert.equal((await a.post('/api/users', { email: 'new@x.io', name: 'Dup', role: 'staff', password: 'longenough1' })).status, 409);
    const s = (await a.get('/api/settings')).body.settings;
    const put = await a.put('/api/settings', { businessName: 'Acme', currency: 'php', defaultMinStock: 7, lowStockAlerts: false, version: s.version });
    assert.equal(put.status, 200);
    assert.equal(put.body.settings.currency, 'PHP');
    const stale = await a.put('/api/settings', { businessName: 'Old', currency: 'USD', defaultMinStock: 7, lowStockAlerts: false, version: s.version });
    assert.equal(stale.status, 409);
    const self = a.user.id;
    assert.equal((await a.patch(`/api/users/${self}`, { role: 'staff' })).status, 403);
  });
});

describe('products', () => {
  beforeEach(() => resetData());

  test('CRUD persists, money stored as cents, SKU normalized', async () => {
    const c = await login(app);
    const cat = await firstCategory(c);
    const res = await c.post('/api/products', { name: 'Desk Lamp', sku: '  lamp 01 ', category: cat, price: 19.99, cost: '7.5', stock: 4, minStock: 2, description: 'Warm light' });
    assert.equal(res.status, 201);
    const p = res.body.product;
    assert.equal(p.sku, 'LAMP-01');
    assert.equal(p.price, 19.99);
    const doc = await Product.findById(p.id).lean();
    assert.equal(doc.priceCents, 1999);
    assert.equal(doc.costCents, 750);

    const got = await c.get(`/api/products/${p.id}`);
    assert.equal(got.body.product.name, 'Desk Lamp');

    const upd = await c.patch(`/api/products/${p.id}`, { price: 21, version: p.version });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.product.price, 21);
    assert.equal(upd.body.product.version, p.version + 1);

    const del = await c.del(`/api/products/${p.id}`);
    assert.equal(del.status, 200);
    assert.equal((await c.get(`/api/products/${p.id}`)).status, 404);
    assert.ok(await Product.findById(p.id), 'soft-deleted document is kept');
  });

  test('duplicate SKUs are rejected by the unique index with a clear error', async () => {
    const c = await login(app);
    const cat = await firstCategory(c);
    const res = await c.post('/api/products', { name: 'Dup', sku: 'elec-wbh-001', category: cat, price: 1 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_SKU');
    assert.match(res.body.error.message, /ELEC-WBH-001/);

    // Race: two creates with the same SKU at once -> exactly one wins.
    const results = await Promise.all([
      c.post('/api/products', { name: 'A', sku: 'RACE-1', category: cat, price: 1 }),
      c.post('/api/products', { name: 'B', sku: 'race-1', category: cat, price: 1 }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  });

  test('invalid numeric input is rejected', async () => {
    const c = await login(app);
    const cat = await firstCategory(c);
    const cases = [
      { price: -1 },
      { price: 'abc' },
      { price: 1.999 },
      { price: 1, stock: -5 },
      { price: 1, stock: 2.5 },
      { price: 1, minStock: 'x' },
    ];
    for (const extra of cases) {
      const res = await c.post('/api/products', { name: 'Bad', sku: `BAD-${Math.random()}`.slice(0, 20).replace('.', ''), category: cat, ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  test('stale edits are rejected and edits never touch stock', async () => {
    const c = await login(app);
    const p = (await c.get('/api/products?q=ELEC-WBH-001')).body.items[0];
    await c.post(`/api/products/${p.id}/adjustments`, { delta: -10, reason: 'sold offline' }, { 'Idempotency-Key': key() });
    const edit = await c.patch(`/api/products/${p.id}`, { name: 'New name', version: p.version });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.product.stock, p.stock - 10, 'edit kept the concurrent stock change');
    const stale = await c.patch(`/api/products/${p.id}`, { name: 'Older edit', version: p.version });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'STALE_VERSION');
    const direct = await c.patch(`/api/products/${p.id}`, { stock: 999, version: edit.body.product.version });
    assert.equal(direct.status, 400);
  });

  test('filtering, sorting, pagination and CSV export', async () => {
    const c = await login(app);
    const all = await c.get('/api/products?limit=100');
    assert.equal(all.body.total, 10);
    const page = await c.get('/api/products?limit=4&page=3&sort=name');
    assert.equal(page.body.items.length, 2);
    assert.equal(page.body.pages, 3);
    const names = (await c.get('/api/products?limit=100&sort=name')).body.items.map((p) => p.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    const low = await c.get('/api/products?status=low_stock');
    assert.deepEqual(low.body.items.map((p) => p.sku), ['HOM-IPS-004']);
    const out = await c.get('/api/products?status=out_of_stock');
    assert.deepEqual(out.body.items.map((p) => p.sku), ['BOK-BNC-006']);
    const cats = (await c.get('/api/categories')).body.items;
    const elec = cats.find((x) => x.name === 'Electronics').id;
    const byCat = await c.get(`/api/products?category=${elec}`);
    assert.equal(byCat.body.total, 3);
    const search = await c.get('/api/products?q=coffee');
    assert.equal(search.body.items[0].sku, 'FOD-ACB-008');

    const csv = await c.get(`/api/products/export.csv?category=${elec}&sort=sku`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    const lines = csv.text.trim().split('\r\n');
    assert.equal(lines.length, 4);
    assert.match(lines[0], /^SKU,Name,Category,Price/);
    assert.match(lines[1], /^ELEC-SWP-002,Smart Watch Pro,Electronics,299\.99/);
  });
});

describe('inventory', () => {
  beforeEach(() => resetData());

  test('adjustments persist, record actor and prevent negative stock', async () => {
    const c = await login(app, 'staff@test.local');
    const p = await productBySku('HOM-IPS-004'); // stock 8
    const up = await c.post(`/api/products/${p._id}/adjustments`, { delta: 12, reason: 'Restock PO' }, { 'Idempotency-Key': key() });
    assert.equal(up.status, 200);
    assert.equal(up.body.product.stock, 20);
    assert.equal((await productBySku('HOM-IPS-004')).stock, 20);

    const neg = await c.post(`/api/products/${p._id}/adjustments`, { delta: -21, reason: 'oops' }, { 'Idempotency-Key': key() });
    assert.equal(neg.status, 409);
    assert.equal(neg.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal((await productBySku('HOM-IPS-004')).stock, 20);

    const moves = await c.get(`/api/inventory/movements?product=${p._id}`);
    const adj = moves.body.items.find((m) => m.type === 'adjustment');
    assert.equal(adj.delta, 12);
    assert.equal(adj.actor.name, 'Test Staff');
    assert.ok(adj.createdAt);

    assert.equal((await c.post(`/api/products/${p._id}/adjustments`, { delta: 0, reason: 'x' }, { 'Idempotency-Key': key() })).status, 400);
    assert.equal((await c.post(`/api/products/${p._id}/adjustments`, { delta: 1, reason: 'no key' })).status, 400);
  });

  test('retrying an adjustment with the same key applies it once; reusing the key differently is rejected', async () => {
    const c = await login(app);
    const p = await productBySku('SPT-YMP-005'); // 200
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.post(`/api/products/${p._id}/adjustments`, { delta: 5, reason: 'restock' }, { 'Idempotency-Key': k }))
    );
    assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join());
    assert.equal((await productBySku('SPT-YMP-005')).stock, 205);
    assert.equal(await InventoryMovement.countDocuments({ product: p._id, type: 'adjustment' }), 1);

    const reuse = await c.post(`/api/products/${p._id}/adjustments`, { delta: 50, reason: 'restock' }, { 'Idempotency-Key': k });
    assert.equal(reuse.status, 422);
    assert.equal(reuse.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });
});

describe('orders', () => {
  beforeEach(() => resetData());

  const newOrder = (c, items, k = key(), extra = {}) =>
    c.post('/api/orders', { customer: 'Buyer', email: 'buyer@x.io', address: '1 Main St', items, ...extra }, { 'Idempotency-Key': k });

  test('server calculates prices/totals, combines duplicate lines and snapshots items', async () => {
    const c = await login(app);
    const p = await productBySku('FOD-ACB-008'); // 19.99, stock 300
    const res = await newOrder(c, [{ productId: String(p._id), qty: 2 }, { productId: String(p._id), qty: 1 }], key(), { total: 0.01, items_price: 0 });
    assert.equal(res.status, 201);
    const o = res.body.order;
    assert.equal(o.items.length, 1);
    assert.equal(o.items[0].qty, 3);
    assert.equal(o.items[0].price, 19.99);
    assert.equal(o.total, 59.97);
    assert.match(o.orderNumber, /^ORD-\d{4}-\d{4}$/);
    assert.equal((await productBySku('FOD-ACB-008')).stock, 297);
    assert.equal(await InventoryMovement.countDocuments({ order: o.id, type: 'order' }), 1);
  });

  test('two concurrent orders for the final unit: exactly one succeeds', async () => {
    const c1 = await login(app);
    const c2 = await login(app, 'staff@test.local');
    const p = await productBySku('HOM-IPS-004');
    await c1.post(`/api/products/${p._id}/adjustments`, { delta: -7, reason: 'leave one' }, { 'Idempotency-Key': key() });
    assert.equal((await productBySku('HOM-IPS-004')).stock, 1);

    const results = await Promise.all([newOrder(c1, [{ productId: String(p._id), qty: 1 }]), newOrder(c2, [{ productId: String(p._id), qty: 1 }])]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const loser = results.find((r) => r.status === 409);
    assert.equal(loser.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal((await productBySku('HOM-IPS-004')).stock, 0);
    assert.equal(await Order.countDocuments({ 'items.product': p._id, stockReserved: true }), 1);
  });

  test('many concurrent buyers never oversell', async () => {
    const p = await productBySku('SPT-RSE-010'); // stock 45
    const clients = await Promise.all([login(app), login(app, 'staff@test.local')]);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => newOrder(clients[i % 2], [{ productId: String(p._id), qty: 5 }])));
    const ok = results.filter((r) => r.status === 201).length;
    assert.equal(ok, 9);
    assert.equal((await productBySku('SPT-RSE-010')).stock, 0);
  });

  test('multi-item reservation is all-or-nothing', async () => {
    const c = await login(app);
    const plenty = await productBySku('CLO-OCT-003'); // 500
    const scarce = await productBySku('HOM-IPS-004'); // 8
    const ordersBefore = await Order.countDocuments();
    const res = await newOrder(c, [{ productId: String(plenty._id), qty: 10 }, { productId: String(scarce._id), qty: 9 }]);
    assert.equal(res.status, 409);
    assert.equal((await productBySku('CLO-OCT-003')).stock, 500, 'first line rolled back');
    assert.equal((await productBySku('HOM-IPS-004')).stock, 8);
    assert.equal(await Order.countDocuments(), ordersBefore);
    assert.equal(await InventoryMovement.countDocuments({ type: 'order' }), 0);
  });

  test('retried order creation yields one order; different payload with same key is rejected', async () => {
    const c = await login(app);
    const p = await productBySku('ELEC-SWP-002'); // 75
    const k = key();
    const results = await Promise.all(Array.from({ length: 4 }, () => newOrder(c, [{ productId: String(p._id), qty: 2 }], k)));
    assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join());
    assert.equal(new Set(results.map((r) => r.body.order.id)).size, 1);
    assert.equal((await productBySku('ELEC-SWP-002')).stock, 73);
    assert.equal(await IdempotencyRecord.countDocuments({ key: k }), 1);
    const other = await newOrder(c, [{ productId: String(p._id), qty: 3 }], k);
    assert.equal(other.status, 422);
  });

  test('status transitions follow pending -> processing -> shipped -> delivered', async () => {
    const c = await login(app);
    const p = await productBySku('ELEC-UCA-009');
    const o = (await newOrder(c, [{ productId: String(p._id), qty: 1 }])).body.order;
    const skip = await c.post(`/api/orders/${o.id}/transition`, { to: 'shipped' });
    assert.equal(skip.status, 409);
    assert.equal(skip.body.error.code, 'INVALID_TRANSITION');
    for (const to of ['processing', 'shipped', 'delivered']) {
      const r = await c.post(`/api/orders/${o.id}/transition`, { to });
      assert.equal(r.status, 200, to);
      assert.equal(r.body.order.status, to);
    }
    assert.equal((await c.post(`/api/orders/${o.id}/transition`, { to: 'pending' })).status, 409);
    const cancel = await c.post(`/api/orders/${o.id}/cancel`, {}, { 'Idempotency-Key': key() });
    assert.equal(cancel.status, 409);
    assert.equal(cancel.body.error.code, 'NOT_CANCELLABLE');
    assert.equal((await c.post(`/api/orders/${o.id}/transition`, { to: 'bogus' })).status, 400);
  });

  test('shipped orders cannot be cancelled; processing orders can', async () => {
    const c = await login(app);
    const p = await productBySku('BEA-SEK-007'); // 120
    const a = (await newOrder(c, [{ productId: String(p._id), qty: 4 }])).body.order;
    await c.post(`/api/orders/${a.id}/transition`, { to: 'processing' });
    assert.equal((await c.post(`/api/orders/${a.id}/cancel`, {}, { 'Idempotency-Key': key() })).status, 200);
    assert.equal((await productBySku('BEA-SEK-007')).stock, 120);
    const b = (await newOrder(c, [{ productId: String(p._id), qty: 1 }])).body.order;
    await c.post(`/api/orders/${b.id}/transition`, { to: 'processing' });
    await c.post(`/api/orders/${b.id}/transition`, { to: 'shipped' });
    assert.equal((await c.post(`/api/orders/${b.id}/cancel`, {}, { 'Idempotency-Key': key() })).status, 409);
  });

  test('concurrent cancellations restore stock exactly once', async () => {
    const c1 = await login(app);
    const c2 = await login(app, 'staff@test.local');
    const p = await productBySku('ELEC-WBH-001'); // 150
    const o = (await newOrder(c1, [{ productId: String(p._id), qty: 10 }])).body.order;
    assert.equal((await productBySku('ELEC-WBH-001')).stock, 140);
    const results = await Promise.all([
      c1.post(`/api/orders/${o.id}/cancel`, {}, { 'Idempotency-Key': key() }),
      c2.post(`/api/orders/${o.id}/cancel`, {}, { 'Idempotency-Key': key() }),
      c1.post(`/api/orders/${o.id}/cancel`, {}, { 'Idempotency-Key': key() }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join());
    assert.equal((await productBySku('ELEC-WBH-001')).stock, 150);
    assert.equal(await InventoryMovement.countDocuments({ order: o.id, type: 'cancel' }), 1);

    // Same-key retry of the successful cancel replays without restoring again.
    const k = key();
    const o2 = (await newOrder(c1, [{ productId: String(p._id), qty: 1 }])).body.order;
    const r1 = await c1.post(`/api/orders/${o2.id}/cancel`, {}, { 'Idempotency-Key': k });
    const r2 = await c1.post(`/api/orders/${o2.id}/cancel`, {}, { 'Idempotency-Key': k });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r2.headers['idempotent-replayed'], 'true');
    assert.equal((await productBySku('ELEC-WBH-001')).stock, 150);
  });

  test('historical orders survive product edits and deletion', async () => {
    const c = await login(app);
    const p = (await c.get('/api/products?q=SPT-YMP-005')).body.items[0];
    const o = (await newOrder(c, [{ productId: p.id, qty: 2 }])).body.order;
    await c.patch(`/api/products/${p.id}`, { name: 'Renamed Mat', price: 1, sku: 'NEW-SKU-1', version: p.version });
    await c.del(`/api/products/${p.id}`);
    const again = (await c.get(`/api/orders/${o.id}`)).body.order;
    assert.equal(again.items[0].name, 'Yoga Mat Premium');
    assert.equal(again.items[0].sku, 'SPT-YMP-005');
    assert.equal(again.items[0].price, 59.99);
    assert.equal(again.total, 119.98);
    // Deleted product's SKU can be reused and cannot be ordered.
    assert.equal((await newOrder(c, [{ productId: p.id, qty: 1 }])).status, 409);
  });

  test('order validation', async () => {
    const c = await login(app);
    const p = await productBySku('ELEC-SWP-002');
    assert.equal((await newOrder(c, [])).status, 400);
    assert.equal((await newOrder(c, [{ productId: String(p._id), qty: 0 }])).status, 400);
    assert.equal((await newOrder(c, [{ productId: 'nope', qty: 1 }])).status, 400);
    assert.equal((await newOrder(c, [{ productId: String(p._id), qty: 1 }], key(), { email: 'not-an-email' })).status, 400);
  });
});

describe('dashboard', () => {
  beforeEach(() => resetData({ seed: false }));

  test('aggregates are computed from database records', async () => {
    const c = await login(app);
    const cat = (await c.post('/api/categories', { name: 'General' })).body.category.id;
    const a = (await c.post('/api/products', { name: 'A', sku: 'DA-1', category: cat, price: 10, cost: 4, stock: 10, minStock: 2 })).body.product;
    const b = (await c.post('/api/products', { name: 'B', sku: 'DB-1', category: cat, price: 2.5, cost: 1, stock: 3, minStock: 5 })).body.product;
    await c.post('/api/products', { name: 'C', sku: 'DC-1', category: cat, price: 1, stock: 0 });

    const mk = (items, email) => c.post('/api/orders', { customer: 'X', email, address: 'Addr', items }, { 'Idempotency-Key': key() });
    await mk([{ productId: a.id, qty: 2 }], 'one@x.io'); // 20.00
    await mk([{ productId: a.id, qty: 1 }, { productId: b.id, qty: 2 }], 'two@x.io'); // 15.00
    const cancelled = (await mk([{ productId: a.id, qty: 1 }], 'one@x.io')).body.order; // 10.00 (cancelled)
    await c.post(`/api/orders/${cancelled.id}/cancel`, {}, { 'Idempotency-Key': key() });

    const d = (await c.get('/api/dashboard')).body;
    assert.equal(d.totals.revenue, 35);
    assert.equal(d.totals.orders, 2);
    assert.equal(d.totals.customers, 2);
    assert.equal(d.totals.products, 3);
    assert.equal(d.totals.averageOrderValue, 17.5);
    // cost: 3*4 + 2*1 = 14 -> margin (35-14)/35 = 60%
    assert.equal(d.totals.grossMargin, 60);
    // stock: A 10-3=7, B 3-2=1, C 0
    assert.equal(d.inventory.units, 8);
    assert.equal(d.inventory.value, 7 * 4 + 1 * 1);
    assert.deepEqual([d.inventory.healthy, d.inventory.low, d.inventory.out], [1, 1, 1]);
    assert.equal(d.orderStatus.cancelled, 1);
    assert.equal(d.orderStatus.pending, 2);
    assert.equal(d.revenueByMonth.length, 6);
    assert.equal(d.revenueByMonth.at(-1).revenue, 35);
    assert.equal(d.topProducts[0].name, 'A');
    assert.equal(d.topProducts[0].sales, 3);
    assert.equal(d.recentOrders.length, 3);
  });
});

describe('seeding and legacy import', () => {
  beforeEach(() => resetData({ seed: false }));

  test('seeding is repeatable and does not deduct stock for sample orders', async () => {
    const { seedSampleData } = await import('../services/seed.js');
    await seedSampleData();
    await seedSampleData();
    assert.equal(await Product.countDocuments(), 10);
    assert.equal(await Order.countDocuments(), 6);
    assert.equal((await productBySku('ELEC-WBH-001')).stock, 150);
    assert.equal(await InventoryMovement.countDocuments({ type: 'order' }), 0);
  });

  test('legacy browser data import maps ids, is not repeated, and cancelling imported orders does not add stock', async () => {
    const c = await login(app);
    const legacy = {
      state: {
        products: [
          { id: 'prod-x1', name: 'Legacy Kettle', sku: 'leg-k1', category: 'cat-99', price: 25, cost: 10, stock: 7, minStock: 2, status: 'active' },
        ],
        orders: [
          { id: 'ORD-OLD-1', customer: 'Old Customer', email: 'old@x.io', address: 'Old St', status: 'pending', date: '2025-01-05', items: [{ productId: 'prod-x1', name: 'Legacy Kettle', qty: 2, price: 25 }], total: 50 },
        ],
      },
      version: 0,
    };
    const res = await c.post('/api/import/legacy', { source: 'stockflow-storage', data: JSON.stringify(legacy) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.counts.products, 1);
    assert.equal(res.body.counts.orders, 1);
    const prod = await productBySku('LEG-K1');
    assert.equal(prod.stock, 7);
    const order = await Order.findOne({ legacyId: 'ORD-OLD-1' }).lean();
    assert.equal(String(order.items[0].product), String(prod._id));
    assert.equal(order.stockReserved, false);

    const again = await c.post('/api/import/legacy', { source: 'stockflow-storage', data: JSON.stringify(legacy) });
    assert.equal(again.status, 409);
    assert.equal(await Product.countDocuments({ sku: 'LEG-K1' }), 1);

    await c.post(`/api/orders/${order._id}/cancel`, {}, { 'Idempotency-Key': key() });
    assert.equal((await productBySku('LEG-K1')).stock, 7);

    const bad = await c.post('/api/import/legacy', { source: 'stockflow-storage', data: { products: [{ id: 1, name: '', sku: 'x', price: -1, stock: 1 }] } });
    assert.equal(bad.status, 400);
  });
});
