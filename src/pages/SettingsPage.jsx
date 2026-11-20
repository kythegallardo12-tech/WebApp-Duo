import { useState, useCallback } from 'react';
import { Check, Minus, UserPlus, AlertCircle, Info } from 'lucide-react';
import Header from '../components/layout/Header';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Settings
 * 1. Preferences (this browser only — interface choices, no business data)
 * 2. Business settings (MongoDB; admins edit, staff read)
 * 3. Team (admins manage accounts) and the role matrix shown to everyone
 * 4. Data tools: explicit import of data saved by the old browser-only version, and a
 *    development-only reset to sample data
 */

const LEGACY_KEYS = ['stockflow-storage', 'webapp-duo-workspace-v1'];
const importedFlag = (key) => `stockflow-legacy-imported:${key}`;

const ROLE_MATRIX = [
  ['View dashboard, products, inventory and orders', true, true],
  ['Create and edit products', true, true],
  ['Adjust stock', true, true],
  ['Create, advance and cancel orders', true, true],
  ['Delete products', false, true],
  ['Manage users', false, true],
  ['Edit business settings', false, true],
  ['Import browser data, reset sample data', false, true],
];

function readLegacy() {
  const found = [];
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const root = parsed?.state ?? parsed?.data ?? parsed?.workspace ?? parsed;
      const products = Array.isArray(root?.products) ? root.products.length : 0;
      const orders = Array.isArray(root?.orders) ? root.orders.length : 0;
      if (products || orders) found.push({ key, raw, products, orders, imported: localStorage.getItem(importedFlag(key)) === '1' });
    } catch {
      /* unreadable entries are ignored */
    }
  }
  return found;
}

/** A settings group: heading and description above, content in a card. */
const Section = ({ id, title, description, action, children, flush = false }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description && <p className="text-sm text-ink-3 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    <div className={`card ${flush ? 'overflow-hidden' : 'p-5'}`}>{children}</div>
  </section>
);

const BusinessSettings = ({ canEdit }) => {
  const settings = useStore((s) => s.settings);
  const loadSettings = useStore((s) => s.loadSettings);
  const saveSettings = useStore((s) => s.saveSettings);
  const fetchSettings = useCallback(() => loadSettings(), [loadSettings]);
  const { loadingState, error, refetch } = useSmartLoader(fetchSettings, []);
  const [draft, setDraft] = useState(null); // { version, values }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // Edits are kept per settings version; a newer server version resets the form.
  const form = settings
    ? draft && draft.version === settings.version
      ? draft.values
      : { businessName: settings.businessName, currency: settings.currency, defaultMinStock: settings.defaultMinStock, lowStockAlerts: settings.lowStockAlerts }
    : null;
  const setForm = (values) => setDraft({ version: settings.version, values });

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.businessName.trim()) return setFormError('Business name is required.');
    if (!/^[A-Za-z]{3}$/.test(form.currency)) return setFormError('Currency must be a 3-letter code like USD.');
    if (!Number.isInteger(Number(form.defaultMinStock)) || Number(form.defaultMinStock) < 0) return setFormError('Default threshold must be a whole number of 0 or more.');
    setSaving(true);
    const res = await saveSettings({ ...form, businessName: form.businessName.trim(), defaultMinStock: Number(form.defaultMinStock) });
    setSaving(false);
    if (!res.ok) setFormError(res.error?.code === 'STALE_VERSION' ? 'Someone else saved settings first. Their values are now shown.' : res.error?.message);
  };

  return (
    <Section id="settings-business" title="Business" description={canEdit ? 'Shared by everyone in this workspace.' : 'Only admins can change these.'}>
      <SmartLoadingWrapper loadingState={settings ? 'done' : loadingState} error={error} onRetry={refetch} skeletonType="card" skeletonCount={1}>
        {form && (
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5" noValidate aria-busy={saving}>
            <fieldset disabled={!canEdit || saving} className="contents">
              <div className="sm:col-span-2">
                <label htmlFor="biz-name" className="field-label">
                  Business name
                </label>
                <input id="biz-name" className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} maxLength={80} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="biz-currency" className="field-label">
                  Currency code
                </label>
                <input id="biz-currency" className="input uppercase" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} aria-describedby="biz-currency-hint" spellCheck={false} />
                <p id="biz-currency-hint" className="field-hint">
                  Changes how amounts are labelled. Existing amounts are not converted.
                </p>
              </div>
              <div>
                <label htmlFor="biz-min" className="field-label">
                  Default low-stock threshold
                </label>
                <input id="biz-min" type="number" min="0" step="1" inputMode="numeric" className="input tabular" value={form.defaultMinStock} onChange={(e) => setForm({ ...form, defaultMinStock: e.target.value })} />
                <p className="field-hint">Used for new products.</p>
              </div>
              <label className="sm:col-span-2 flex items-center gap-3 text-sm text-ink cursor-pointer">
                <input type="checkbox" className="checkbox" checked={form.lowStockAlerts} onChange={(e) => setForm({ ...form, lowStockAlerts: e.target.checked })} />
                Show low-stock alerts on the inventory page
              </label>
            </fieldset>
            {formError && (
              <p className="sm:col-span-2 field-error mt-0" role="alert">
                <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}
            {canEdit && (
              <div className="sm:col-span-2 flex justify-end pt-4 border-t border-line">
                <button type="submit" disabled={saving} aria-busy={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            )}
          </form>
        )}
      </SmartLoadingWrapper>
    </Section>
  );
};

