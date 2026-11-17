import { create } from 'zustand';
import { api, setCsrfToken, setUnauthorizedHandler } from '../api/client';
import useStore from './useStore';

let authRequestSeq = 0;

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
    const seq = ++authRequestSeq;
    try {
      const res = await api.me();
      if (seq !== authRequestSeq) return;
      setCsrfToken(res.csrfToken);
      set({ status: 'signedIn', user: res.user, features: res.features || {} });
    } catch (err) {
      if (seq !== authRequestSeq) return;
      if (err.kind === 'network' || err.kind === 'server') set({ status: 'offline', notice: err.message });
      else set({ status: 'signedOut', user: null });
    }
  },

  login: async (email, password) => {
    const seq = ++authRequestSeq;
    const res = await api.login(email, password);
    if (seq !== authRequestSeq) return;
    useStore.getState().resetWorkspace();
    setCsrfToken(res.csrfToken);
    set({ status: 'signedIn', user: res.user, features: res.features || {}, notice: null });
    return res.user;
  },

  logout: async () => {
    const seq = ++authRequestSeq;
    useStore.getState().resetWorkspace();
    set({ status: 'checking', user: null });
    try {
      await api.logout();
    } catch {
      // Clear the local session even if the server cannot be reached.
    } finally {
      if (seq === authRequestSeq) {
        setCsrfToken(null);
        set({ status: 'signedOut', user: null, features: {}, notice: 'You have been signed out.' });
      }
    }
  },

  expire: (message) => {
    if (get().status !== 'signedIn') return;
    authRequestSeq++;
    useStore.getState().resetWorkspace();
    setCsrfToken(null);
    set({ status: 'signedOut', user: null, features: {}, notice: message || 'Your session has ended. Please sign in again.' });
  },
}));

setUnauthorizedHandler((err) => useAuth.getState().expire(err.message));

export default useAuth;
