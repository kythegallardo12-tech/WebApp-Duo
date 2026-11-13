import { InventoryMovement, Product } from '../models/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { serializeMovement, serializeProduct } from './serialize.js';

/**
 * Atomically apply a stock delta inside `session`.
 * The conditional filter guarantees stock never goes below zero, even when
 * several transactions race for the same units.
 */
export async function applyStockDelta(session, { productId, delta, type, reason, orderId, actorId }) {
  const filter = { _id: productId, deleted: false };
  if (delta < 0) filter.stock = { $gte: -delta };

  const product = await Product.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true, session });
  if (!product) {
    const exists = await Product.findOne({ _id: productId }).session(session).lean();
    if (!exists || exists.deleted) throw notFound('Product');
    throw conflict(
      'INSUFFICIENT_STOCK',
      `Not enough stock for "${exists.name}" (${exists.stock} available, ${-delta} requested).`,
      { productId: String(productId), available: exists.stock, requested: -delta }
    );
  }

  const [movement] = await InventoryMovement.create(
    [
      {
        product: product._id,
        sku: product.sku,
        productName: product.name,
        delta,
        stockAfter: product.stock,
        type,
        reason,
        order: orderId,
        actor: actorId,
      },
    ],
    { session }
  );
  return { product, movement };
}

/** Manual stock adjustment (restock, shrinkage, count correction). Runs inside an idempotent transaction. */
export async function adjustStock(session, { productId, delta, reason, actorId }) {
  const { product, movement } = await applyStockDelta(session, {
    productId,
    delta,
    type: 'adjustment',
    reason,
    actorId,
  });
  return { status: 200, body: { product: serializeProduct(product), movement: serializeMovement(movement) } };
}
