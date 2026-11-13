import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { parse } from '../lib/validate.js';
import { unauthorized } from '../lib/errors.js';
import { issueCsrfToken, permissionsFor, requireAuth } from '../middleware/auth.js';
import { serializeUser } from '../services/serialize.js';

// Constant-time-ish rejection for unknown emails (hash of a random string).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-' + Math.random(), 10);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const sessionPayload = (user, session) => ({
  user: { ...serializeUser(user), permissions: permissionsFor(user.role) },
  csrfToken: session.csrfToken,
  expiresAt: new Date(session.authAt + session.ttlMs).toISOString(),
});

export function authRoutes({ ttlMs, loginLimit }) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').toLowerCase()}`,
    handler: (req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } }),
  });

  router.post('/login', limiter, async (req, res, next) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok || !user.active) throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');

    // New session id on login prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = String(user._id);
      req.session.authAt = Date.now();
      req.session.ttlMs = ttlMs;
      issueCsrfToken(req.session);
      User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.json(sessionPayload(user, req.session));
      });
    });
  });

  router.post('/logout', (req, res, next) => {
    const cookieName = req.app.get('sessionCookieName');
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(cookieName, { path: '/' });
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    if (!req.session.csrfToken) issueCsrfToken(req.session);
    res.json(sessionPayload(req.user, req.session));
  });

  return router;
}
