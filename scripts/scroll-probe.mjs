/**
 * Scroll-latency probe (diagnostic tool, not part of the test suite).
 * Signs in to the running e2e server, opens a long workspace page and measures how far the
 * page has scrolled at fixed times after a single mouse-wheel input.
 *
 *   npm run build && node server/scripts/e2e-server.js     # terminal 1
 *   node scripts/scroll-probe.mjs [/path]                   # terminal 2
 *
 * Native scrolling reaches the wheel delta within a frame or two. A smooth-scroll controller
 * that intercepts wheel input shows a slow ramp over ~1 s instead.
 */
import { chromium } from '@playwright/test';

const base = process.env.E2E_URL || 'http://localhost:4173';
const path = process.argv[2] || '/products';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  // PROBE_REDUCED_MOTION=1 emulates the OS setting (the old layout skipped Lenis under it).
  reducedMotion: process.env.PROBE_REDUCED_MOTION ? 'reduce' : 'no-preference',
});
// PROBE_AUTO_BEHAVIOR=1 forces native instant programmatic scrolling on <html>.
if (process.env.PROBE_AUTO_BEHAVIOR) await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = 'html{scroll-behavior:auto!important}';
    document.head.append(s);
  });
});
await fetch(`${base}/__e2e/reset`, { method: 'POST' });
await page.goto(`${base}/signin`);
await page.getByLabel('Email').fill('admin@e2e.test');
await page.getByLabel('Password', { exact: true }).fill('e2e-admin-password-123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByTestId('account-menu').waitFor();
await page.goto(`${base}${path.startsWith('/app') ? path : '/app' + path}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await page.mouse.move(640, 400);
const t0 = Date.now();
await page.mouse.wheel(0, 400);
const samples = [];
for (const at of [50, 100, 200, 400, 800, 1400]) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  samples.push([at, await page.evaluate(() => Math.round(scrollY))]);
}
const hasLenis = await page.evaluate(() => document.documentElement.classList.contains('lenis'));
const htmlBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
console.log(JSON.stringify({ path, maxScroll, lenisActive: hasLenis, htmlScrollBehavior: htmlBehavior, samples }));
const at100 = samples.find(([t]) => t === 100)[1];
const expected = Math.min(400, maxScroll);
console.log(at100 >= expected * 0.9 ? 'PASS: scroll applied within 100 ms' : `FAIL: only ${at100}/${expected}px after 100 ms`);
await browser.close();
process.exit(at100 >= expected * 0.9 ? 0 : 1);
