import { useState, useCallback } from 'react';
import { Database, ShieldCheck, CheckCircle2, Users, UploadCloud, RotateCcw, Sliders, Building2, UserPlus, Info } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import Modal from '../components/ui/Modal';
import Sheet from '../components/ui/Sheet';
import Header from '../components/layout/Header';
import SmartLoadingWrapper from '../components/ui/SmartLoadingWrapper';
import { useSmartLoader } from '../hooks/useSmartLoader';
import { api } from '../api/client';
import useStore from '../store/useStore';
import useAuth from '../store/useAuth';

/**
 * Settings
 * 1. Workspace preferences (stored in this browser only — interface choices, no business data)
 * 2. Business settings (MongoDB; admins edit, staff read)
 * 3. Team & access (admins manage accounts; role matrix shown to everyone)
 * 4. Data tools: explicit import of data saved by the old browser-only version,
 *    and a development-only reset to sample data
 * 5. UX laws audit
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
  ['Import browser data / reset sample data', false, true],
];

const uxLawsData = [
  {
    name: "Peak-End Rule",
    concept: "Users judge experience largely at its peak and its final conclusion.",
    implementation: "Highlight top metric spikes, celebrate order fulfilment with positive visual toasts.",
    status: "Compliant",
  },
  {
    name: "Miller's Law",
    concept: "Working memory holds roughly 7 ± 2 discrete chunks of information.",
    implementation: "Top-level navigation limited to 6 items; category taxonomy capped to 7 clean divisions.",
    status: "Compliant",
  },
  {
    name: "Hick's Law",
    concept: "Time to make a decision increases logarithmically with number of choices.",
    implementation: "Categorical filtering strictly streamlined; default sensible presets provided.",
    status: "Compliant",
  },
  {
    name: "Fitts' Law",
    concept: "Target acquisition speed is a function of target distance and dimension.",
    implementation: "Primary action buttons and quick stock adjustment controls sized with 44px+ hit targets.",
    status: "Compliant",
  },
  {
    name: "Law of Similarity",
    concept: "Elements sharing visual characteristics are perceived to belong together.",
    implementation: "Consistent glassmorphic card elevation, typography scales, and status badge chromatic hierarchy.",
    status: "Compliant",
  },
  {
    name: "Jakob's Law",
    concept: "Users expect your system to work like all the other systems they know.",
    implementation: "Standard left-docked collapsible sidebar, top global search header, and predictable data tables.",
    status: "Compliant",
  },
  {
    name: "Aesthetic-Usability Effect",
    concept: "Users perceive more attractive design as substantially easier to operate.",
    implementation: "Deep navy glassmorphism, GSAP micro-animations, and React Bits spotlight reflections.",
    status: "Compliant",
  },
  {
    name: "Occam's Razor",
    concept: "Entities should not be multiplied beyond operational necessity.",
    implementation: "Forms omit redundant secondary telemetry; sheets reveal contextual details on demand.",
    status: "Compliant",
  },
  {
    name: "Modal vs. Sheet Heuristic",
    concept: "Modals interrupt for critical binary decisions; Sheets expand for deep multi-step editing.",
    implementation: "Delete confirmations strictly in centered Modals; edit forms cleanly docked in side Sheets.",
    status: "Compliant",
  },
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
    <GlassCard className="p-6 border-white/10">
      <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
        <Building2 size={18} className="text-blue-400" /> Business Settings
      </h3>
      <p className="text-xs text-slate-400 mb-5">{canEdit ? 'Shared by everyone in this workspace.' : 'Only admins can change these.'}</p>
      <SmartLoadingWrapper loadingState={settings ? 'done' : loadingState} error={error} onRetry={refetch} skeletonType="card" skeletonCount={1}>
        {form && (
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
            <fieldset disabled={!canEdit || saving} className="contents">
              <div className="sm:col-span-2">
                <label htmlFor="biz-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Business name</label>
                <input id="biz-name" className="glass-input text-sm" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label htmlFor="biz-currency" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Currency code</label>
                <input id="biz-currency" className="glass-input text-sm uppercase" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
              </div>
              <div>
                <label htmlFor="biz-min" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Default low-stock threshold</label>
                <input id="biz-min" type="number" min="0" step="1" className="glass-input text-sm" value={form.defaultMinStock} onChange={(e) => setForm({ ...form, defaultMinStock: e.target.value })} />
              </div>
              <label className="sm:col-span-2 flex items-center gap-3 text-sm text-slate-300">
                <input type="checkbox" checked={form.lowStockAlerts} onChange={(e) => setForm({ ...form, lowStockAlerts: e.target.checked })} className="w-4 h-4 accent-blue-500" />
                Show low-stock alerts on the inventory page
              </label>
            </fieldset>
            {formError && <p className="sm:col-span-2 text-xs text-rose-400" role="alert">{formError}</p>}
            {canEdit && (
              <div className="sm:col-span-2">
                <button type="submit" disabled={saving} className="btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            )}
          </form>
        )}
      </SmartLoadingWrapper>
    </GlassCard>
  );
};

const TeamManager = () => {
  const me = useAuth((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const fetchUsers = useCallback(() => api.users(), []);
  const { data, setData, loadingState, error, refetch } = useSmartLoader(fetchUsers, []);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', password: '' });
  const [formError, setFormError] = useState(null);
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
    setFormError(null);
    try {
      const { user } = await api.createUser(form);
      setData((d) => ({ items: [...(d?.items || []), user] }));
      setSheet(false);
      setForm({ name: '', email: '', role: 'staff', password: '' });
      addToast({ type: 'success', title: 'User created', message: `${user.name} can now sign in.` });
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2"><Users size={18} className="text-blue-400" /> Team</h3>
          <p className="text-xs text-slate-400 mt-0.5">Accounts are created here by an admin. There is no public sign-up.</p>
        </div>
        <button onClick={() => setSheet(true)} className="btn-primary px-4 py-2.5 text-sm font-semibold"><UserPlus size={16} /> Add user</button>
      </div>
      <SmartLoadingWrapper loadingState={loadingState} error={error} onRetry={refetch} skeletonType="table" skeletonCount={3}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-6 py-3 font-semibold">User</th>
                <th className="px-6 py-3 font-semibold">Role</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {(data?.items || []).map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="px-6 py-3"><p className="font-semibold text-white">{u.name}{self && <span className="text-xs text-slate-500"> (you)</span>}</p><p className="text-xs text-slate-400">{u.email}</p></td>
                    <td className="px-6 py-3">
                      <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self || busy === u.id} onChange={(e) => update(u, { role: e.target.value })} className="glass-input text-xs h-9 w-28">
                        <option value="staff" className="bg-slate-900">Staff</option>
                        <option value="admin" className="bg-slate-900">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <button disabled={self || busy === u.id} onClick={() => update(u, { active: !u.active })} className={`text-[11px] px-2.5 py-1 rounded-full font-bold border ${u.active ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-white/10'} disabled:opacity-60`}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SmartLoadingWrapper>

      <Sheet isOpen={sheet} onClose={() => setSheet(false)} title="Add a team member">
        <form onSubmit={create} className="space-y-4" noValidate>
          {[['name', 'Full name', 'text'], ['email', 'Email', 'email'], ['password', 'Temporary password (min 10 characters)', 'password']].map(([k, label, type]) => (
            <div key={k}>
              <label htmlFor={`user-${k}`} className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">{label}</label>
              <input id={`user-${k}`} type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="glass-input text-sm" />
            </div>
          ))}
          <div>
            <label htmlFor="user-role" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Role</label>
            <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="glass-input text-sm">
              <option value="staff" className="bg-slate-900">Staff — products, stock and orders</option>
              <option value="admin" className="bg-slate-900">Admin — everything, including users and settings</option>
            </select>
          </div>
          {formError && <p className="text-xs text-rose-400" role="alert">{formError}</p>}
          <button type="submit" className="btn-primary w-full justify-center py-3 text-sm font-bold">Create account</button>
        </form>
      </Sheet>
    </GlassCard>
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
    <GlassCard className="p-6 border-white/10 space-y-5">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2"><Database size={18} className="text-blue-400" /> Data tools</h3>
        <p className="text-xs text-slate-400 mt-0.5">Nothing here runs automatically.</p>
      </div>

      {canImport && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2"><UploadCloud size={15} /> Import data saved in this browser</h4>
          {legacy.length === 0 ? (
            <p className="text-xs text-slate-400">No data from the earlier browser-only version was found in this browser.</p>
          ) : (
            legacy.map((entry) => (
              <div key={entry.key} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white font-mono">{entry.key}</p>
                  <p className="text-xs text-slate-400">{entry.products} products · {entry.orders} orders{entry.imported ? ' · already imported' : ''}</p>
                </div>
                <div className="flex gap-2">
                  {!entry.imported && (
                    <button onClick={() => runImport(entry)} disabled={!!busy} className="btn-primary px-4 py-2 text-xs font-semibold disabled:opacity-60">
                      {busy === entry.key ? 'Importing…' : 'Import to database'}
                    </button>
                  )}
                  {entry.imported && (
                    <button onClick={() => removeLocal(entry)} className="btn-ghost px-4 py-2 text-xs border border-white/10">Remove local copy</button>
                  )}
                </div>
              </div>
            ))
          )}
          <p className="text-[11px] text-slate-500 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-shrink-0" />Products are matched by SKU and orders by their old id, so nothing is duplicated. Imported stock is the opening balance; imported orders do not deduct stock again. The local copy stays until you remove it.</p>
        </div>
      )}

      {canReset && (
        <div className="pt-4 border-t border-white/5 space-y-2">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2"><RotateCcw size={15} /> Reset to sample data <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">development only</span></h4>
          <p className="text-xs text-slate-400">Deletes all products, orders and stock history, then loads the sample catalog. User accounts are kept.</p>
          <button onClick={() => setResetOpen(true)} disabled={!!busy} className="btn-danger px-4 py-2 text-xs font-semibold disabled:opacity-60">{busy === 'reset' ? 'Resetting…' : 'Reset workspace data'}</button>
        </div>
      )}

      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title="Reset all business data?" size="sm">
        <p className="text-sm text-slate-300 mb-6">Every product, order and stock movement will be deleted and replaced with sample data. This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={() => setResetOpen(false)} className="btn-ghost flex-1 justify-center py-2.5 text-sm">Keep data</button>
          <button onClick={runReset} className="btn-danger flex-1 justify-center py-2.5 text-sm font-bold">Reset</button>
        </div>
      </Modal>
    </GlassCard>
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
    <div>
      <Header title="Settings" subtitle="Workspace preferences, business settings and team access" />

      <div className="p-4 sm:p-6 space-y-8">
        <SpotlightCard className="border-blue-500/30 p-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1"><Sliders size={18} className="text-blue-400" /> Workspace preferences</h3>
          <p className="text-xs text-slate-400 mb-5">Saved in this browser only. These never include business data.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">Default product layout</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Default product layout">
                {['grid', 'list'].map((v) => (
                  <button key={v} role="radio" aria-checked={productView === v} onClick={() => setProductView(v)} className={`flex-1 py-2 rounded-xl text-xs font-bold border capitalize ${productView === v ? 'bg-blue-600 border-blue-400 text-white' : 'border-white/10 text-slate-400'}`}>
                    {v === 'list' ? 'Table' : 'Grid'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-300 sm:mt-6">
              <input type="checkbox" checked={sidebarOpen} onChange={toggleSidebar} className="w-4 h-4 accent-blue-500" />
              Expanded sidebar on large screens
            </label>
          </div>
        </SpotlightCard>

        <BusinessSettings canEdit={can('settings:write')} />

        {can('users:manage') && <TeamManager />}

        <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-400" /> Roles & permissions</h3>
            <p className="text-xs text-slate-400 mt-0.5">You are signed in as <strong className="text-white">{user?.role}</strong>. These rules are enforced by the server.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="role-matrix">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-semibold">Capability</th>
                  <th className="px-6 py-3 font-semibold text-center">Staff</th>
                  <th className="px-6 py-3 font-semibold text-center">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {ROLE_MATRIX.map(([label, staff, admin]) => (
                  <tr key={label}>
                    <td className="px-6 py-3 text-slate-300">{label}</td>
                    <td className="px-6 py-3 text-center">{staff ? <CheckCircle2 size={15} className="inline text-emerald-400" aria-label="Allowed" /> : <span className="text-slate-600" aria-label="Not allowed">—</span>}</td>
                    <td className="px-6 py-3 text-center">{admin ? <CheckCircle2 size={15} className="inline text-emerald-400" aria-label="Allowed" /> : <span className="text-slate-600" aria-label="Not allowed">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <DataTools canImport={can('data:import')} canReset={can('data:reset') && !!features?.devReset} />

        <GlassCard padding="p-0" className="border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10 bg-white/[0.02]">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-400" /> UX Laws & Human Factors</h3>
            <p className="text-xs text-slate-400 mt-0.5">How the interface applies each design heuristic</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.01] text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3.5 font-semibold">Heuristic</th>
                  <th className="px-6 py-3.5 font-semibold">Principle</th>
                  <th className="px-6 py-3.5 font-semibold">Implementation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {uxLawsData.map((law) => (
                  <tr key={law.name} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white whitespace-nowrap">{law.name}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 max-w-xs">{law.concept}</td>
                    <td className="px-6 py-4 text-xs text-slate-300 max-w-sm">{law.implementation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default SettingsPage;
