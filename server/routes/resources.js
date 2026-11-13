import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Category, InventoryMovement, Order, Product, Setting, User, ROLES, ORDER_STATUSES } from '../models/index.js';
import { parse, objectId, intInRange, assertObjectId } from '../lib/validate.js';
import { dollarsToCents } from '../lib/money.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requireIdempotencyKey, runIdempotent } from '../services/idempotency.js';
import { createProduct, deleteProduct, exportProductsCsv, listProducts, updateProduct } from '../services/products.js';
import { adjustStock } from '../services/inventory.js';
import { cancelOrder, createOrder, transitionOrder } from '../services/orders.js';
import { getDashboard } from '../services/dashboard.js';
import { importLegacy } from '../services/legacy.js';
import { seedSampleData, wipeBusinessData } from '../services/seed.js';
import {
  serializeCategory,
  serializeMovement,
  serializeOrder,
  serializeProduct,
  serializeSettings,
  serializeUser,
} from '../services/serialize.js';

const text = (label, max, min = 0) =>
  z.string({ error: `${label} is required.` }).trim().min(min, min ? `${label} is required.` : undefined).max(max, `${label} must be at most ${max} characters.`);

/* ── Products ─────────────────────────────────────────── */
const productFields = {
  name: text('Name', 120, 1),
  sku: text('SKU', 40, 1).regex(/^[A-Za-z0-9][A-Za-z0-9 _\-.]*$/, 'SKU may contain letters, digits, spaces, "-", "_" and "."'),
  category: objectId('category'),
  price: dollarsToCents('Price'),
  cost: dollarsToCents('Cost').optional(),
  minStock: intInRange('Low stock threshold', 0, 1_000_000).optional(),
  image: z.union([z.literal(''), z.string().trim().url('Image must be a valid URL.').max(500)]).optional(),
  description: text('Description', 2000).optional(),
};
const createProductSchema = z.object({ ...productFields, stock: intInRange('Opening stock', 0, 1_000_000).optional() });
const updateProductSchema = z
  .object(Object.fromEntries(Object.entries(productFields).map(([k, v]) => [k, v.optional()])))
  .extend({ version: intInRange('version', 1, Number.MAX_SAFE_INTEGER), stock: z.any().optional() })
  .refine((v) => v.stock === undefined, { message: 'Stock cannot be edited directly. Use a stock adjustment.', path: ['stock'] });

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.union([z.literal('all'), objectId('category')]).optional(),
  status: z.enum(['all', 'active', 'low_stock', 'out_of_stock']).optional(),
  sort: z.enum(['newest', 'oldest', 'name', '-name', 'price', '-price', 'stock', '-stock', 'sku']).optional(),
  page: intInRange('page', 1, 100000).optional(),
  limit: intInRange('limit', 1, 500).optional(),
});

const adjustmentSchema = z.object({
  delta: intInRange('Adjustment', -1_000_000, 1_000_000).refine((n) => n !== 0, 'Adjustment cannot be zero.'),
  reason: text('Reason', 200, 1),
});

/* ── Orders ───────────────────────────────────────────── */
const orderSchema = z.object({
  customer: text('Customer name', 120, 1),
  email: z.string().trim().toLowerCase().email('Enter a valid customer email.').max(200),
  address: text('Delivery address', 300, 1),
  items: z
    .array(z.object({ productId: objectId('productId'), qty: intInRange('Quantity', 1, 10000) }), { error: 'Add at least one item.' })
    .min(1, 'Add at least one item.')
    .max(50, 'An order can have at most 50 lines.'),
  // Any client-supplied totals/prices are ignored: the schema simply does not read them.
});
const orderListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', ...ORDER_STATUSES]).optional(),
  page: intInRange('page', 1, 100000).optional(),
  limit: intInRange('limit', 1, 200).optional(),
});

