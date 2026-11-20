import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { postSignInPath, ROUTES } from '../src/lib/routes.js';
import { lockScroll, isScrollLocked, resetScrollLock } from '../src/lib/scrollLock.js';

test('after sign-in, workspace paths are kept with their query and hash', () => {
  assert.equal(postSignInPath({ pathname: '/app/orders', search: '?q=1', hash: '#x' }), '/app/orders?q=1#x');
  assert.equal(postSignInPath('/app'), '/app');
  assert.equal(postSignInPath('/app/settings'), '/app/settings');
});

test('after sign-in, anything outside the workspace falls back to the dashboard', () => {
  for (const from of [undefined, null, '', '/', '/signin', '/application', '//evil.example/app', 'https://evil.example/app', '/app\\..\\x', { pathname: 42 }]) {
    assert.equal(postSignInPath(from), ROUTES.app, String(from));
  }
});

// Minimal stand-in for document.documentElement attribute handling.
const attrs = new Map();
globalThis.document = {
  documentElement: {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  },
};
beforeEach(() => resetScrollLock());

test('scroll stays locked until the last overlay releases it', () => {
  const sheet = lockScroll();
  const confirm = lockScroll();
  assert.ok(attrs.has('data-scroll-locked'));
  confirm();
  assert.ok(isScrollLocked(), 'the sheet underneath still holds the lock');
  sheet();
  assert.equal(isScrollLocked(), false);
  assert.ok(!attrs.has('data-scroll-locked'));
});

test('releasing twice cannot unlock another overlay', () => {
  const a = lockScroll();
  const b = lockScroll();
  a();
  a(); // e.g. close followed by unmount
  assert.ok(isScrollLocked());
  b();
  assert.ok(!attrs.has('data-scroll-locked'));
});
