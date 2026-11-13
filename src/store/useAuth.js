import { create } from 'zustand';
import { api, setCsrfToken, setUnauthorizedHandler } from '../api/client';

/**
 * Authentication state. The session itself lives in an HTTP-only cookie the
 * browser never exposes to JavaScript; this store only mirrors who is signed in.
 */
const useAuth = create((set, get) => ({
  status: 'checking', // checking | signedOut | signedIn | offline
  user: null,
  notice: null, // message shown on the login screen (e.g. "session expired")
  features: {},

  can: (permission) => !!get().user?.permissions?.includes(permission),

  bootstrap: async () => {
    try {
      const res = await api.me();
      setCsrfToken(res.csrfToken);
      set({ status: 'signedIn', user: res.user, features: res.features || {} });
    } catch (err) {
      if (err.kind === 'network' || err.kind === 'server') set({ status: 'offline', notice: err.message });
      else set({ status: 'signedOut', user: null });
    }
  },

  login: async (email, password) => {
    const res = await api.login(email, password);
    setCsrfToken(res.csrfToken);
    set({ status: 'signedIn', user: res.user, features: res.features || {}, notice: null });
    return res.user;
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      setCsrfToken(null);
      set({ status: 'signedOut', user: null, notice: 'You have been signed out.' });
    }
  },

  expire: (message) => {
    if (get().status !== 'signedIn') return;
    setCsrfToken(null);
    set({ status: 'signedOut', user: null, notice: message || 'Your session has ended. Please sign in again.' });
  },
}));

setUnauthorizedHandler((err) => useAuth.getState().expire(err.message));

export default useAuth;
