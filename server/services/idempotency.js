import crypto from 'node:crypto';
import { withTransaction } from '../db.js';
import { IdempotencyRecord } from '../models/index.js';
import { badRequest, HttpError } from '../lib/errors.js';

const KEY_RE = /^[A-Za-z0-9_\-:.]{8,100}$/;

export function requireIdempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  if (!key) throw badRequest('An Idempotency-Key header is required for this operation.');
  if (!KEY_RE.test(key)) throw badRequest('Idempotency-Key must be 8-100 characters of letters, digits, "-", "_", ":" or ".".');
  return key;
}

const hashRequest = (scope, payload) =>
  crypto.createHash('sha256').update(JSON.stringify({ scope, payload })).digest('hex');

function replay(record, scope, requestHash) {
  if (record.requestHash !== requestHash || record.scope !== scope) {
    throw new HttpError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used for a different request.'
    );
  }
  return { status: record.responseStatus, body: record.responseBody, replayed: true };
}

/**
 * Execute a stock-affecting operation exactly once per (user, key).
 *
 * `work(session)` runs inside a MongoDB transaction and returns `{ status, body }`.
 * The idempotency record is written in the same transaction, so either both the
 * effect and the record commit, or neither does. A retry with the same key and
 * payload returns the stored response without repeating the effect; a retry with
 * a different payload is rejected with 422.
 */
export async function runIdempotent({ userId, key, scope, payload }, work) {
  const requestHash = hashRequest(scope, payload);

  const existing = await IdempotencyRecord.findOne({ user: userId, key }).lean();
  if (existing) return replay(existing, scope, requestHash);

  try {
    return await withTransaction(async (session) => {
      // Re-check inside the transaction snapshot: a concurrent duplicate may have committed.
      const inTx = await IdempotencyRecord.findOne({ user: userId, key }).session(session).lean();
      if (inTx) return replay(inTx, scope, requestHash);

      const result = await work(session);
      await IdempotencyRecord.create(
        [{ user: userId, key, scope, requestHash, responseStatus: result.status, responseBody: result.body }],
        { session }
      );
      return { ...result, replayed: false };
    });
  } catch (err) {
    // A concurrent request with the same key committed first.
    if (err?.code === 11000 && /idempotency/i.test(String(err.message))) {
      const record = await IdempotencyRecord.findOne({ user: userId, key }).lean();
      if (record) return replay(record, scope, requestHash);
    }
    throw err;
  }
}
