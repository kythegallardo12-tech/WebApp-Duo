import { useState, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  Star,
  ShoppingBag,
  Grid3X3,
  List,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useOptimisticUpdate } from '../hooks/useOptimisticUpdate';
import { simulateApiWithProgress } from '../utils/mockApi';
import useStore from '../store/useStore';

/**
 * Products Catalog Page (Full CRUD)
 * UX Architecture:
 * - Hick's Law: Categories curated to primary 7 options to eliminate decision fatigue
 * - Fitts' Law: Broad touch targets and distinct primary call-to-actions
 * - Occam's Razor: Form requires strictly operational attributes; extraneous telemetry hidden
 * - Modals vs Sheets:
 *    * Sheet used for rich multi-field configuration (Add/Edit Product, Item Detail)
 *    * Modal used strictly for critical/destructive binary confirmations (Delete Product)
 * - Optimistic Updates: Immediate local state mutate upon tap, background sync with retry
 */

const ProductCard = ({ product, onEdit, onDelete, onView, delay = 0 }) => {
  const statusBadge = {
    active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    low_stock: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    out_of_stock: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  };

  const statusLabel = {
    active: 'In Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',
  };

  return (
    <SpotlightCard className="p-0 overflow-hidden group flex flex-col justify-between">
      <div>
        {/* Visual Cover */}
        <div className="relative h-44 bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent z-10" />
          <ShoppingBag size={48} className="text-blue-400/20 group-hover:scale-110 group-hover:text-blue-400/40 transition-all duration-500" />

          {/* Status badge */}
          <div className="absolute top-3 left-3 z-20">
            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-md ${statusBadge[product.status]}`}>
              {statusLabel[product.status]}
            </span>
          </div>

          {/* Quick Action Floating Controls */}
          <div className="absolute top-3 right-3 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(product);
              }}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-blue-600 text-white backdrop-blur-md transition-colors border border-white/10"
              title="Inspect Details"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(product);
              }}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-amber-600 text-white backdrop-blur-md transition-colors border border-white/10"
              title="Edit Product"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product);
              }}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-rose-600 text-white backdrop-blur-md transition-colors border border-white/10"
              title="Delete Product"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-1">
              {product.name}
            </h3>
          </div>

          <p className="font-mono text-[11px] text-blue-400/70 mb-3">{product.sku}</p>

          <div className="flex items-center gap-2 mb-4 text-xs">
            <div className="flex items-center gap-1 text-amber-400">
              <Star size={13} className="fill-amber-400" />
              <span className="font-semibold">{product.rating}</span>
            </div>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">{product.sales} units ordered</span>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-white/5 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-[var(--color-text-muted)] block uppercase tracking-wider font-semibold">Unit Price</span>
          <span className="text-lg font-black text-white">${product.price.toFixed(2)}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-[var(--color-text-muted)] block uppercase tracking-wider font-semibold">Stock Quantity</span>
          <span className={`text-sm font-bold ${product.stock <= product.minStock ? 'text-amber-400' : 'text-slate-300'}`}>
            {product.stock} pcs
          </span>
        </div>
      </div>
    </SpotlightCard>
  );
};

const ProductForm = ({ product, onSave, onClose }) => {
  const categories = useStore((s) => s.categories);
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'cat-1',
    price: product?.price || '',
    cost: product?.cost || '',
    stock: product?.stock || '',
    minStock: product?.minStock || 15,
    sku: product?.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    description: product?.description || '',
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...product,
      ...form,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0,
      minStock: parseInt(form.minStock) || 10,
      id: product?.id || `prod-${Date.now()}`,
      status:
        parseInt(form.stock) === 0
          ? 'out_of_stock'
          : parseInt(form.stock) < parseInt(form.minStock)
          ? 'low_stock'
          : 'active',
      rating: product?.rating || 4.5,
      sales: product?.sales || 0,
      createdAt: product?.createdAt || new Date().toISOString().split('T')[0],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
          Product Label / Title
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="glass-input text-sm"
          placeholder="e.g. Mechanical Ergonomic Keyboard"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Category Division
          </label>
          <select
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className="glass-input text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            SKU Identifier
          </label>
          <input
            type="text"
            value={form.sku}
            onChange={(e) => handleChange('sku', e.target.value)}
            className="glass-input text-sm font-mono"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            MSRP / Selling Price ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={form.price}
            onChange={(e) => handleChange('price', e.target.value)}
            className="glass-input text-sm font-bold text-emerald-400"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Unit Cost Base ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={form.cost}
            onChange={(e) => handleChange('cost', e.target.value)}
            className="glass-input text-sm"
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Inventory In-Stock
          </label>
          <input
            type="number"
            value={form.stock}
            onChange={(e) => handleChange('stock', e.target.value)}
            className="glass-input text-sm"
            placeholder="0"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Low Stock Threshold
          </label>
          <input
            type="number"
            value={form.minStock}
            onChange={(e) => handleChange('minStock', e.target.value)}
            className="glass-input text-sm"
            placeholder="15"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
          Specifications & Description
        </label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          className="glass-input text-sm min-h-[90px]"
          rows={3}
          placeholder="Detailed material, warranty, and specifications overview..."
        />
      </div>

      {/* Fitts' Law: Large and distinct tap areas */}
      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button
          type="submit"
          className="btn-primary flex-1 justify-center py-3.5 text-sm font-bold shadow-lg shadow-blue-600/30"
        >
          {product ? 'Commit Changes (Optimistic Sync)' : 'Save & Publish Product'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost py-3.5 text-sm px-6"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const ProductsPage = () => {
  const products = useStore((s) => s.products);
  const addProduct = useStore((s) => s.addProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const categories = useStore((s) => s.categories);
  const addToast = useStore((s) => s.addToast);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');

  // Sheet states (for editing/adding and viewing)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);

  // Modal state (strictly for binary destructive confirmation)
  const [deleteModal, setDeleteModal] = useState({ open: false, product: null });

  // Optimistic update hook: "Update first, sync later"
  const { execute: optimisticExecute, isSyncing, syncErrors } = useOptimisticUpdate();

  const fetchProducts = useCallback(
    (onProgress) => simulateApiWithProgress(products, onProgress),
    []
  );
  const { loadingState, progress, timeLeft } = useSmartLoader(fetchProducts, []);

  // Filter products by search and category
  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleSave = (productData) => {
    const isEdit = !!editingProduct;

    // A tap = update first, sync after without waiting!
    optimisticExecute({
      localUpdate: () => {
        if (isEdit) {
          updateProduct(productData.id, productData);
        } else {
          addProduct(productData);
        }
      },
      serverSync: async () => {
        // Simulated server persistence
      },
      rollback: () => {
        // Rollback state if network failed
      },
    });

    addToast({
      type: 'success',
      title: isEdit ? 'Optimistic Sync: Updated' : 'Optimistic Sync: Created',
      message: `"${productData.name}" locally mutated instantly; background sync queued.`,
    });

    setSheetOpen(false);
    setEditingProduct(null);
  };

  const handleDelete = () => {
    const product = deleteModal.product;
    if (!product) return;

    // Instant local removal, sync in background
    optimisticExecute({
      localUpdate: () => deleteProduct(product.id),
      serverSync: async () => {},
      rollback: () => addProduct(product),
    });

    addToast({
      type: 'info',
      title: 'Item Deprecated',
      message: `"${product.name}" removed from local state.`,
    });

    setDeleteModal({ open: false, product: null });
  };

  return (
    <div>
      <Header
        title="Inventory Catalog & SKU Engine"
        subtitle={`Total Managed SKUs: ${products.length} Products`}
        syncState={{ isSyncing, syncErrors }}
      />

      <div className="p-6 space-y-6">
        {/* Controls Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by title, SKU, or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="glass-input pl-10 text-sm h-11"
              />
            </div>

            {/* Category Filter — Hick's law: simplified to top categories */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="glass-input text-sm h-11 w-full sm:w-52"
            >
              <option value="all" className="bg-slate-900 text-white">All Classifications</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher */}
            <div className="flex items-center glass-subtle rounded-xl p-1 border border-white/5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-lg transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
                title="Grid layout"
              >
                <Grid3X3 size={17} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-lg transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
                title="Tabular layout"
              >
                <List size={17} />
              </button>
            </div>

            {/* Primary Action — Fitts' Law */}
            <button
              onClick={() => {
                setEditingProduct(null);
                setSheetOpen(true);
              }}
              className="btn-primary h-11 px-5 text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <Plus size={18} />
              <span>Create Product</span>
            </button>
          </div>
        </div>

        {/* Dynamic Content Loader */}
        <SmartLoadingWrapper
          loadingState={loadingState}
          progress={progress}
          timeLeft={timeLeft}
          skeletonType="grid"
          skeletonCount={6}
          message="Synchronizing SKU inventory with local database..."
        >
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((prod, idx) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  delay={idx * 0.05}
                  onView={(p) => setViewProduct(p)}
                  onEdit={(p) => {
                    setEditingProduct(p);
                    setSheetOpen(true);
                  }}
                  onDelete={(p) => setDeleteModal({ open: true, product: p })}
                />
              ))}
            </div>
          ) : (
            <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3.5 font-semibold">Product & SKU</th>
                      <th className="px-5 py-3.5 font-semibold">Classification</th>
                      <th className="px-5 py-3.5 font-semibold">Unit Price</th>
                      <th className="px-5 py-3.5 font-semibold">In-Stock</th>
                      <th className="px-5 py-3.5 font-semibold">State</th>
                      <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {filtered.map((prod) => (
                      <tr key={prod.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{prod.name}</p>
                          <p className="font-mono text-xs text-blue-400">{prod.sku}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-300 text-xs">
                          {categories.find((c) => c.id === prod.category)?.name || prod.category}
                        </td>
                        <td className="px-5 py-4 font-black text-white">${prod.price.toFixed(2)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-300">{prod.stock}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                              prod.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : prod.status === 'low_stock'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {prod.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setViewProduct(prod)}
                              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
                              title="View Details"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingProduct(prod);
                                setSheetOpen(true);
                              }}
                              className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-amber-400"
                              title="Edit"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ open: true, product: prod })}
                              className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
              <ShoppingBag size={48} className="mx-auto text-slate-600 mb-3" />
              <h4 className="text-base font-bold text-white">No Matching Products Discovered</h4>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                Refine the search term or reset the category filter to review all available inventory items.
              </p>
            </div>
          )}
        </SmartLoadingWrapper>
      </div>

      {/* Sheet: For complex data-entry and multi-attribute editing */}
      <Sheet
        isOpen={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditingProduct(null);
        }}
        title={editingProduct ? 'Update Product Specification' : 'Enroll New Product'}
      >
        <ProductForm
          product={editingProduct}
          onSave={handleSave}
          onClose={() => {
            setSheetOpen(false);
            setEditingProduct(null);
          }}
        />
      </Sheet>

      {/* Sheet: Product Inspector View */}
      <Sheet
        isOpen={!!viewProduct}
        onClose={() => setViewProduct(null)}
        title="Product Inspection Record"
      >
        {viewProduct && (
          <div className="space-y-6">
            <div className="h-44 rounded-2xl bg-gradient-to-br from-blue-900/40 to-slate-900 border border-white/10 flex items-center justify-center">
              <ShoppingBag size={64} className="text-blue-400/30" />
            </div>

            <div>
              <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                {viewProduct.sku}
              </span>
              <h3 className="text-xl font-black text-white mt-2">{viewProduct.name}</h3>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {viewProduct.description || 'Enterprise catalog entry with standard delivery and quality warranty.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Unit Price</span>
                <span className="text-xl font-black text-white">${viewProduct.price.toFixed(2)}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Direct Cost</span>
                <span className="text-xl font-bold text-slate-300">${viewProduct.cost.toFixed(2)}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Current Stock</span>
                <span className="text-xl font-bold text-emerald-400">{viewProduct.stock} units</span>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="text-[10px] uppercase text-slate-400 block font-semibold">Lifetime Sales</span>
                <span className="text-xl font-bold text-blue-400">{viewProduct.sales} units</span>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex gap-3">
              <button
                onClick={() => {
                  const p = viewProduct;
                  setViewProduct(null);
                  setEditingProduct(p);
                  setSheetOpen(true);
                }}
                className="btn-primary flex-1 justify-center py-3 text-sm font-semibold"
              >
                Modify Record
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Modal: Binary High-Impact Destructive Confirmation */}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, product: null })}
        title="Confirm Irreversible Deletion"
        size="sm"
      >
        <div className="text-center py-2">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle size={28} />
          </div>
          <h4 className="text-base font-bold text-white mb-1">
            Remove "{deleteModal.product?.name}"?
          </h4>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            By confirming, this item will immediately be detached from the local store and synced to the database cluster.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteModal({ open: false, product: null })}
              className="btn-ghost flex-1 py-3 text-sm font-semibold justify-center"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="btn-danger flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-rose-900/30"
            >
              Delete Item
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductsPage;

