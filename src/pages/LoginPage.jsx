import { useEffect, useRef, useState } from 'react';
import { Boxes, LogIn, AlertCircle, Info, Lock, Mail } from 'lucide-react';
import gsap from 'gsap';
import ShinyText from '../components/reactbits/ShinyText';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import useAuth from '../store/useAuth';

/**
 * Sign-in screen in the same navy glass style as the workspace.
 * There is no public sign-up: accounts are created by an admin
 * (the first admin via `npm run create-admin`).
 */
const LoginPage = () => {
  const login = useAuth((s) => s.login);
  const notice = useAuth((s) => s.notice);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(cardRef.current, { opacity: 0, y: 16, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' });
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-[var(--color-bg-primary)] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute bottom-0 -left-20 w-80 h-80 rounded-full bg-indigo-600/10 blur-[100px]" />
      </div>

      <main ref={cardRef} className="relative w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Boxes size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">StockFlow</h1>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest">Inventory Pro</p>
          </div>
        </div>

        <SpotlightCard className="p-8 border-blue-500/20">
          <h2 className="text-lg font-bold text-white mb-1">
            Sign in to <ShinyText text="your workspace" speed={4} />
          </h2>
          <p className="text-xs text-slate-400 mb-6">Use the account your administrator created for you.</p>

          {notice && !error && (
            <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2" role="status">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2" role="alert">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-slate-500" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input pl-10 text-sm h-11"
                  placeholder="you@business.com"
                  required
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-slate-500" aria-hidden="true" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input pl-10 text-sm h-11"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="btn-primary w-full justify-center py-3 text-sm font-bold shadow-lg shadow-blue-600/30 disabled:opacity-50"
            >
              <LogIn size={16} />
              <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
            </button>
          </form>
        </SpotlightCard>
        <p className="text-center text-[11px] text-slate-500 mt-4">No account? Ask your workspace administrator.</p>
      </main>
    </div>
  );
};

export default LoginPage;
