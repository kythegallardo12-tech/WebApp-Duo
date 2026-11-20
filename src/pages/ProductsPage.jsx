import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Eye, Package, LayoutGrid, List, Download, ChevronLeft, ChevronRight, Lock, AlertCircle } from 'lucide-react';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import { stockStatus, PAGE } from '../components/ui/status';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { useCurrency } from '../hooks/useCurrency';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Products catalog (server-backed CRUD)
 * - Search, filters, sorting and pagination run on the server; CSV export uses the same filters
 * - Optimistic updates: the change shows at once, marked "Saving…" until the API confirms it
 * - Sheets for editing and details; a modal only for the destructive delete confirmation
 */

const PAGE_SIZE = 12;

const ProductImage = ({ product, iconSize = 28 }) => {
  const [failed, setFailed] = useState(false);
  if (product.image && !failed) {
    return <img src={product.image} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />;
  }
  return <Package size={iconSize} strokeWidth={1.5} className="text-ink-3/60" aria-hidden="true" />;
};

const SavingBadge = () => <span className="badge badge-accent badge-plain">Saving…</span>;

const StatusBadge = ({ status }) => {
  const st = stockStatus[status] || stockStatus.active;
  return <span className={`badge ${st.badge}`}>{st.label}</span>;
};

const ProductCard = ({ product, pending, canWrite, canDelete, onEdit, onDelete, onView }) => {
  const { money } = useCurrency();
  const temp = product.id.startsWith('tmp-');
  const stockTone = product.stock === 0 ? 'text-danger font-medium' : product.stock <= product.minStock ? 'text-warning font-medium' : 'text-ink-2';
  return (
    <article className="card overflow-hidden flex flex-col" data-testid="product-card">
      <div className="relative h-36 bg-raised flex items-center justify-center overflow-hidden border-b border-line">
        <ProductImage product={product} />
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="rounded-full bg-canvas/85">
            <StatusBadge status={product.status} />
          </span>
          {pending && <SavingBadge />}
        </div>
      </div>
      <div className="p-4 flex-1">
        <h3 className="text-[0.9375rem] font-semibold text-ink leading-snug line-clamp-2">{product.name}</h3>
        <p className="font-mono text-xs text-ink-3 mt-1">{product.sku}</p>
        <div className="flex items-end justify-between gap-3 mt-4">
          <p className="text-lg font-semibold text-ink tabular tracking-tight">{money(product.price)}</p>
          <p className={`text-sm tabular ${stockTone}`}>{product.stock} in stock</p>
        </div>
        <p className="text-xs text-ink-3 mt-1">
          {product.sales ?? 0} {(product.sales ?? 0) === 1 ? 'unit' : 'units'} ordered
        </p>
      </div>
      <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-t border-line">
        <button type="button" onClick={() => onView(product)} className="icon-btn" aria-label={`View ${product.name}`} title="View details">
          <Eye size={16} />
        </button>
        {canWrite && (
          <button type="button" onClick={() => onEdit(product)} disabled={temp} className="icon-btn" aria-label={`Edit ${product.name}`} title="Edit">
            <Pencil size={16} />
          </button>
        )}
        {canDelete && (
          <button type="button" onClick={() => onDelete(product)} disabled={temp} className="icon-btn icon-btn-danger" aria-label={`Delete ${product.name}`} title="Delete">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </article>
  );
};

const Field = ({ id, label, error, children, hint }) => (
  <div>
    <label htmlFor={id} className="field-label">
      {label}
    </label>
    {children}
    {hint && !error && (
      <p className="field-hint" id={`${id}-hint`}>
        {hint}
      </p>
    )}
    {error && (
      <p className="field-error" id={`${id}-error`}>
        <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    )}
  </div>
);

const ProductForm = ({ product, initial, fieldErrors = {}, onSave, onClose }) => {
  const { symbol } = useCurrency();
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
    const first = Object.keys(e)[0];
    if (first) document.getElementById(first)?.focus();
    return !first;
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

  const input = (id, props) => ({
    id,
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
    ...props,
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field id="name" label="Name" error={errors.name}>
        <input {...input('name')} type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className="input" placeholder="e.g. Ergonomic keyboard" data-autofocus />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="category" label="Category" error={errors.category}>
          <select {...input('category')} value={form.category || categories[0]?.id || ''} onChange={(e) => set('category', e.target.value)} className="input">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sku" label="SKU" error={errors.sku} hint="Saved in upper case. Must be unique.">
          <input {...input('sku')} aria-describedby={errors.sku ? 'sku-error' : 'sku-hint'} type="text" value={form.sku} onChange={(e) => set('sku', e.target.value)} className="input font-mono" autoCapitalize="characters" spellCheck={false} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="price" label={`Price (${symbol})`} error={errors.price}>
          <input {...input('price')} type="number" step="0.01" min="0" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} className="input tabular" placeholder="0.00" />
        </Field>
        <Field id="cost" label={`Unit cost (${symbol})`} error={errors.cost}>
          <input {...input('cost')} type="number" step="0.01" min="0" inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} className="input tabular" placeholder="0.00" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isEdit ? (
          <div>
            <span className="field-label">Stock</span>
            <div className="input flex items-center gap-2 text-ink-2 bg-white/[0.04]" aria-describedby="stock-locked-hint">
              <Lock size={13} aria-hidden="true" /> {product.stock} units
            </div>
            <p className="field-hint" id="stock-locked-hint">
              Change stock on the Inventory screen so every change is recorded.
            </p>
          </div>
        ) : (
          <Field id="stock" label="Opening stock" error={errors.stock}>
            <input {...input('stock')} type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} className="input tabular" placeholder="0" />
          </Field>
        )}
        <Field id="minStock" label="Low-stock threshold" error={errors.minStock}>
          <input {...input('minStock')} type="number" min="0" step="1" inputMode="numeric" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="input tabular" placeholder="15" />
        </Field>
      </div>

      <Field id="image" label="Image URL (optional)" error={errors.image}>
        <input {...input('image')} type="url" value={form.image} onChange={(e) => set('image', e.target.value)} className="input" placeholder="https://…" />
      </Field>

      <Field id="description" label="Description (optional)" error={errors.description}>
        <textarea {...input('description')} value={form.description} onChange={(e) => set('description', e.target.value)} className="input" rows={3} placeholder="Materials, sizes, warranty…" />
      </Field>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-5 border-t border-line">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {isEdit ? 'Save changes' : 'Save product'}
        </button>
      </div>
    </form>
  );
};

