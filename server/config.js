import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  // Absolute session lifetime (minutes). Sessions older than this are rejected and destroyed.
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 480),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  trustProxy: process.env.TRUST_PROXY || (env === 'production' ? '1' : ''),
  // Destructive "reset to sample data" endpoint. Never available in production.
  allowDevReset: process.env.ALLOW_DEV_RESET === 'true' && env !== 'production',
  serveClient: process.env.SERVE_CLIENT !== 'false',
};

export function assertConfig(cfg = config) {
  const problems = [];
  if (!cfg.mongoUri) problems.push('MONGODB_URI is required');
  if (!cfg.sessionSecret) problems.push('SESSION_SECRET is required');
  if (cfg.isProd && cfg.sessionSecret.length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters in production');
  }
  if (problems.length) {
    throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);
  }
}
