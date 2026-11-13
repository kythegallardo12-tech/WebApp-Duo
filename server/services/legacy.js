import crypto from 'node:crypto';
import { z } from 'zod';
import { Category, Counter, ImportBatch, InventoryMovement, Order, Product, ORDER_STATUSES } from '../models/index.js';
import { withTransaction } from '../db.js';
import { badRequest, conflict } from '../lib/errors.js';
import { normalizeSku } from '../lib/validate.js';

/**
 * Shared loader for (a) development sample data and (b) data exported from the
 * old browser-only build (localStorage keys "stockflow-storage" and
 * "webapp-duo-workspace-v1").
 *
 * Rules:
 *  - Records are matched by their legacy id (then SKU for products), so running
 *    the loader twice never duplicates anything.
 *  - Product stock is taken as the opening balance.
 *  - Historical orders are stored with stockReserved=false: they never deduct
 *    stock again, and cancelling them later does not add stock back.
 */

const money = z.coerce.number().finite().min(0).max(100_000_000);
const legacyProduct = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(40),
  category: z.union([z.string(), z.number()]).transform(String).optional(),
  price: money,
  cost: money.optional().default(0),
  stock: z.coerce.number().int().min(0).max(10_000_000),
  minStock: z.coerce.number().int().min(0).max(10_000_000).optional().default(10),
  image: z.string().max(500).optional().default(''),
  description: z.string().max(2000).optional().default(''),
});
const legacyOrder = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  customer: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional().default('unknown@example.com'),
  address: z.string().trim().max(300).optional().default('Not provided'),
  status: z.string().optional().default('pending'),
  date: z.string().optional(),
  daysAgo: z.number().optional(),
  items: z
    .array(
      z.object({
        productId: z.union([z.string(), z.number()]).transform(String).optional(),
        name: z.string().trim().min(1).max(120),
        sku: z.string().optional(),
        qty: z.coerce.number().int().min(1).max(100000),
        price: money,
      })
    )
    .min(1),
});
const legacyCategory = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(8).optional(),
  color: z.string().max(16).optional(),
});

/** Accept the raw localStorage JSON from either legacy key and pull out the arrays. */
export function normalizeLegacyPayload(raw) {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw badRequest('The legacy data is not valid JSON.');
    }
  }
  const root = data?.state ?? data?.data ?? data?.workspace ?? data;
  if (!root || typeof root !== 'object') throw badRequest('No products or orders were found in the legacy data.');

  const pick = (key, schema) => {
    const arr = Array.isArray(root[key]) ? root[key] : [];
    return arr.map((item, i) => {
      const r = schema.safeParse(item);
      if (!r.success) {
        const issue = r.error.issues[0];
        throw badRequest(`${key}[${i}].${issue.path.join('.')}: ${issue.message}`);
      }
      return r.data;
    });
  };
  const products = pick('products', legacyProduct);
  const orders = pick('orders', legacyOrder);
  const categories = pick('categories', legacyCategory);
  if (!products.length && !orders.length) throw badRequest('No products or orders were found in the legacy data.');
  return { categories, products, orders };
}

const toCents = (n) => Math.round(Number(n) * 100);

