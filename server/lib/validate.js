import mongoose from 'mongoose';
import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.entries(fields)[0];
    throw badRequest(first ? `${first[0] === '_' ? '' : `${first[0]}: `}${first[1]}` : 'Invalid input.', { fields });
  }
  return result.data;
}

export const objectId = (label = 'id') =>
  z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v), {
    message: `${label} is not a valid identifier.`,
  });

export const intInRange = (label, min, max) =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform((v) => (typeof v === 'number' ? v : Number(v)))
    .refine((n) => Number.isInteger(n), { message: `${label} must be a whole number.` })
    .refine((n) => n >= min && n <= max, { message: `${label} must be between ${min} and ${max}.` });

export function assertObjectId(id, what = 'Resource') {
  if (!/^[a-f0-9]{24}$/i.test(String(id))) {
    const err = badRequest(`${what} identifier is invalid.`);
    err.status = 404;
    err.code = 'NOT_FOUND';
    err.message = `${what} not found.`;
    throw err;
  }
}

export const normalizeSku = (sku) => String(sku || '').trim().toUpperCase().replace(/\s+/g, '-');
