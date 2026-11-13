import { Category, Order, Product } from '../models/index.js';
import { toDollars } from '../lib/money.js';

const DAY = 24 * 60 * 60 * 1000;
const pct = (cur, prev) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10);

/**
 * All figures are computed from database records. Cancelled orders are excluded
 * from revenue. "Growth" compares the last 30 days with the 30 days before that.
 */
export async function getDashboard(now = new Date()) {
  const live = { status: { $ne: 'cancelled' } };
  const start30 = new Date(now.getTime() - 30 * DAY);
  const start60 = new Date(now.getTime() - 60 * DAY);
  const start6m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [totals, windowRows, monthly, top, byCategory, statusCounts, inventory, categories, recent] = await Promise.all([
    Order.aggregate([
      { $match: live },
      {
        $group: {
          _id: null,
          revenueCents: { $sum: '$totalCents' },
          orders: { $sum: 1 },
          customers: { $addToSet: '$customer.email' },
          costCents: { $sum: { $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.qty', '$$i.unitCostCents'] } } } } },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...live, createdAt: { $gte: start60 } } },
      {
        $group: {
          _id: { $cond: [{ $gte: ['$createdAt', start30] }, 'current', 'previous'] },
          revenueCents: { $sum: '$totalCents' },
          orders: { $sum: 1 },
          customers: { $addToSet: '$customer.email' },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...live, createdAt: { $gte: start6m } } },
      {
        $group: {
          _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
          revenueCents: { $sum: '$totalCents' },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: live },
      { $unwind: '$items' },
      {
        $group: {
          _id: { $ifNull: ['$items.product', '$items.sku'] },
          name: { $last: '$items.name' },
          sales: { $sum: '$items.qty' },
          revenueCents: { $sum: { $multiply: ['$items.qty', '$items.unitPriceCents'] } },
        },
      },
      { $sort: { sales: -1, revenueCents: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: live },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
      { $group: { _id: { $first: '$p.category' }, revenueCents: { $sum: { $multiply: ['$items.qty', '$items.unitPriceCents'] } } } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.aggregate([
      { $match: { deleted: false } },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          units: { $sum: '$stock' },
          valueCents: { $sum: { $multiply: ['$stock', '$costCents'] } },
          retailCents: { $sum: { $multiply: ['$stock', '$priceCents'] } },
          out: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          low: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minStock'] }] }, 1, 0] } },
          healthy: { $sum: { $cond: [{ $gt: ['$stock', '$minStock'] }, 1, 0] } },
        },
      },
    ]),
    Category.find().lean(),
    Order.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const t = totals[0] || { revenueCents: 0, orders: 0, customers: [], costCents: 0 };
  const cur = windowRows.find((r) => r._id === 'current') || { revenueCents: 0, orders: 0, customers: [] };
  const prev = windowRows.find((r) => r._id === 'previous') || { revenueCents: 0, orders: 0, customers: [] };
  const inv = inventory[0] || { products: 0, units: 0, valueCents: 0, retailCents: 0, out: 0, low: 0, healthy: 0 };

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const row = monthly.find((r) => r._id.y === d.getUTCFullYear() && r._id.m === d.getUTCMonth() + 1);
    months.push({
      month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      year: d.getUTCFullYear(),
      revenue: toDollars(row?.revenueCents || 0),
      orders: row?.orders || 0,
    });
  }

  const catName = new Map(categories.map((c) => [String(c._id), c]));
  const totalCatRevenue = byCategory.reduce((s, r) => s + r.revenueCents, 0);
  const categoryMix = byCategory
    .map((r) => ({
      categoryId: r._id ? String(r._id) : null,
      name: catName.get(String(r._id))?.name || 'Uncategorised',
      color: catName.get(String(r._id))?.color || '#64748b',
      revenue: toDollars(r.revenueCents),
      share: totalCatRevenue ? Math.round((r.revenueCents / totalCatRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const status = Object.fromEntries(['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => [s, 0]));
  for (const r of statusCounts) status[r._id] = r.count;

  return {
    generatedAt: now,
    totals: {
      revenue: toDollars(t.revenueCents),
      orders: t.orders,
      customers: t.customers.length,
      products: inv.products,
      averageOrderValue: t.orders ? toDollars(Math.round(t.revenueCents / t.orders)) : 0,
      grossMargin: t.revenueCents ? Math.round(((t.revenueCents - t.costCents) / t.revenueCents) * 1000) / 10 : 0,
    },
    growth: {
      revenue: pct(cur.revenueCents, prev.revenueCents),
      orders: pct(cur.orders, prev.orders),
      customers: pct(cur.customers.length, prev.customers.length),
      window: { current: { revenue: toDollars(cur.revenueCents), orders: cur.orders }, previous: { revenue: toDollars(prev.revenueCents), orders: prev.orders } },
    },
    revenueByMonth: months,
    topProducts: top.map((r) => ({ name: r.name, sales: r.sales, revenue: toDollars(r.revenueCents) })),
    categoryMix,
    orderStatus: status,
    inventory: {
      units: inv.units,
      value: toDollars(inv.valueCents),
      retailValue: toDollars(inv.retailCents),
      healthy: inv.healthy,
      low: inv.low,
      out: inv.out,
    },
    recentOrders: recent.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      customer: o.customer.name,
      date: o.createdAt,
      total: toDollars(o.totalCents),
      status: o.status,
    })),
  };
}