const ProductsPage = () => {
  const { money } = useCurrency();
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
    if (searchInput.trim() === search) return undefined;
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

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
      .map((p) => (pending[p.id] && local.has(p.id) ? { ...p, ...local.get(p.id), sales: p.sales } : p));
    const temps = page === 1 ? storeProducts.filter((p) => p.id.startsWith('tmp-')) : [];
    return [...temps, ...rows];
  }, [data, storeProducts, pending, page]);

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const filtered = !!search || categoryFilter !== 'all' || statusFilter !== 'all';

  const handleSave = async (payload, rawForm) => {
    const current = sheet;
    setSheet(null); // optimistic: close at once, the item shows "Saving…"
    const result = current.mode === 'edit' ? await updateProduct(current.product.id, payload, current.product) : await createProduct(payload);
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
    if (product) deleteProduct(product.id, product);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const exportHref = api.exportCsvUrl({ q: search || undefined, category: categoryFilter, status: statusFilter, sort });
  const catName = (id) => categories.find((c) => c.id === id)?.name || '—';
  const openEdit = (p) => (canWrite ? setSheet({ mode: 'edit', product: p }) : setViewProduct(p));

  return (
    <>
      <Header title="Products" subtitle={`${total} ${total === 1 ? 'product' : 'products'}${refreshing ? ' · updating…' : ''}`} />

      <div className={PAGE}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="search flex-1 min-w-0 sm:max-w-md">
              <Search size={16} aria-hidden="true" />
              <input type="search" aria-label="Search products" placeholder="Search by name, SKU or keyword" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="input" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <div className="segmented" role="group" aria-label="Layout">
                <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} aria-label="Grid layout" title="Grid">
                  <LayoutGrid size={16} />
                </button>
                <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} aria-label="Table layout" title="Table">
                  <List size={16} />
                </button>
              </div>
              <a href={exportHref} download className="btn btn-secondary" data-testid="export-csv">
                <Download size={16} aria-hidden="true" />
                <span>Export CSV</span>
              </a>
              {canWrite && (
                <button type="button" onClick={() => setSheet({ mode: 'create' })} className="btn btn-primary ml-auto sm:ml-0">
                  <Plus size={17} aria-hidden="true" />
                  <span>Add product</span>
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="input sm:w-48">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <select aria-label="Filter by stock status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input sm:w-40">
              <option value="all">Any stock status</option>
              <option value="active">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
            <select aria-label="Sort products" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="input sm:w-44">
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="-name">Name Z–A</option>
              <option value="price">Price: low to high</option>
              <option value="-price">Price: high to low</option>
              <option value="stock">Stock: low to high</option>
              <option value="-stock">Stock: high to low</option>
              <option value="sku">SKU</option>
            </select>
          </div>
        </div>

        <SmartLoadingWrapper loadingState={loadingState} progress={progress} timeLeft={timeLeft} error={error} onRetry={refetch} skeletonType={viewMode === 'grid' ? 'grid' : 'table'} skeletonCount={8} message="Loading the product catalog…">
          {items.length === 0 ? (
            <div className="card text-center px-6 py-14">
              <span className="mx-auto mb-3 flex w-11 h-11 items-center justify-center rounded-full bg-raised text-ink-3">
                <Package size={22} aria-hidden="true" />
              </span>
              <h2 className="text-base font-semibold text-ink">{filtered ? 'No matching products' : 'No products yet'}</h2>
              <p className="text-sm text-ink-2 mt-1 max-w-sm mx-auto">
                {filtered ? 'Try a different search, or clear the filters to see the whole catalog.' : 'Add your first product to start tracking stock and taking orders.'}
              </p>
              {filtered ? (
                <button type="button" onClick={clearFilters} className="btn btn-secondary mt-5">
                  Clear filters
                </button>
              ) : (
                canWrite && (
                  <button type="button" onClick={() => setSheet({ mode: 'create' })} className="btn btn-primary mt-5">
                    <Plus size={17} aria-hidden="true" /> Add product
                  </button>
                )
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  pending={!!pending[prod.id]}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  onView={setViewProduct}
                  onEdit={openEdit}
                  onDelete={setDeleteModal}
                />
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="table-wrap">
                <table className="table min-w-[46rem]">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="text-right">Price</th>
                      <th scope="col" className="text-right">Stock</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((prod) => {
                      const temp = prod.id.startsWith('tmp-');
                      return (
                        <tr key={prod.id} data-testid="product-row">
                          <td>
                            <p className="font-medium text-ink flex items-center gap-2">
                              {prod.name} {pending[prod.id] && <SavingBadge />}
                            </p>
                            <p className="font-mono text-xs text-ink-3">{prod.sku}</p>
                          </td>
                          <td className="text-ink-2">{catName(prod.category)}</td>
                          <td className="text-right font-medium text-ink tabular">{money(prod.price)}</td>
                          <td className="text-right text-ink-2 tabular">{prod.stock}</td>
                          <td>
                            <StatusBadge status={prod.status} />
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-0.5">
                              <button type="button" onClick={() => setViewProduct(prod)} className="icon-btn" aria-label={`View ${prod.name}`} title="View details">
                                <Eye size={16} />
                              </button>
                              {canWrite && (
                                <button type="button" onClick={() => setSheet({ mode: 'edit', product: prod })} disabled={temp} className="icon-btn" aria-label={`Edit ${prod.name}`} title="Edit">
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canDelete && (
                                <button type="button" onClick={() => setDeleteModal(prod)} disabled={temp} className="icon-btn icon-btn-danger" aria-label={`Delete ${prod.name}`} title="Delete">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-1" aria-label="Pagination">
              <p className="text-sm text-ink-3 tabular">
                Page {page} of {pages} · {total} products
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary btn-sm" aria-label="Previous page">
                  <ChevronLeft size={15} aria-hidden="true" /> Previous
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn btn-secondary btn-sm" aria-label="Next page">
                  Next <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            </nav>
          )}
        </SmartLoadingWrapper>
      </div>

      <Sheet isOpen={!!sheet} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit product' : 'New product'}>
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

      <Sheet isOpen={!!viewProduct} onClose={() => setViewProduct(null)} title="Product details">
        {viewProduct && (
          <div className="space-y-6">
            <div className="relative h-44 rounded-xl bg-raised border border-line flex items-center justify-center overflow-hidden">
              <ProductImage product={viewProduct} iconSize={40} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-ink-2 bg-raised border border-line rounded-md px-2 py-0.5">{viewProduct.sku}</span>
                <StatusBadge status={viewProduct.status} />
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-ink mt-3">{viewProduct.name}</h3>
              <p className="text-sm text-ink-3 mt-0.5">{catName(viewProduct.category)}</p>
              <p className="text-sm text-ink-2 mt-3 leading-relaxed">{viewProduct.description || 'No description yet.'}</p>
            </div>
            <dl className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-line bg-line">
              {[
                ['Price', money(viewProduct.price)],
                ['Unit cost', money(viewProduct.cost)],
                ['In stock', `${viewProduct.stock} units`],
                ['Units ordered', `${viewProduct.sales ?? 0} units`],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface p-4">
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="text-lg font-semibold text-ink tabular mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
            {canWrite && (
              <div className="pt-5 border-t border-line flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const p = viewProduct;
                    setViewProduct(null);
                    setSheet({ mode: 'edit', product: p });
                  }}
                  className="btn btn-primary"
                >
                  <Pencil size={15} aria-hidden="true" /> Edit product
                </button>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={`Delete “${deleteModal?.name ?? ''}”?`}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setDeleteModal(null)} className="btn btn-secondary" data-autofocus>
              Cancel
            </button>
            <button type="button" onClick={handleDelete} className="btn btn-danger">
              Delete product
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-2 leading-relaxed">
          The product leaves the catalog and can no longer be ordered. Existing orders keep their item names, SKUs and prices.
        </p>
      </Modal>
    </>
  );
};

export default ProductsPage;
