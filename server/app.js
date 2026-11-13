import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { config as defaultConfig } from './config.js';
import { csrfProtection, loadUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/resources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const COOKIE = 'sf.sid';

/** Restrictive CORS: only explicitly configured origins (same-origin needs none). */
function cors(origins) {
  return (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Idempotency-Key');
        return res.status(204).end();
      }
    }
    next();
  };
}

export function createApp(overrides = {}) {
  const config = { ...defaultConfig, ...overrides };
  const ttlMs = config.sessionTtlMinutes * 60 * 1000;
  const app = express();

  app.disable('x-powered-by');
  app.set('sessionCookieName', COOKIE);
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
        },
      },
    })
  );
  if (config.corsOrigins.length) app.use('/api', cors(config.corsOrigins));
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: mongoose.connection.readyState === 1 });
  });

  app.use(
    session({
      name: COOKIE,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: 'sessions',
        ttl: Math.ceil(ttlMs / 1000),
        autoRemove: 'native',
        stringify: false,
      }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        maxAge: ttlMs,
        path: '/',
      },
    })
  );
  app.use('/api', loadUser(ttlMs));
  app.use('/api', csrfProtection);
  app.use('/api/auth', authRoutes({ ttlMs, loginLimit: config.loginRateLimit }));
  app.use('/api', apiRoutes({ allowDevReset: config.allowDevReset }));
  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin as the API.
  const dist = path.resolve(here, '../dist');
  if (config.serveClient && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
