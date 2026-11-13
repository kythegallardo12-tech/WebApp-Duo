import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../db.js';
import { createApp } from '../app.js';
import { User } from '../models/index.js';
import { seedSampleData, wipeBusinessData } from '../services/seed.js';

export const PASSWORD = 'correct-horse-battery';

/** Start a single-node replica set (transactions need one) and connect Mongoose. */
export async function startDb() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDb(replSet.getUri('stockflow_test'));
  return replSet;
}

export async function stopDb(replSet) {
  await disconnectDb();
  await replSet?.stop();
}

export function makeApp(overrides = {}) {
  return createApp({
    env: 'test',
    isProd: false,
    isTest: true,
    sessionSecret: 'test-secret-test-secret-test-secret',
    sessionTtlMinutes: 60,
    loginRateLimit: 1000,
    allowDevReset: true,
    serveClient: false,
    corsOrigins: [],
    trustProxy: '',
    ...overrides,
  });
}

export async function resetData({ seed = true } = {}) {
  await wipeBusinessData();
  await User.deleteMany({});
  await mongoose.connection.db.collection('sessions').deleteMany({});
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [admin, staff] = await User.create([
    { email: 'admin@test.local', name: 'Test Admin', role: 'admin', passwordHash: hash },
    { email: 'staff@test.local', name: 'Test Staff', role: 'staff', passwordHash: hash },
  ]);
  if (seed) await seedSampleData({ actorId: admin._id });
  return { admin, staff };
}

/** Log in and return a client that sends the session cookie + CSRF token automatically. */
export async function login(app, email = 'admin@test.local', password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrfToken;
  const withCsrf = (req) => req.set('X-CSRF-Token', csrf);
  return {
    agent,
    csrf,
    user: res.body.user,
    get: (url) => agent.get(url),
    post: (url, body, headers = {}) => withCsrf(agent.post(url)).set(headers).send(body),
    patch: (url, body) => withCsrf(agent.patch(url)).send(body),
    put: (url, body) => withCsrf(agent.put(url)).send(body),
    del: (url) => withCsrf(agent.delete(url)),
  };
}

export const key = () => `test-${crypto.randomUUID()}`;