export function apiRoutes({ allowDevReset }) {
  const r = Router();
  r.use(requireAuth);

  /* Categories */
  r.get('/categories', async (req, res) => {
    const cats = await Category.find().sort({ legacyId: 1, name: 1 }).lean();
    res.json({ items: cats.map(serializeCategory) });
  });
  r.post('/categories', requirePermission('categories:write'), async (req, res) => {
    const data = parse(z.object({ name: text('Name', 60, 1), icon: text('Icon', 8).optional(), color: text('Color', 16).optional() }), req.body);
    try {
      const cat = await Category.create(data);
      res.status(201).json({ category: serializeCategory(cat) });
    } catch (err) {
      if (err?.code === 11000) throw conflict('DUPLICATE_CATEGORY', `A category named "${data.name}" already exists.`);
      throw err;
    }
  });

  /* Products */
  r.get('/products', async (req, res) => {
    const q = parse(listSchema, req.query);
    res.json(await listProducts({ ...q, status: q.status === 'all' ? undefined : q.status }));
  });
  r.get('/products/export.csv', async (req, res) => {
    const q = parse(listSchema, req.query);
    const csv = await exportProductsCsv({ ...q, status: q.status === 'all' ? undefined : q.status });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  r.get('/products/:id', async (req, res) => {
    assertObjectId(req.params.id, 'Product');
    const p = await Product.findOne({ _id: req.params.id, deleted: false }).lean();
    if (!p) throw notFound('Product');
    res.json({ product: serializeProduct(p) });
  });
  r.post('/products', requirePermission('catalog:write'), async (req, res) => {
    const d = parse(createProductSchema, req.body);
    const settings = await Setting.findById('business').lean();
    const product = await createProduct(
      {
        name: d.name,
        sku: d.sku,
        category: d.category,
        priceCents: d.price,
        costCents: d.cost ?? 0,
        stock: d.stock ?? 0,
        minStock: d.minStock ?? settings?.defaultMinStock ?? 15,
        image: d.image ?? '',
        description: d.description ?? '',
      },
      req.user._id
    );
    res.status(201).json({ product });
  });
  r.patch('/products/:id', requirePermission('catalog:write'), async (req, res) => {
    assertObjectId(req.params.id, 'Product');
    const d = parse(updateProductSchema, req.body);
    const changes = { version: d.version };
    for (const k of ['name', 'sku', 'category', 'minStock', 'image', 'description']) if (d[k] !== undefined) changes[k] = d[k];
    if (d.price !== undefined) changes.priceCents = d.price;
    if (d.cost !== undefined) changes.costCents = d.cost;
    res.json({ product: await updateProduct(req.params.id, changes, req.user._id) });
  });
  r.delete('/products/:id', requirePermission('catalog:delete'), async (req, res) => {
    assertObjectId(req.params.id, 'Product');
    res.json({ product: await deleteProduct(req.params.id, req.user._id) });
  });

  /* Inventory */
  r.post('/products/:id/adjustments', requirePermission('inventory:adjust'), async (req, res) => {
    assertObjectId(req.params.id, 'Product');
    const key = requireIdempotencyKey(req);
    const d = parse(adjustmentSchema, req.body);
    const result = await runIdempotent(
      { userId: req.user._id, key, scope: `adjust:${req.params.id}`, payload: d },
      (session) => adjustStock(session, { productId: req.params.id, delta: d.delta, reason: d.reason, actorId: req.user._id })
    );
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });
  r.get('/inventory/movements', async (req, res) => {
    const q = parse(z.object({ product: objectId('product').optional(), limit: intInRange('limit', 1, 200).optional() }), req.query);
    const filter = q.product ? { product: q.product } : {};
    const rows = await InventoryMovement.find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit ?? 50).populate('actor', 'name').lean();
    res.json({ items: rows.map(serializeMovement) });
  });

  /* Orders */
  r.get('/orders', async (req, res) => {
    const q = parse(orderListSchema, req.query);
    const filter = {};
    if (q.status && q.status !== 'all') filter.status = q.status;
    if (q.q) {
      const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.email': rx }];
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 100;
    const [total, docs] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    res.json({ items: docs.map(serializeOrder), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  });
  r.get('/orders/:id', async (req, res) => {
    assertObjectId(req.params.id, 'Order');
    const o = await Order.findById(req.params.id).lean();
    if (!o) throw notFound('Order');
    res.json({ order: serializeOrder(o) });
  });
  r.post('/orders', requirePermission('orders:write'), async (req, res) => {
    const key = requireIdempotencyKey(req);
    const d = parse(orderSchema, req.body);
    const payload = { customer: { name: d.customer, email: d.email, address: d.address }, items: d.items };
    const result = await runIdempotent({ userId: req.user._id, key, scope: 'order:create', payload }, (session) =>
      createOrder(session, { ...payload, actorId: req.user._id })
    );
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });
  r.post('/orders/:id/transition', requirePermission('orders:write'), async (req, res) => {
    assertObjectId(req.params.id, 'Order');
    const { to } = parse(z.object({ to: z.enum(ORDER_STATUSES, { error: 'Unknown order status.' }) }), req.body);
    res.json({ order: await transitionOrder({ orderId: req.params.id, to, actorId: req.user._id }) });
  });
  r.post('/orders/:id/cancel', requirePermission('orders:write'), async (req, res) => {
    assertObjectId(req.params.id, 'Order');
    const key = requireIdempotencyKey(req);
    const d = parse(z.object({ reason: text('Reason', 200).optional() }), req.body);
    const result = await runIdempotent({ userId: req.user._id, key, scope: `order:cancel:${req.params.id}`, payload: d }, (session) =>
      cancelOrder(session, { orderId: req.params.id, actorId: req.user._id, reason: d.reason })
    );
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });

  /* Dashboard */
  r.get('/dashboard', async (req, res) => {
    res.json(await getDashboard());
  });

  /* Settings */
  r.get('/settings', async (req, res) => {
    const s = (await Setting.findById('business').lean()) || new Setting().toObject();
    res.json({ settings: serializeSettings(s) });
  });
  r.put('/settings', requirePermission('settings:write'), async (req, res) => {
    const d = parse(
      z.object({
        businessName: text('Business name', 80, 1),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code like USD.'),
        defaultMinStock: intInRange('Default low stock threshold', 0, 1_000_000),
        lowStockAlerts: z.boolean(),
        version: intInRange('version', 0, Number.MAX_SAFE_INTEGER),
      }),
      req.body
    );
    const { version, ...fields } = d;
    await Setting.updateOne({ _id: 'business' }, { $setOnInsert: { version: 1 } }, { upsert: true });
    const updated = await Setting.findOneAndUpdate(
      { _id: 'business', version: version || 1 },
      { $set: { ...fields, updatedBy: req.user._id }, $inc: { version: 1 } },
      { new: true }
    ).lean();
    if (!updated) {
      const current = await Setting.findById('business').lean();
      throw conflict('STALE_VERSION', 'Settings were changed by someone else. Review the latest values and try again.', {
        current: serializeSettings(current),
      });
    }
    res.json({ settings: serializeSettings(updated) });
  });

  /* Users (admin) */
  r.get('/users', requirePermission('users:manage'), async (req, res) => {
    const users = await User.find().sort({ createdAt: 1 }).lean();
    res.json({ items: users.map(serializeUser) });
  });
  r.post('/users', requirePermission('users:manage'), async (req, res) => {
    const d = parse(
      z.object({
        email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
        name: text('Name', 80, 1),
        role: z.enum(ROLES),
        password: z.string().min(10, 'Password must be at least 10 characters.').max(200),
      }),
      req.body
    );
    try {
      const user = await User.create({ email: d.email, name: d.name, role: d.role, passwordHash: await bcrypt.hash(d.password, 12) });
      res.status(201).json({ user: serializeUser(user) });
    } catch (err) {
      if (err?.code === 11000) throw conflict('DUPLICATE_EMAIL', 'A user with that email already exists.');
      throw err;
    }
  });
  r.patch('/users/:id', requirePermission('users:manage'), async (req, res) => {
    assertObjectId(req.params.id, 'User');
    const d = parse(
      z.object({
        name: text('Name', 80, 1).optional(),
        role: z.enum(ROLES).optional(),
        active: z.boolean().optional(),
        password: z.string().min(10, 'Password must be at least 10 characters.').max(200).optional(),
      }),
      req.body
    );
    const isSelf = String(req.params.id) === String(req.user._id);
    if (isSelf && (d.role === 'staff' || d.active === false)) throw forbidden('You cannot remove your own admin access.');
    const set = {};
    for (const k of ['name', 'role', 'active']) if (d[k] !== undefined) set[k] = d[k];
    if (d.password) set.passwordHash = await bcrypt.hash(d.password, 12);
    if (!Object.keys(set).length) throw badRequest('Nothing to update.');
    const user = await User.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean();
    if (!user) throw notFound('User');
    res.json({ user: serializeUser(user) });
  });

  /* Legacy browser data import (admin) */
  r.post('/import/legacy', requirePermission('data:import'), async (req, res) => {
    const d = parse(
      z.object({ source: z.enum(['stockflow-storage', 'webapp-duo-workspace-v1']), data: z.union([z.string().max(5_000_000), z.record(z.string(), z.any())]) }),
      req.body
    );
    const result = await importLegacy(d, req.user._id);
    res.status(201).json(result);
  });

  /* Development-only reset to sample data */
  r.post('/dev/reset', requirePermission('data:reset'), async (req, res) => {
    if (!allowDevReset) throw notFound('Route');
    await wipeBusinessData();
    const counts = await seedSampleData({ actorId: req.user._id });
    res.json({ counts });
  });

  return r;
}
