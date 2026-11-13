import mongoose from 'mongoose';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}.` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' };

  if (err instanceof HttpError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    body = { code: 'VALIDATION_ERROR', message: Object.values(fields)[0] || 'Invalid input.', details: { fields } };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: `${err.path} is invalid.` };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' };
  }

  if (status >= 500) console.error(err);
  res.status(status).json({ error: body });
}
