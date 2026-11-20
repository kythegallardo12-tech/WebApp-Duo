import { useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AlertCircle, Info, ArrowLeft } from 'lucide-react';
import Wordmark from '../components/brand/Wordmark';
import ServerUnavailable from '../components/ServerUnavailable';
import useAuth from '../store/useAuth';
import { ROUTES, postSignInPath } from '../lib/routes';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Plain-language message for a failed sign-in request. */
function signInErrorMessage(err) {
  if (err?.kind === 'network') return 'Can’t reach the StockFlow server. Check your connection and try again.';
  if (err?.kind === 'server') return 'The server could not sign you in right now. Try again in a moment.';
  return err?.message || 'Sign-in failed. Try again.';
}

/**
 * Sign-in. Accounts are created by an admin, so there is no sign-up or password-reset link here.
 * Validation runs on submit and names each problem under its own field; the button is never
 * disabled for empty fields, only while a request is in flight (which also blocks double submits).
 */
const SignInPage = () => {
  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);
  const notice = useAuth((s) => s.notice);
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  if (status === 'signedIn') return <Navigate to={postSignInPath(location.state?.from)} replace />;
  if (status === 'offline') return <ServerUnavailable />;
  if (status === 'checking' && !submitting) return <div className="min-h-dvh bg-canvas" aria-busy="true" />;

  const validate = () => {
    const errs = {};
    const trimmed = email.trim();
    if (!trimmed) errs.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(trimmed)) errs.email = 'Enter a valid email address, like name@company.com.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    if (errs.email) emailRef.current?.focus();
    else if (errs.password) passwordRef.current?.focus();
    return !errs.email && !errs.password;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (!validate()) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // On success the session status changes and <Navigate> above takes over.
    } catch (err) {
      setError(signInErrorMessage(err));
      setSubmitting(false);
      passwordRef.current?.select();
    } finally {
      inFlight.current = false;
    }
  };

  const fieldProps = (name) => ({
    'aria-invalid': fieldErrors[name] ? true : undefined,
    'aria-describedby': fieldErrors[name] ? `signin-${name}-error` : undefined,
  });

  return (
    <div className="min-h-dvh flex flex-col bg-canvas">
      <header className="flex items-center justify-between h-16 px-5 sm:px-8">
        <Link to={ROUTES.home} className="text-xl rounded-md" aria-label="StockFlow home">
          <Wordmark />
        </Link>
        <Link to={ROUTES.home} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} aria-hidden="true" /> Home
        </Link>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-5 pt-6 pb-16">
        <div className="w-full max-w-[23rem]">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] leading-tight text-ink">Sign in to StockFlow</h1>
          <p className="text-[0.9375rem] text-ink-2 mt-2">Use the account your administrator created for you.</p>

          <div className="mt-6 space-y-3" aria-live="polite">
            {notice && !error && (
              <div className="banner banner-info" role="status">
                <Info size={16} aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}
            {error && (
              <div className="banner banner-danger" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate aria-busy={submitting}>
            <div>
              <label htmlFor="login-email" className="field-label">
                Email
              </label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                }}
                className="input h-11"
                placeholder="name@company.com"
                autoFocus
                {...fieldProps('email')}
              />
              {fieldErrors.email && (
                <p id="signin-email-error" className="field-error">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                  }}
                  className="input h-11 pr-16"
                  {...fieldProps('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-md text-xs font-semibold text-ink-2 hover:text-ink hover:bg-white/5"
                  aria-pressed={showPassword}
                  aria-label="Show password"
                  aria-controls="login-password"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="signin-password-error" className="field-error">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-ink-3 mt-8">No account yet? Ask your workspace administrator to create one for you.</p>
        </div>
      </main>
    </div>
  );
};

export default SignInPage;
