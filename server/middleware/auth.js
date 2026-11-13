import crypto from 'node:crypto';
import { User } from '../models/index.js';
import { forbidden, HttpError, unauthorized } from '../lib/errors.js';

/**
 * Role matrix (enforced here on the server, mirrored in the UI):
 *
 *   capability                         staff  admin
 *   view dashboard/products/orders       ✓      ✓
 *   create/edit products                 ✓      ✓
 *   adjust stock                         ✓      ✓
 *   create/advance/cancel orders         ✓      ✓
 *   delete products, create categories   –      ✓
 *   manage users                         –      ✓
 *   edit business settings               –      ✓
 *   import legacy browser data           –      ✓
 */
export const PERMISSIONS = {
  'catalog:write': ['admin', 'staff'],
  'inventory:adjust': ['admin', 'staff'],
  'orders:write': ['admin', 'staff'],
  'catalog:delete': ['admin'],
  'categories:write': ['admin'],
  'users:manage': ['admin'],
  'settings:write': ['admin'],
  'data:import': ['admin'],
  'data:reset': ['admin'],
};

export const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));

/** Load the signed-in user from the session and enforce absolute session expiry. */
export function loadUser(ttlMs) {
  return async (req, res, next) => {
    const sess = req.session;
    if (!sess?.userId) return next();

    if (!sess.authAt || Date.now() - sess.authAt > ttlMs) {
      return sess.destroy(() => next(unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED')));
    }
    const user = await User.findById(sess.userId).lean();
    if (!user || !user.active) {
      return sess.destroy(() => next(unauthorized('Your account is no longer active.', 'SESSION_REVOKED')));
    }
    req.user = user;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!PERMISSIONS[permission]?.includes(req.user.role)) return next(forbidden());
  next();
};

/* ── CSRF: synchronizer token stored in the session, sent back in X-CSRF-Token ── */
export const issueCsrfToken = (session) => {
  session.csrfToken = crypto.randomBytes(32).toString('hex');
  return session.csrfToken;
};

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT = new Set(['/api/auth/login']);

export function csrfProtection(req, res, next) {
  if (SAFE.has(req.method) || EXEMPT.has(req.baseUrl + req.path)) return next();
  const expected = req.session?.csrfToken;
  const got = req.get('X-CSRF-Token') || '';
  if (!expected || got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    // No session at all means the user is simply signed out.
    if (!req.session?.userId) return next(unauthorized());
    return next(new HttpError(403, 'CSRF_INVALID', 'Your security token is missing or out of date. Refresh the page and try again.'));
  }
  next();
}
