import { toDollars } from '../lib/money.js';
import { stockStatus } from '../models/index.js';

// API identifiers are the 24-character hex string of the MongoDB ObjectId, exposed as `id`.
const id = (v) => (v == null ? null : String(v._id ?? v));

export const serializeUser = (u) => ({
  id: id(u),
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt,
});

export const serializeCategory = (c) => ({
  id: id(c),
  name: c.name,
  icon: c.icon,
  color: c.color,
  legacyId: c.legacyId ?? null,
});

export const serializeProduct = (p, extra = {}) => ({
  id: id(p),
  name: p.name,
  sku: p.sku,
  category: id(p.category),
  price: toDollars(p.priceCents),
  cost: toDollars(p.costCents ?? 0),
  stock: p.stock,
  minStock: p.minStock,
  image: p.image || '',
  description: p.description || '',
  status: stockStatus(p),
  version: p.version,
  deleted: !!p.deleted,
  sales: extra.sales ?? p.sales ?? 0,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export const serializeOrder = (o) => ({
  id: id(o),
  orderNumber: o.orderNumber,
  customer: o.customer.name,
  email: o.customer.email,
  address: o.customer.address,
  items: o.items.map((i) => ({
    productId: id(i.product),
    name: i.name,
    sku: i.sku,
    qty: i.qty,
    price: toDollars(i.unitPriceCents),
  })),
  total: toDollars(o.totalCents),
  status: o.status,
  statusHistory: (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at })),
  date: o.createdAt,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

export const serializeMovement = (m) => ({
  id: id(m),
  productId: id(m.product),
  sku: m.sku,
  productName: m.productName,
  delta: m.delta,
  stockAfter: m.stockAfter,
  type: m.type,
  reason: m.reason,
  orderId: m.order ? id(m.order) : null,
  actor: m.actor && m.actor.name ? { id: id(m.actor), name: m.actor.name } : m.actor ? { id: id(m.actor) } : null,
  createdAt: m.createdAt,
});

export const serializeSettings = (s) => ({
  businessName: s.businessName,
  currency: s.currency,
  defaultMinStock: s.defaultMinStock,
  lowStockAlerts: s.lowStockAlerts,
  version: s.version,
  updatedAt: s.updatedAt,
});
