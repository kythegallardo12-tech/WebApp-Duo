import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

/* ── Users ─────────────────────────────────────────────── */
export const ROLES = ['admin', 'staff'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'staff' },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);
userSchema.index({ email: 1 }, { unique: true });
export const User = model('User', userSchema);

/* ── Categories ────────────────────────────────────────── */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    icon: { type: String, default: '\u{1F4E6}', maxlength: 8 },
    color: { type: String, default: '#3b82f6', maxlength: 16 },
    // Identifier from the original browser-only build (e.g. "cat-1"), used by seeding and legacy import.
    legacyId: String,
  },
  { timestamps: true }
);
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
categorySchema.index({ legacyId: 1 }, { unique: true, sparse: true });
export const Category = model('Category', categorySchema);

/* ── Products ──────────────────────────────────────────── */
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Stored normalized (trimmed, upper-case, whitespace -> dashes). Uniqueness enforced by index below.
    sku: { type: String, required: true, trim: true, maxlength: 40 },
    category: { type: ObjectId, ref: 'Category', required: true },
    priceCents: { type: Number, required: true, min: 0, validate: Number.isInteger },
    costCents: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    // Only ever changed through atomic $inc in the inventory/order services.
    stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
    minStock: { type: Number, default: 10, min: 0, validate: Number.isInteger },
    image: { type: String, default: '', maxlength: 500 },
    description: { type: String, default: '', maxlength: 2000 },
    // Optimistic-concurrency version for descriptive edits. Stock movements do not bump it.
    version: { type: Number, default: 1 },
    deleted: { type: Boolean, default: false },
    deletedAt: Date,
    legacyId: String,
    createdBy: { type: ObjectId, ref: 'User' },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
// SKU is unique among live products; a soft-deleted product releases its SKU.
productSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { deleted: false }, name: 'sku_unique_live' }
);
productSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
productSchema.index({ deleted: 1, category: 1, createdAt: -1 });
export const Product = model('Product', productSchema);

export const stockStatus = (p) =>
  p.stock <= 0 ? 'out_of_stock' : p.stock <= p.minStock ? 'low_stock' : 'active';

/* ── Orders ────────────────────────────────────────────── */
export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
// Forward fulfillment path.
export const NEXT_STATUS = { pending: 'processing', processing: 'shipped', shipped: 'delivered' };
// Orders can be cancelled until they leave the warehouse.
export const CANCELLABLE = ['pending', 'processing'];

const orderItemSchema = new Schema(
  {
    // Reference kept for reporting; name, sku and prices are immutable snapshots taken at order time.
    product: { type: ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    unitCostCents: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
      address: { type: String, required: true, trim: true, maxlength: 300 },
    },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    totalCents: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: [
      { _id: false, status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' } },
    ],
    // False for seeded/imported historical orders whose stock was never reserved by this system.
    stockReserved: { type: Boolean, default: true },
    cancelledAt: Date,
    legacyId: String,
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ legacyId: 1 }, { unique: true, sparse: true });
orderSchema.index({ status: 1, createdAt: -1 });
export const Order = model('Order', orderSchema);

/* ── Inventory movements (append-only ledger) ──────────── */
export const MOVEMENT_TYPES = ['initial', 'adjustment', 'order', 'cancel'];

const movementSchema = new Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    sku: String,
    productName: String,
    delta: { type: Number, required: true },
    stockAfter: { type: Number, required: true, min: 0 },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    reason: { type: String, maxlength: 200, default: '' },
    order: { type: ObjectId, ref: 'Order' },
    actor: { type: ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
movementSchema.index({ product: 1, createdAt: -1 });
export const InventoryMovement = model('InventoryMovement', movementSchema);

/* ── Business settings (singleton) ─────────────────────── */
const settingSchema = new Schema(
  {
    _id: { type: String, default: 'business' },
    businessName: { type: String, default: 'StockFlow Pro', maxlength: 80 },
    currency: { type: String, default: 'USD', maxlength: 3 },
    defaultMinStock: { type: Number, default: 15, min: 0 },
    lowStockAlerts: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
export const Setting = model('Setting', settingSchema);

/* ── Idempotency records ───────────────────────────────── */
const idempotencySchema = new Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  key: { type: String, required: true, maxlength: 100 },
  scope: { type: String, required: true },
  requestHash: { type: String, required: true },
  responseStatus: Number,
  responseBody: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});
idempotencySchema.index({ user: 1, key: 1 }, { unique: true });
// Keys are remembered for 48 hours.
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });
export const IdempotencyRecord = model('IdempotencyRecord', idempotencySchema);

/* ── Counters (order numbers) ──────────────────────────── */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema);

/* ── Legacy browser-data imports ───────────────────────── */
const importSchema = new Schema(
  { hash: { type: String, required: true }, source: String, user: { type: ObjectId, ref: 'User' }, counts: Schema.Types.Mixed },
  { timestamps: true }
);
importSchema.index({ hash: 1 }, { unique: true });
export const ImportBatch = model('ImportBatch', importSchema);
