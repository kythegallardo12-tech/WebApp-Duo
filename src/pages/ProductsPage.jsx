import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  ShoppingBag,
  Grid3X3,
  List,
  AlertTriangle,
  Download,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Products Catalog (server-backed CRUD)
 * - Hick's Law: curated categories and a single status filter
 * - Fitts' Law: broad touch targets and distinct primary actions
 * - Sheets for multi-field editing; Modal only for the destructive delete confirmation
 * - Optimistic updates: the change shows at once, marked "Saving…" until the API confirms it
 * - Search, filters, sorting and pagination run on the server; CSV export uses the same filters
 */

const PAGE_SIZE = 12;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const statusBadge = {
  active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  low_stock: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  out_of_stock: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
};
const statusLabel = { active: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' };

const ProductImage = ({ product, size = 48, className = '' }) => {
  const [failed, setFailed] = useState(false);
  if (product.image && !failed) {
    return (
      <img
        src={product.image}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-110 transition-all duration-700 ${className}`}
      />
    );
  }
  return <ShoppingBag size={size} className="text-blue-400/20 group-hover:scale-110 group-hover:text-blue-400/40 transition-all duration-500" />;
};

const SavingBadge = () => (
  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" aria-hidden="true" /> Saving…
  </span>
);

const ProductCard = ({ product, pending, canDelete, onEdit, onDelete, onView }) => (
  <SpotlightCard className="p-0! overflow-hidden group flex flex-col justify-between" data-testid="product-card">
    <div>
      <div className="relative h-44 bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden border-b border-white/5">
        <ProductImage product={product} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent z-10" />

        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-md ${statusBadge[product.status]}`}>
            {statusLabel[product.status]}
          </span>
          {pending && <SavingBadge />}
        </div>

        {/* Visible on hover and on keyboard focus */}
        <div className="absolute top-3 right-3 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 focus-within:translate-y-0">
          <button onClick={() => onView(product)} className="p-2 rounded-xl bg-slate-900/80 hover:bg-blue-600 text-white backdrop-blur-md transition-colors border border-white/10" aria-label={`Inspect ${product.name}`} title="Inspect Details">
            <Eye size={14} />
          </button>
          <button onClick={() => onEdit(product)} disabled={product.id.startsWith('tmp-')} className="p-2 rounded-xl bg-slate-900/80 hover:bg-amber-600 text-white backdrop-blur-md transition-colors border border-white/10 disabled:opacity-40" aria-label={`Edit ${product.name}`} title="Edit Product">
            <Edit3 size={14} />
          </button>
          {canDelete && (
            <button onClick={() => onDelete(product)} disabled={product.id.startsWith('tmp-')} className="p-2 rounded-xl bg-slate-900/80 hover:bg-rose-600 text-white backdrop-blur-md transition-colors border border-white/10 disabled:opacity-40" aria-label={`Delete ${product.name}`} title="Delete Product">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-1">{product.name}</h3>
        <p className="font-mono text-[11px] text-blue-400/70 mb-3">{product.sku}</p>
        <p className="text-xs text-slate-400">{product.sales ?? 0} {(product.sales ?? 0) === 1 ? 'unit' : 'units'} ordered</p>
      </div>
    </div>

    <div className="px-5 pb-5 pt-3 border-t border-white/5 flex items-center justify-between">
      <div>
        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase tracking-wider font-semibold">Unit Price</span>
        <span className="text-lg font-black text-white">{money(product.price)}</span>
      </div>
      <div className="text-right">
        <span className="text-[10px] text-[var(--color-text-muted)] block uppercase tracking-wider font-semibold">Stock Quantity</span>
        <span className={`text-sm font-bold ${product.stock <= product.minStock ? 'text-amber-400' : 'text-slate-300'}`}>{product.stock} pcs</span>
      </div>
    </div>
  </SpotlightCard>
);

const Field = ({ id, label, error, children, hint }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
      {label}
    </label>
    {children}
    {hint && !error && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    {error && (
      <p className="text-[11px] text-rose-400 mt-1" role="alert" id={`${id}-error`}>
        {error}
      </p>
    )}
  </div>
);

const ProductForm = ({ product, initial, fieldErrors = {}, onSave, onClose }) => {
  const categories = useStore((s) => s.categories);
  const settings = useStore((s) => s.settings);
  const isEdit = !!product;
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? product?.name ?? '',
    category: initial?.category ?? product?.category ?? categories[0]?.id ?? '',
    price: initial?.price ?? product?.price ?? '',
    cost: initial?.cost ?? product?.cost ?? '',
    stock: initial?.stock ?? product?.stock ?? '',
    minStock: initial?.minStock ?? product?.minStock ?? settings?.defaultMinStock ?? 15,
    sku: initial?.sku ?? product?.sku ?? `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    image: initial?.image ?? product?.image ?? '',
    description: initial?.description ?? product?.description ?? '',
  }));
  const [errors, setErrors] = useState(fieldErrors);


  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.sku.trim()) e.sku = 'SKU is required.';
    if (!(form.category || categories[0]?.id)) e.category = 'Choose a category.';
    const price = Number(form.price);
    if (form.price === '' || !Number.isFinite(price) || price < 0) e.price = 'Enter a price of 0 or more.';
    else if (Math.round(price * 100) !== Number((price * 100).toFixed(6))) e.price = 'Use at most two decimals.';
    if (form.cost !== '' && (!Number.isFinite(Number(form.cost)) || Number(form.cost) < 0)) e.cost = 'Enter a cost of 0 or more.';
    if (!isEdit && form.stock !== '' && (!Number.isInteger(Number(form.stock)) || Number(form.stock) < 0)) e.stock = 'Stock must be a whole number of 0 or more.';
    if (form.minStock !== '' && (!Number.isInteger(Number(form.minStock)) || Number(form.minStock) < 0)) e.minStock = 'Use a whole number of 0 or more.';
    if (form.image && !/^https?:\/\/\S+$/i.test(form.image.trim())) e.image = 'Use a full http(s) image URL, or leave empty.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category || categories[0]?.id,
      price: Number(form.price),
      cost: form.cost === '' ? 0 : Number(form.cost),
      minStock: form.minStock === '' ? undefined : Number(form.minStock),
      image: form.image.trim(),
      description: form.description,
    };
    if (!isEdit) payload.stock = form.stock === '' ? 0 : Number(form.stock);
    onSave(payload, form);
  };

  const input = (id, props) => ({ id, 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined, ...props });

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field id="name" label="Product Label / Title" error={errors.name}>
        <input {...input('name')} type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className="glass-input text-sm" placeholder="e.g. Mechanical Ergonomic Keyboard" />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="category" label="Category Division" error={errors.category}>
          <select {...input('category')} value={form.category || categories[0]?.id || ''} onChange={(e) => set('category', e.target.value)} className="glass-input text-sm">
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sku" label="SKU Identifier" error={errors.sku} hint="Saved in upper case; must be unique.">
          <input {...input('sku')} type="text" value={form.sku} onChange={(e) => set('sku', e.target.value)} className="glass-input text-sm font-mono" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="price" label="Selling Price ($)" error={errors.price}>
          <input {...input('price')} type="number" step="0.01" min="0" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} className="glass-input text-sm font-bold text-emerald-400" placeholder="0.00" />
        </Field>
        <Field id="cost" label="Unit Cost ($)" error={errors.cost}>
          <input {...input('cost')} type="number" step="0.01" min="0" inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} className="glass-input text-sm" placeholder="0.00" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isEdit ? (
          <Field id="stock" label="Inventory In-Stock" hint="Change stock from the Inventory page so every change is recorded.">
            <div className="glass-input text-sm flex items-center gap-2 text-slate-400" id="stock">
              <Lock size={13} /> {product.stock} units
            </div>
          </Field>
        ) : (
          <Field id="stock" label="Opening Stock" error={errors.stock}>
            <input {...input('stock')} type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="glass-input text-sm" placeholder="0" />
          </Field>
        )}
        <Field id="minStock" label="Low Stock Threshold" error={errors.minStock}>
          <input {...input('minStock')} type="number" min="0" step="1" inputMode="numeric" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="glass-input text-sm" placeholder="15" />
        </Field>
      </div>

      <Field id="image" label="Image URL" error={errors.image}>
        <input {...input('image')} type="url" value={form.image} onChange={(e) => set('image', e.target.value)} className="glass-input text-sm" placeholder="https://…" />
      </Field>

      <Field id="description" label="Specifications & Description" error={errors.description}>
        <textarea {...input('description')} value={form.description} onChange={(e) => set('description', e.target.value)} className="glass-input text-sm min-h-[90px]" rows={3} placeholder="Material, warranty and specifications…" />
      </Field>

      <div className="flex gap-3 pt-4 border-t border-white/10">
        <button type="submit" className="btn-primary flex-1 justify-center py-3.5 text-sm font-bold shadow-lg shadow-blue-600/30">
          {isEdit ? 'Save Changes' : 'Save & Publish Product'}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost py-3.5 text-sm px-6">
          Cancel
        </button>
      </div>
    </form>
  );
};

const ProductsPage = () => {
  const storeProducts = useStore((s) => s.products);
  const categories = useStore((s) => s.categories);
  const pending = useStore((s) => s.pending);
  const dataVersion = useStore((s) => s.dataVersion);
  const viewMode = useStore((s) => s.productView);
  const setViewMode = useStore((s) => s.setProductView);
  const createProduct = useStore((s) => s.createProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const can = useAuth((s) => s.can);
  const canWrite = can('catalog:write');
  const canDelete = can('catalog:delete');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  // sheet: { mode: 'create' | 'edit', product?, initial?, errors? }
  const [sheet, setSheet] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(
    () => ({ q: search || undefined, category: categoryFilter, status: statusFilter, sort, page, limit: PAGE_SIZE }),
    [search, categoryFilter, statusFilter, sort, page]
  );
  const fetchPage = useCallback((onProgress, signal) => api.listProducts(params, { signal }), [params]);
  const { data, loadingState, progress, timeLeft, error, refetch, refreshing } = useSmartLoader(fetchPage, [params, dataVersion]);

  // Overlay optimistic local state (edits, deletions, new temp items) on the server page.
  const items = useMemo(() => {
    if (!data) return [];
    const local = new Map(storeProducts.map((p) => [p.id, p]));
    const rows = data.items
      .filter((p) => local.has(p.id) || !pending[p.id])
      .map((p) => (local.has(p.id) ? { ...p, ...local.get(p.id), sales: p.sales } : p));
    const temps = page === 1 ? storeProducts.filter((p) => p.id.startsWith('tmp-')) : [];
    return [...temps, ...rows];
  }, [data, storeProducts, pending, page]);

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const handleSave = async (payload, rawForm) => {
    const current = sheet;
    setSheet(null); // optimistic: close at once, the item shows "Saving…"
    const result = current.mode === 'edit' ? await updateProduct(current.product.id, payload) : await createProduct(payload);
    if (!result.ok && ['validation', 'conflict'].includes(result.error?.kind)) {
      // Re-open the form with what the user typed and the server's field errors.
      const fresh = current.mode === 'edit' ? useStore.getState().products.find((p) => p.id === current.product.id) : null;
      const errors = result.error.details?.fields || {};
      if (result.error.code === 'STALE_VERSION') errors.name = 'Someone else changed this product. Their version is shown — re-apply your edit.';
      setSheet({ ...current, product: fresh || current.product, initial: result.error.code === 'STALE_VERSION' ? undefined : rawForm, errors });
    }
  };

  const handleDelete = () => {
    const product = deleteModal;
    setDeleteModal(null);
    if (product) deleteProduct(product.id);
  };

  const exportHref = api.exportCsvUrl({ q: search || undefined, category: categoryFilter, status: statusFilter, sort });
  const catName = (id) => categories.find((c) => c.id === id)?.name || '—';

  return (
    <div>
      <Header title="Inventory Catalog & SKU Engine" subtitle={`${total} products${refreshing ? ' · updating…' : ''}`} />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center justify-between">
          <div className="flex flex-1 flex-col sm:flex-row flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-slate-400" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search products"
                placeholder="Search by title, SKU, or keyword..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="glass-input pl-10 text-sm h-11"
              />
            </div>
            <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="glass-input text-sm h-11 w-full sm:w-48">
              <option value="all" className="bg-slate-900 text-white">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <select aria-label="Filter by stock status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="glass-input text-sm h-11 w-full sm:w-40">
              <option value="all" className="bg-slate-900 text-white">Any status</option>
              <option value="active" className="bg-slate-900 text-white">In stock</option>
              <option value="low_stock" className="bg-slate-900 text-white">Low stock</option>
              <option value="out_of_stock" className="bg-slate-900 text-white">Out of stock</option>
            </select>
            <select aria-label="Sort products" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="glass-input text-sm h-11 w-full sm:w-44">
              <option value="newest" className="bg-slate-900 text-white">Newest first</option>
              <option value="name" className="bg-slate-900 text-white">Name A–Z</option>
              <option value="-name" className="bg-slate-900 text-white">Name Z–A</option>
              <option value="price" className="bg-slate-900 text-white">Price low–high</option>
              <option value="-price" className="bg-slate-900 text-white">Price high–low</option>
              <option value="stock" className="bg-slate-900 text-white">Stock low–high</option>
              <option value="-stock" className="bg-slate-900 text-white">Stock high–low</option>
              <option value="sku" className="bg-slate-900 text-white">SKU</option>
            </select>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center glass-subtle rounded-xl p-1 border border-white/5" role="group" aria-label="Layout">
              <button onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} title="Grid layout" aria-label="Grid layout">
                <Grid3X3 size={17} />
              </button>
              <button onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={`p-2.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} title="Table layout" aria-label="Table layout">
                <List size={17} />
              </button>
            </div>
            <a href={exportHref} download className="btn-ghost h-11 px-4 text-sm border border-white/10 flex items-center gap-2" data-testid="export-csv">
              <Download size={16} /> <span>Export CSV</span>
            </a>
            {canWrite && (
              <button onClick={() => setSheet({ mode: 'create' })} className="btn-primary h-11 px-5 text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2">
                <Plus size={18} />
                <span>Create Product</span>
              </button>
            )}
          </div>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType="grid" skeletonCount={8} message="Loading the product catalog…">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  pending={!!pending[prod.id]}
                  canDelete={canDelete}
                  onView={setViewProduct}
                  onEdit={(p) => (canWrite ? setSheet({ mode: 'edit', product: p }) : setViewProduct(p))}
                  onDelete={setDeleteModal}
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
                      <th className="px-5 py-3.5 font-semibold">Category</th>
                      <th className="px-5 py-3.5 font-semibold">Unit Price</th>
                      <th className="px-5 py-3.5 font-semibold">In-Stock</th>
                      <th className="px-5 py-3.5 font-semibold">State</th>
                      <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {items.map((prod) => (
                      <tr key={prod.id} className="hover:bg-white/[0.02] transition-colors" data-testid="product-row">
                        <td className="px-5 py-4">
                          <p className="font-bold text-white flex items-center gap-2">
                            {prod.name} {pending[prod.id] && <SavingBadge />}
                          </p>
                          <p className="font-mono text-xs text-blue-400">{prod.sku}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-300 text-xs">{catName(prod.category)}</td>
                        <td className="px-5 py-4 font-black text-white">{money(prod.price)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-300">{prod.stock}</td>
                        <td className="px-5 py-4">
                          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${statusBadge[prod.status]}`}>{statusLabel[prod.status]}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setViewProduct(prod)} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white" aria-label={`Inspect ${prod.name}`}>
                              <Eye size={15} />
                            </button>
                            {canWrite && (
                              <button onClick={() => setSheet({ mode: 'edit', product: prod })} disabled={prod.id.startsWith('tmp-')} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-amber-400 disabled:opacity-40" aria-label={`Edit ${prod.name}`}>
                                <Edit3 size={15} />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setDeleteModal(prod)} disabled={prod.id.startsWith('tmp-')} className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 disabled:opacity-40" aria-label={`Delete ${prod.name}`}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {items.length === 0 && (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
              <ShoppingBag size={48} className="mx-auto text-slate-600 mb-3" />
              <h4 className="text-base font-bold text-white">No matching products</h4>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Change the search or filters to see more of the catalog.</p>
            </div>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pagination">
              <p className="text-xs text-slate-400">
                Page {page} of {pages} · {total} products
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost px-3 py-2 text-xs border border-white/10 disabled:opacity-30" aria-label="Previous page">
                  <ChevronLeft size={15} /> Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-ghost px-3 py-2 text-xs border border-white/10 disabled:opacity-30" aria-label="Next page">
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </nav>
          )}
        </SmartLoadingWrapper>
      </div>

      <Sheet isOpen={!!sheet} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Update Product Specification' : 'Enroll New Product'}>
        {sheet && (
          <ProductForm
            key={`${sheet.mode}-${sheet.product?.id || 'new'}-${sheet.product?.version || 0}-${JSON.stringify(sheet.errors || {})}`}
            product={sheet.product}
            initial={sheet.initial}
            fieldErrors={sheet.errors}
            onSave={handleSave}
            onClose={() => setSheet(null)}
          />
        )}
      </Sheet>

      <Sheet isOpen={!!viewProduct} onClose={() => setViewProduct(null)} title="Product Inspection Record">
        {viewProduct && (
          <div className="space-y-6">
            <div className="relative h-44 rounded-2xl bg-gradient-to-br from-blue-900/40 to-slate-900 border border-white/10 flex items-center justify-center overflow-hidden group">
              <ProductImage product={viewProduct} size={64} />
            </div>
            <div>
              <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">{viewProduct.sku}</span>
              <h3 className="text-xl font-black text-white mt-2">{viewProduct.name}</h3>
              <p className="text-xs text-slate-400 mt-1">{catName(viewProduct.category)}</p>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">{viewProduct.description || 'No description yet.'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Unit Price', money(viewProduct.price), 'text-white'],
                ['Unit Cost', money(viewProduct.cost), 'text-slate-300'],
                ['Current Stock', `${viewProduct.stock} units`, 'text-emerald-400'],
                ['Units Ordered', `${viewProduct.sales ?? 0} units`, 'text-blue-400'],
              ].map(([label, value, color]) => (
                <div key={label} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-[10px] uppercase text-slate-400 block font-semibold">{label}</span>
                  <span className={`text-xl font-black ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => {
                    const p = viewProduct;
                    setViewProduct(null);
                    setSheet({ mode: 'edit', product: p });
                  }}
                  className="btn-primary flex-1 justify-center py-3 text-sm font-semibold"
                >
                  Modify Record
                </button>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Deletion" size="sm">
        <div className="text-center py-2">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle size={28} />
          </div>
          <h4 className="text-base font-bold text-white mb-1">Remove "{deleteModal?.name}"?</h4>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            The product leaves the catalog and can no longer be ordered. Existing orders keep their item names, SKUs and prices.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteModal(null)} className="btn-ghost flex-1 py-3 text-sm font-semibold justify-center">
              Cancel
            </button>
            <button onClick={handleDelete} className="btn-danger flex-1 py-3 text-sm font-bold justify-center shadow-lg shadow-rose-900/30">
              Delete Product
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductsPage;
