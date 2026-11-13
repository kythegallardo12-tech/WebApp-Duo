import mongoose from 'mongoose';
import { Category, InventoryMovement, Order, Product } from '../models/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizeSku } from '../lib/validate.js';
import { withTransaction } from '../db.js';
import { serializeProduct } from './serialize.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  '-name': { name: -1, _id: -1 },
  price: { priceCents: 1, _id: 1 },
  '-price': { priceCents: -1, _id: -1 },
  stock: { stock: 1, _id: 1 },
  '-stock': { stock: -1, _id: -1 },
  sku: { sku: 1, _id: 1 },
};

export function buildProductFilter({ q, category, status }) {
  const filter = { deleted: false };
  if (q) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { description: rx }];
  }
  if (category && category !== 'all') filter.category = new mongoose.Types.ObjectId(category);
  if (status === 'out_of_stock') filter.stock = { $lte: 0 };
  else if (status === 'low_stock') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minStock'] }] };
  else if (status === 'active') filter.$expr = { $gt: ['$stock', '$minStock'] };
  return filter;
}

/** Units sold per product, from non-cancelled orders. */
async function salesByProduct(ids) {
  if (!ids.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: ids } } },
    { $group: { _id: '$items.product', units: { $sum: '$items.qty' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.units]));
}

export async function listProducts({ q, category, status, sort = 'newest', page = 1, limit = 12 }) {
  const filter = buildProductFilter({ q, category, status });
  const [total, docs] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(SORTS[sort] || SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  const sales = await salesByProduct(docs.map((d) => d._id));
  return {
    items: docs.map((d) => serializeProduct(d, { sales: sales.get(String(d._id)) || 0 })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportProductsCsv({ q, category, status, sort }) {
  const filter = buildProductFilter({ q, category, status });
  const [docs, categories] = await Promise.all([
    Product.find(filter).sort(SORTS[sort] || SORTS.newest).lean(),
    Category.find().lean(),
  ]);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const header = ['SKU', 'Name', 'Category', 'Price', 'Cost', 'Stock', 'Min Stock', 'Status', 'Description'];
  const rows = docs.map((d) => {
    const p = serializeProduct(d);
    return [p.sku, p.name, catName.get(p.category) || '', p.price.toFixed(2), p.cost.toFixed(2), p.stock, p.minStock, p.status, p.description];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function duplicateSkuError(sku) {
  return conflict('DUPLICATE_SKU', `SKU "${sku}" is already used by another product.`, { fields: { sku: 'This SKU is already in use.' } });
}

async function assertCategory(categoryId, session) {
  const exists = await Category.exists({ _id: categoryId }).session(session ?? null);
  if (!exists) throw badRequest('category: Selected category does not exist.', { fields: { category: 'Selected category does not exist.' } });
}

export async function createProduct(data, actorId) {
  const sku = normalizeSku(data.sku);
  try {
    return await withTransaction(async (session) => {
      await assertCategory(data.category, session);
      const [product] = await Product.create(
        [
          {
            name: data.name,
            sku,
            category: data.category,
            priceCents: data.priceCents,
            costCents: data.costCents,
            stock: data.stock,
            minStock: data.minStock,
            image: data.image,
            description: data.description,
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session }
      );
      if (product.stock > 0) {
        await InventoryMovement.create(
          [{ product: product._id, sku, productName: product.name, delta: product.stock, stockAfter: product.stock, type: 'initial', reason: 'Opening balance', actor: actorId }],
          { session }
        );
      }
      return serializeProduct(product);
    });
  } catch (err) {
    if (err?.code === 11000) throw duplicateSkuError(sku);
    throw err;
  }
}

/**
 * Edit descriptive fields. Stock is intentionally NOT editable here (use adjustments),
 * so an edit can never overwrite a concurrent stock change. `version` must match the
 * version the client last saw, otherwise 409 STALE_VERSION is returned.
 */
export async function updateProduct(id, { version, ...changes }, actorId) {
  const set = { ...changes, updatedBy: actorId };
  if (changes.sku !== undefined) set.sku = normalizeSku(changes.sku);
  if (changes.category !== undefined) await assertCategory(changes.category);
  try {
    const updated = await Product.findOneAndUpdate(
      { _id: id, deleted: false, version },
      { $set: set, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      const current = await Product.findOne({ _id: id, deleted: false }).lean();
      if (!current) throw notFound('Product');
      throw conflict('STALE_VERSION', 'This product was changed by someone else. Review the latest version and try again.', {
        current: serializeProduct(current),
      });
    }
    return serializeProduct(updated);
  } catch (err) {
    if (err?.code === 11000) throw duplicateSkuError(set.sku);
    throw err;
  }
}

/** Soft delete: the product disappears from the catalog but order history keeps its snapshots. */
export async function deleteProduct(id, actorId) {
  const updated = await Product.findOneAndUpdate(
    { _id: id, deleted: false },
    { $set: { deleted: true, deletedAt: new Date(), updatedBy: actorId }, $inc: { version: 1 } },
    { new: true }
  ).lean();
  if (!updated) throw notFound('Product');
  return serializeProduct(updated);
}