const emptyUser = () => ({ name: '', email: '', role: 'staff', password: '' });

const TeamManager = () => {
  const me = useAuth((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const fetchUsers = useCallback(() => api.users(), []);
  const { data, setData, loadingState, error, refetch } = useSmartLoader(fetchUsers, []);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState(emptyUser);
  const [formError, setFormError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);

  const update = async (user, patch) => {
    setBusy(user.id);
    try {
      const { user: saved } = await api.updateUser(user.id, patch);
      setData((d) => ({ items: d.items.map((u) => (u.id === saved.id ? saved : u)) }));
      addToast({ type: 'success', title: 'User updated', message: `${saved.name} is now ${saved.active ? saved.role : 'deactivated'}.` });
    } catch (err) {
      addToast({ type: 'error', title: 'User not updated', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (creating) return;
    setFormError(null);
    setCreating(true);
    try {
      const { user } = await api.createUser(form);
      setData((d) => ({ items: [...(d?.items || []), user] }));
      setSheet(false);
      setForm(emptyUser());
      addToast({ type: 'success', title: 'User created', message: `${user.name} can now sign in.` });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Section
      id="settings-team"
      title="Team"
      description="Accounts are created here by an admin. There is no public sign-up."
      flush
      action={
        <button type="button" onClick={() => setSheet(true)} className="btn btn-secondary btn-sm shrink-0">
          <UserPlus size={15} aria-hidden="true" /> Add user
        </button>
      }
    >
      <SmartLoadingWrapper loadingState={loadingState} error={error} onRetry={refetch} skeletonType="table" skeletonCount={3}>
        <div className="table-wrap">
          <table className="table min-w-[38rem]">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <p className="font-medium text-ink">
                        {u.name}
                        {self && <span className="text-ink-3 font-normal"> (you)</span>}
                      </p>
                      <p className="text-xs text-ink-3">{u.email}</p>
                    </td>
                    <td>
                      <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self || busy === u.id} onChange={(e) => update(u, { role: e.target.value })} className="input h-9 w-28 text-[0.8125rem]">
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${u.active ? 'badge-success' : ''}`}>{u.active ? 'Active' : 'Deactivated'}</span>
                        {!self && (
                          <button type="button" disabled={busy === u.id} onClick={() => update(u, { active: !u.active })} className="btn btn-ghost btn-sm" aria-label={`${u.active ? 'Deactivate' : 'Reactivate'} ${u.name}`}>
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-ink-2 whitespace-nowrap">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SmartLoadingWrapper>

      <Sheet isOpen={sheet} onClose={() => setSheet(false)} title="Add a team member" width="28rem">
        <form onSubmit={create} className="space-y-5" noValidate aria-busy={creating}>
          {[
            ['name', 'Full name', 'text', 'off'],
            ['email', 'Email', 'email', 'off'],
            ['password', 'Temporary password', 'password', 'new-password'],
          ].map(([k, label, type, autoComplete], i) => (
            <div key={k}>
              <label htmlFor={`user-${k}`} className="field-label">
                {label}
              </label>
              <input
                id={`user-${k}`}
                type={type}
                autoComplete={autoComplete}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="input"
                aria-describedby={k === 'password' ? 'user-password-hint' : undefined}
                {...(i === 0 ? { 'data-autofocus': true } : {})}
              />
              {k === 'password' && (
                <p id="user-password-hint" className="field-hint">
                  At least 10 characters. Share it privately; they can sign in with it straight away.
                </p>
              )}
            </div>
          ))}
          <div>
            <label htmlFor="user-role" className="field-label">
              Role
            </label>
            <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
              <option value="staff">Staff — products, stock and orders</option>
              <option value="admin">Admin — everything, including users and settings</option>
            </select>
          </div>
          {formError && (
            <div className="banner banner-danger" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-5 border-t border-line">
            <button type="button" onClick={() => setSheet(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={creating} aria-busy={creating} className="btn btn-primary">
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </Sheet>
    </Section>
  );
};

const DataTools = ({ canImport, canReset }) => {
  const addToast = useStore((s) => s.addToast);
  const [legacy, setLegacy] = useState(() => readLegacy());
  const [busy, setBusy] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

  const refreshAll = () => {
    const s = useStore.getState();
    s.loadProducts().catch(() => {});
    s.loadOrders().catch(() => {});
    s.loadCategories().catch(() => {});
    s.loadSettings().catch(() => {});
    useStore.setState((st) => ({ dataVersion: st.dataVersion + 1 }));
  };

  const runImport = async (entry) => {
    setBusy(entry.key);
    try {
      const { counts } = await api.importLegacy(entry.key, entry.raw);
      // Keep the local copy until the user removes it; only remember that it was imported.
      localStorage.setItem(importedFlag(entry.key), '1');
      setLegacy(readLegacy());
      refreshAll();
      addToast({ type: 'success', title: 'Browser data imported', message: `${counts.products} products and ${counts.orders} orders added (${counts.skippedProducts + counts.skippedOrders} already existed).` });
    } catch (err) {
      if (err.code === 'ALREADY_IMPORTED') {
        localStorage.setItem(importedFlag(entry.key), '1');
        setLegacy(readLegacy());
      }
      addToast({ type: 'error', title: 'Import failed', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const removeLocal = (entry) => {
    localStorage.removeItem(entry.key);
    localStorage.removeItem(importedFlag(entry.key));
    setLegacy(readLegacy());
  };

  const runReset = async () => {
    setResetOpen(false);
    setBusy('reset');
    try {
      const { counts } = await api.devReset();
      refreshAll();
      addToast({ type: 'success', title: 'Sample data restored', message: `${counts.products} products and ${counts.orders} orders loaded.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Reset failed', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  if (!canImport && !canReset) return null;

  return (
    <Section id="settings-data" title="Data tools" description="Nothing here runs automatically." flush>
      <div className="divide-y divide-line">
        {canImport && (
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-ink">Import data saved in this browser</h3>
            {legacy.length === 0 ? (
              <p className="text-sm text-ink-3">No data from the earlier browser-only version was found in this browser.</p>
            ) : (
              legacy.map((entry) => (
                <div key={entry.key} className="rounded-xl bg-raised border border-line p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-mono text-ink">{entry.key}</p>
                    <p className="text-xs text-ink-3">
                      {entry.products} products · {entry.orders} orders{entry.imported ? ' · already imported' : ''}
                    </p>
                  </div>
                  {!entry.imported ? (
                    <button type="button" onClick={() => runImport(entry)} disabled={!!busy} aria-busy={busy === entry.key} className="btn btn-primary btn-sm">
                      {busy === entry.key ? 'Importing…' : 'Import to database'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => removeLocal(entry)} className="btn btn-secondary btn-sm">
                      Remove local copy
                    </button>
                  )}
                </div>
              ))
            )}
            <p className="text-xs text-ink-3 flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Products are matched by SKU and orders by their old id, so nothing is duplicated. Imported stock is the opening balance; imported orders do not deduct stock again. The local copy stays until you remove it.
            </p>
          </div>
        )}

        {canReset && (
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                Reset to sample data <span className="badge badge-warning badge-plain">Development only</span>
              </h3>
              <p className="text-sm text-ink-3 mt-1">Deletes all products, orders and stock history, then loads the sample catalog. User accounts are kept.</p>
            </div>
            <button type="button" onClick={() => setResetOpen(true)} disabled={!!busy} className="btn btn-secondary btn-sm text-danger shrink-0">
              {busy === 'reset' ? 'Resetting…' : 'Reset workspace data'}
            </button>
          </div>
        )}
      </div>

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all business data?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setResetOpen(false)} className="btn btn-secondary" data-autofocus>
              Keep data
            </button>
            <button type="button" onClick={runReset} className="btn btn-danger">
              Reset
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Every product, order and stock movement will be deleted and replaced with sample data. This cannot be undone.</p>
      </Modal>
    </Section>
  );
};

const SettingsPage = () => {
  const can = useAuth((s) => s.can);
  const features = useAuth((s) => s.features);
  const user = useAuth((s) => s.user);
  const productView = useStore((s) => s.productView);
  const setProductView = useStore((s) => s.setProductView);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <>
      <Header title="Settings" subtitle="Preferences, business details and team access" />

      <div className="mx-auto w-full max-w-[52rem] px-4 sm:px-6 lg:px-8 py-6 space-y-10">
        <Section id="settings-prefs" title="Preferences" description="Saved in this browser only.">
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span id="pref-layout" className="text-sm text-ink">
                Product layout
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="pref-layout">
                {[
                  ['grid', 'Grid'],
                  ['list', 'Table'],
                ].map(([v, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={productView === v} onClick={() => setProductView(v)} className="min-w-[5rem]">
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="hidden lg:flex items-center justify-between gap-3 pt-5 border-t border-line text-sm text-ink cursor-pointer">
              Show sidebar labels
              <input type="checkbox" className="checkbox" checked={sidebarOpen} onChange={toggleSidebar} />
            </label>
          </div>
        </Section>

        <BusinessSettings canEdit={can('settings:write')} />

        {can('users:manage') && <TeamManager />}

        <Section
          id="settings-roles"
          title="Roles and permissions"
          description={
            <>
              You are signed in as <strong className="font-medium text-ink capitalize">{user?.role}</strong>. The server enforces these rules.
            </>
          }
          flush
        >
          <div className="table-wrap">
            <table className="table min-w-[30rem]" data-testid="role-matrix">
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col" className="text-center w-24">
                    Staff
                  </th>
                  <th scope="col" className="text-center w-24">
                    Admin
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLE_MATRIX.map(([label, staff, admin]) => (
                  <tr key={label}>
                    <td className="text-ink-2">{label}</td>
                    {[staff, admin].map((ok, i) => (
                      <td key={i} className="text-center">
                        {ok ? (
                          <Check size={16} className="inline text-success" aria-label="Allowed" />
                        ) : (
                          <Minus size={16} className="inline text-ink-3" aria-label="Not allowed" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <DataTools canImport={can('data:import')} canReset={can('data:reset') && !!features?.devReset} />
      </div>
    </>
  );
};

export default SettingsPage;
