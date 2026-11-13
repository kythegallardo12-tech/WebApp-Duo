import { Counter, Order, Product, NEXT_STATUS, CANCELLABLE } from '../models/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { withTransaction } from '../db.js';
import { applyStockDelta } from './inventory.js';
import { serializeOrder } from './serialize.js';

/** Merge duplicate product lines: [{productId:a, qty:1},{productId:a, qty:2}] -> [{productId:a, qty:3}]. */
export function combineLines(items) {
  const map = new Map();
  for (const { productId, qty } of items) {
    map.set(productId, (map.get(productId) || 0) + qty);
  }
  return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
}

async function nextOrderNumber(session) {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `order-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );
  return `ORD-${year}-${String(counter.seq).padStart(4, '0')}`;
}

/**
 * Create an order inside `session` (caller provides the transaction).
 * Prices come from the database, never from the client. Every line reserves stock
 * with a conditional atomic update; any shortfall throws and aborts the whole transaction.
 */
export async function createOrder(session, { customer, items, actorId }) {
  const lines = combineLines(items);
  if (lines.length === 0) throw badRequest('An order needs at least one item.');

  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) }, deleted: false })
    .session(session)
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const snapshots = [];
  let totalCents = 0;
  for (const line of lines) {
    const p = byId.get(line.productId);
    if (!p) throw conflict('PRODUCT_UNAVAILABLE', 'One of the selected products is no longer available.', { productId: line.productId });
    snapshots.push({
      product: p._id,
      name: p.name,
      sku: p.sku,
      qty: line.qty,
      unitPriceCents: p.priceCents,
      unitCostCents: p.costCents || 0,
    });
    totalCents += p.priceCents * line.qty;
  }

  const orderNumber = await nextOrderNumber(session);
  const [order] = await Order.create(
    [
      {
        orderNumber,
        customer,
        items: snapshots,
        totalCents,
        status: 'pending',
        statusHistory: [{ status: 'pending', by: actorId }],
        stockReserved: true,
        createdBy: actorId,
      },
    ],
    { session }
  );

  for (const s of snapshots) {
    await applyStockDelta(session, {
      productId: s.product,
      delta: -s.qty,
      type: 'order',
      reason: `Reserved for ${orderNumber}`,
      orderId: order._id,
      actorId,
    });
  }

  return { status: 201, body: { order: serializeOrder(order) } };
}

/** Advance an order one step along pending -> processing -> shipped -> delivered. */
export async function transitionOrder({ orderId, to, actorId }) {
  return withTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw notFound('Order');
    if (to === 'cancelled') throw badRequest('Use the cancel endpoint to cancel an order.');
    if (NEXT_STATUS[order.status] !== to) {
      throw conflict('INVALID_TRANSITION', `An order that is "${order.status}" cannot move to "${to}".`, {
        from: order.status,
        to,
        allowed: NEXT_STATUS[order.status] ? [NEXT_STATUS[order.status]] : [],
      });
    }
    // Conditional update protects against two staff members advancing the same order at once.
    const updated = await Order.findOneAndUpdate(
      { _id: orderId, status: order.status },
      { $set: { status: to }, $push: { statusHistory: { status: to, by: actorId, at: new Date() } } },
      { new: true, session }
    );
    if (!updated) throw conflict('STALE_ORDER', 'This order was changed by someone else. Refresh and try again.');
    return serializeOrder(updated);
  });
}

/**
 * Cancel an order and restore its reserved stock, exactly once.
 * The status flip is conditional on a cancellable status, so a concurrent second
 * cancellation finds nothing to update and restores nothing.
 */
export async function cancelOrder(session, { orderId, actorId, reason }) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: CANCELLABLE } },
    {
      $set: { status: 'cancelled', cancelledAt: new Date() },
      $push: { statusHistory: { status: 'cancelled', by: actorId, at: new Date() } },
    },
    { new: true, session }
  );
  if (!order) {
    const current = await Order.findById(orderId).session(session).lean();
    if (!current) throw notFound('Order');
    if (current.status === 'cancelled') throw conflict('ALREADY_CANCELLED', `${current.orderNumber} is already cancelled.`);
    throw conflict(
      'NOT_CANCELLABLE',
      `${current.orderNumber} is "${current.status}" and can no longer be cancelled. Only pending or processing orders can be cancelled.`
    );
  }

  if (order.stockReserved) {
    for (const item of order.items) {
      if (!item.product) continue;
      const product = await Product.findById(item.product).session(session).lean();
      // Stock for soft-deleted products is still restored so the ledger stays consistent.
      if (!product) continue;
      if (product.deleted) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.qty } }, { session });
        continue;
      }
      await applyStockDelta(session, {
        productId: item.product,
        delta: item.qty,
        type: 'cancel',
        reason: reason ? `Cancelled ${order.orderNumber}: ${reason}` : `Cancelled ${order.orderNumber}`,
        orderId: order._id,
        actorId,
      });
    }
  }

  return { status: 200, body: { order: serializeOrder(order) } };
}