export async function loadLegacyData(session, { categories = [], products = [], orders = [] }, actorId, now = new Date()) {
  const counts = { categories: 0, products: 0, orders: 0, skippedProducts: 0, skippedOrders: 0 };

  // Categories
  const catMap = new Map();
  for (const c of categories) {
    let doc = await Category.findOne({ $or: [{ legacyId: c.id }, { name: c.name }] })
      .collation({ locale: 'en', strength: 2 })
      .session(session);
    if (!doc) {
      [doc] = await Category.create([{ name: c.name, icon: c.icon, color: c.color, legacyId: c.id }], { session });
      counts.categories++;
    }
    catMap.set(c.id, doc._id);
  }
  const fallbackCategory = async () => {
    let doc = await Category.findOne({ name: 'Imported' }).session(session);
    if (!doc) {
      [doc] = await Category.create([{ name: 'Imported', icon: '\u{1F4E5}', color: '#64748b' }], { session });
      counts.categories++;
    }
    return doc._id;
  };
  const resolveCategory = async (legacyCat) => {
    if (legacyCat && catMap.has(legacyCat)) return catMap.get(legacyCat);
    if (legacyCat) {
      const byLegacy = await Category.findOne({ legacyId: legacyCat }).session(session);
      if (byLegacy) {
        catMap.set(legacyCat, byLegacy._id);
        return byLegacy._id;
      }
    }
    return fallbackCategory();
  };

  // Products
  const productMap = new Map();
  for (const p of products) {
    const sku = normalizeSku(p.sku);
    let doc = await Product.findOne({ $or: [{ legacyId: p.id }, { sku, deleted: false }] }).session(session);
    if (doc) {
      counts.skippedProducts++;
    } else {
      [doc] = await Product.create(
        [
          {
            name: p.name,
            sku,
            category: await resolveCategory(p.category),
            priceCents: toCents(p.price),
            costCents: toCents(p.cost),
            stock: p.stock,
            minStock: p.minStock,
            image: p.image,
            description: p.description,
            legacyId: p.id,
            createdBy: actorId,
          },
        ],
        { session }
      );
      if (doc.stock > 0) {
        await InventoryMovement.create(
          [{ product: doc._id, sku, productName: doc.name, delta: doc.stock, stockAfter: doc.stock, type: 'initial', reason: 'Opening balance (imported)', actor: actorId }],
          { session }
        );
      }
      counts.products++;
    }
    productMap.set(p.id, doc);
  }

  // Orders (historical: no stock movement)
  for (const o of orders) {
    if (await Order.exists({ legacyId: o.id }).session(session)) {
      counts.skippedOrders++;
      continue;
    }
    const items = [];
    for (const i of o.items) {
      const mapped = i.productId ? productMap.get(i.productId) || (await Product.findOne({ legacyId: i.productId }).session(session)) : null;
      items.push({
        product: mapped?._id,
        name: i.name,
        sku: mapped?.sku || normalizeSku(i.sku || `LEGACY-${i.productId || 'ITEM'}`),
        qty: i.qty,
        unitPriceCents: toCents(i.price),
        unitCostCents: mapped?.costCents || 0,
      });
    }
    const status = ORDER_STATUSES.includes(o.status) ? o.status : 'pending';
    let createdAt = now;
    if (typeof o.daysAgo === 'number') createdAt = new Date(now.getTime() - o.daysAgo * 86400000 - 3600000);
    else if (o.date && !Number.isNaN(Date.parse(o.date))) createdAt = new Date(o.date);

    let orderNumber = /^[A-Za-z0-9-]{3,40}$/.test(o.id) ? o.id : null;
    if (!orderNumber || (await Order.exists({ orderNumber }).session(session))) {
      const c = await Counter.findOneAndUpdate({ _id: 'legacy' }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      orderNumber = `LEG-${String(c.seq).padStart(5, '0')}`;
    }
    await Order.create(
      [
        {
          orderNumber,
          customer: { name: o.customer, email: o.email || 'unknown@example.com', address: o.address || 'Not provided' },
          items,
          totalCents: items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0),
          status,
          statusHistory: [{ status, at: createdAt, by: actorId }],
          stockReserved: false,
          legacyId: o.id,
          createdBy: actorId,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      { session, timestamps: false }
    );
    counts.orders++;
  }

  return counts;
}

/** Authenticated admin import of browser-local data. Duplicate uploads of the same payload are rejected. */
export async function importLegacy({ source, data }, actorId) {
  const normalized = normalizeLegacyPayload(data);
  const hash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  try {
    return await withTransaction(async (session) => {
      if (await ImportBatch.exists({ hash }).session(session)) {
        throw conflict('ALREADY_IMPORTED', 'This browser data has already been imported.');
      }
      const counts = await loadLegacyData(session, normalized, actorId);
      await ImportBatch.create([{ hash, source, user: actorId, counts }], { session });
      return { counts, hash };
    });
  } catch (err) {
    if (err?.code === 11000 && /importbatch/i.test(String(err.message))) {
      throw conflict('ALREADY_IMPORTED', 'This browser data has already been imported.');
    }
    throw err;
  }
}
