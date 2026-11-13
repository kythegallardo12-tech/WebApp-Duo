import { categories, products, orders } from '../seed/sampleData.js';
import { Category, Counter, ImportBatch, InventoryMovement, Order, Product, Setting, IdempotencyRecord } from '../models/index.js';
import { withTransaction } from '../db.js';
import { loadLegacyData } from './legacy.js';

/**
 * Load the development sample data. Safe to run repeatedly: records are matched by
 * their sample ids / SKUs, so nothing is duplicated, and sample orders never deduct stock.
 */
export async function seedSampleData({ actorId } = {}) {
  await Setting.updateOne({ _id: 'business' }, { $setOnInsert: { businessName: 'StockFlow Pro' } }, { upsert: true });
  return withTransaction((session) => loadLegacyData(session, { categories, products, orders }, actorId));
}

/** Remove all business data (users and sessions are kept). Development/test only. */
export async function wipeBusinessData() {
  await Promise.all([
    Order.deleteMany({}),
    Product.deleteMany({}),
    Category.deleteMany({}),
    InventoryMovement.deleteMany({}),
    Counter.deleteMany({}),
    ImportBatch.deleteMany({}),
    IdempotencyRecord.deleteMany({}),
    Setting.deleteMany({}),
  ]);
}
