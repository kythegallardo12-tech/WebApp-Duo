/**
 * Full-stack server for Playwright. Uses its own throw-away database:
 *  - E2E_MONGODB_URI if set (must point at a replica set and a *test* database), otherwise
 *  - an in-memory single-node replica set (mongodb-memory-server).
 *
 * Fixture accounts (test-only, never used outside this script):
 *   admin@e2e.test / e2e-admin-password-123   (admin)
 *   staff@e2e.test / e2e-staff-password-123   (staff)
 *
 * POST /__e2e/reset restores the fixtures between tests. It exists only in this script.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb } from '../db.js';
import { createApp } from '../app.js';
import { User } from '../models/index.js';
import { seedSampleData, wipeBusinessData } from '../services/seed.js';

const port = Number(process.env.E2E_PORT || 4173);
let uri = process.env.E2E_MONGODB_URI;
let replSet;
if (!uri) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  uri = replSet.getUri('stockflow_e2e');
}
if (!/test|e2e/i.test(new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname)) {
  console.error('Refusing to run: the e2e database name must contain "test" or "e2e".');
  process.exit(1);
}
await connectDb(uri);

async function reset() {
  await wipeBusinessData();
  await User.deleteMany({});
  await mongoose.connection.db.collection('sessions').deleteMany({});
  const [admin] = await User.create([
    { email: 'admin@e2e.test', name: 'E2E Admin', role: 'admin', passwordHash: await bcrypt.hash('e2e-admin-password-123', 4) },
    { email: 'staff@e2e.test', name: 'E2E Staff', role: 'staff', passwordHash: await bcrypt.hash('e2e-staff-password-123', 4) },
  ]);
  await seedSampleData({ actorId: admin._id });
}
await reset();

const app = createApp({
  env: 'test',
  isProd: false,
  sessionSecret: 'e2e-session-secret-e2e-session-secret',
  sessionTtlMinutes: 60,
  loginRateLimit: 1000,
  allowDevReset: true,
  serveClient: true,
  corsOrigins: [],
  trustProxy: '',
});
app.post('/__e2e/reset', async (req, res) => {
  await reset();
  res.json({ ok: true });
});

const server = app.listen(port, () => console.log(`E2E server on http://localhost:${port}`));
const stop = async () => {
  server.close();
  await mongoose.disconnect();
  await replSet?.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
