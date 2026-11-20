/** Labels and badge styles for product stock states and order states. */
export const stockStatus = {
  active: { label: 'In stock', badge: 'badge-success' },
  low_stock: { label: 'Low stock', badge: 'badge-warning' },
  out_of_stock: { label: 'Out of stock', badge: 'badge-danger' },
};

export const orderStatus = {
  pending: { label: 'Pending', badge: 'badge-warning', next: 'processing', action: 'Start processing' },
  processing: { label: 'Processing', badge: 'badge-accent', next: 'shipped', action: 'Mark shipped' },
  shipped: { label: 'Shipped', badge: 'badge-shipped', next: 'delivered', action: 'Mark delivered' },
  delivered: { label: 'Delivered', badge: 'badge-success', next: null, action: null },
  cancelled: { label: 'Cancelled', badge: '', next: null, action: null },
};

/** Shared page container: one content width and gutter for every workspace screen. */
export const PAGE = 'mx-auto w-full max-w-[84rem] px-4 sm:px-6 lg:px-8 py-6 space-y-6';
