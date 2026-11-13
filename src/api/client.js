/**
 * Thin fetch wrapper for the StockFlow API.
 * - Same-origin requests with the HTTP-only session cookie.
 * - Adds the CSRF token to every mutation.
 * - Normalises every failure into an ApiError with a `kind` the UI can act on.
 */

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** validation | auth | forbidden | conflict | notfound | network | server */
  get kind() {
    if (this.status === 0) return 'network';
    if (this.status === 400 || this.status === 422) return 'validation';
    if (this.status === 401) return 'auth';
    if (this.status === 403) return this.code === 'CSRF_INVALID' ? 'auth' : 'forbidden';
    if (this.status === 404) return 'notfound';
    if (this.status === 409) return 'conflict';
    if (this.status === 429) return 'validation';
    return 'server';
  }

  /** True when we cannot know whether the server applied the request. */
  get ambiguous() {
    return this.status === 0 || this.status >= 500;
  }
}

let csrfToken = null;
let onUnauthorized = null;

export const setCsrfToken = (t) => {
  csrfToken = t;
};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const TIMEOUT_MS = 20000;

export async function apiRequest(method, path, { body, headers = {}, idempotencyKey, signal, raw = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  const h = { Accept: raw ? '*/*' : 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) h['X-CSRF-Token'] = csrfToken;
  if (idempotencyKey) h['Idempotency-Key'] = idempotencyKey;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError({
      status: 0,
      code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
      message: controller.signal.aborted
        ? 'The server took too long to respond.'
        : 'Cannot reach the server. Check your connection.',
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;
  if (raw && res.ok) return res;

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error || {};
    const error = new ApiError({
      status: res.status,
      code: e.code || `HTTP_${res.status}`,
      message: e.message || `Request failed (${res.status}).`,
      details: e.details,
    });
    if (error.kind === 'auth' && !path.startsWith('/auth/login')) onUnauthorized?.(error);
    throw error;
  }
  return data;
}

/**
 * Retry a stock-affecting request after an ambiguous failure (network drop,
 * timeout, 5xx). The SAME idempotency key is reused, so the server applies the
 * effect at most once even if the first attempt actually succeeded.
 */
export async function withRetry(fn, { attempts = 3, baseDelay = 600 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ApiError) || !err.ambiguous || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** i));
    }
  }
  throw lastErr;
}

const qs = (params = {}) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  login: (email, password) => apiRequest('POST', '/auth/login', { body: { email, password } }),
  logout: () => apiRequest('POST', '/auth/logout', { body: {} }),
  me: () => apiRequest('GET', '/auth/me'),

  categories: () => apiRequest('GET', '/categories'),
  listProducts: (params, opts) => apiRequest('GET', `/products${qs(params)}`, opts),
  getProduct: (id) => apiRequest('GET', `/products/${id}`),
  createProduct: (data) => apiRequest('POST', '/products', { body: data }),
  updateProduct: (id, data) => apiRequest('PATCH', `/products/${id}`, { body: data }),
  deleteProduct: (id) => apiRequest('DELETE', `/products/${id}`),
  exportCsvUrl: (params) => `/api/products/export.csv${qs(params)}`,
  adjustStock: (id, data, key) => apiRequest('POST', `/products/${id}/adjustments`, { body: data, idempotencyKey: key }),
  movements: (params) => apiRequest('GET', `/inventory/movements${qs(params)}`),

  listOrders: (params) => apiRequest('GET', `/orders${qs(params)}`),
  getOrder: (id) => apiRequest('GET', `/orders/${id}`),
  createOrder: (data, key) => apiRequest('POST', '/orders', { body: data, idempotencyKey: key }),
  transitionOrder: (id, to) => apiRequest('POST', `/orders/${id}/transition`, { body: { to } }),
  cancelOrder: (id, key, reason) => apiRequest('POST', `/orders/${id}/cancel`, { body: reason ? { reason } : {}, idempotencyKey: key }),

  dashboard: (opts) => apiRequest('GET', '/dashboard', opts),
  settings: () => apiRequest('GET', '/settings'),
  saveSettings: (data) => apiRequest('PUT', '/settings', { body: data }),

  users: () => apiRequest('GET', '/users'),
  createUser: (data) => apiRequest('POST', '/users', { body: data }),
  updateUser: (id, data) => apiRequest('PATCH', `/users/${id}`, { body: data }),

  importLegacy: (source, data) => apiRequest('POST', '/import/legacy', { body: { source, data } }),
  devReset: () => apiRequest('POST', '/dev/reset', { body: {} }),
};
