/**
 * Capture screenshots from the running e2e server (test fixtures only):
 *   npm run build && node server/scripts/e2e-server.js   # terminal 1
 *   node server/scripts/screenshots.js                   # terminal 2
 *
 * Writes:
 *  - docs/screenshots/*.png, used by the README
 *  - docs/screenshots/collections.png, a rendered view of the MongoDB collections with
 *    password hashes and session data removed
 *  - public/product/*.jpg, the product images on the public landing page (sample data)
 *
 * Run it twice when the UI changes: the landing page shows the images from the previous run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.E2E_URL || 'http://localhost:4173';
const out = path.resolve('docs/screenshots');
const productOut = path.resolve('public/product');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(productOut, { recursive: true });

await fetch(`${base}/__e2e/reset`, { method: 'POST' });

const browser = await chromium.launch();

async function signIn(page, who = 'admin') {
  await page.goto(`${base}/signin`);
  await page.getByLabel('Email').fill(`${who}@e2e.test`);
  await page.getByLabel('Password', { exact: true }).fill(`e2e-${who}-password-123`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByTestId('account-menu').waitFor();
}

// ── Landing page product images (1440×900 at 1.5×, JPEG) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page);
  const product = async (name, url, ready) => {
    await page.goto(`${base}${url}`);
    await ready();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(productOut, `${name}.jpg`), type: 'jpeg', quality: 86 });
    console.log('saved product', name);
  };
  await product('dashboard', '/app', () => page.getByTestId('dashboard-stats').waitFor());
  await product('inventory', '/app/inventory', () => page.getByTestId('inventory-row').first().waitFor());
  await product('orders', '/app/orders', () => page.getByTestId('order-row').first().waitFor());
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await signIn(m);
  await m.goto(`${base}/app`);
  await m.getByTestId('dashboard-stats').waitFor();
  await m.waitForTimeout(400);
  await m.screenshot({ path: path.join(productOut, 'dashboard-mobile.jpg'), type: 'jpeg', quality: 86 });
  console.log('saved product dashboard-mobile');
  await mctx.close();
}

// ── README screenshots ──
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
const page = await desktop.newPage();
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  console.log('saved', name);
};

await page.goto(base);
await shot('landing');

await page.goto(`${base}/signin`);
await page.getByLabel('Email').fill('admin@e2e.test');
await shot('login');
await page.getByLabel('Password', { exact: true }).fill('e2e-admin-password-123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByTestId('dashboard-stats').waitFor();
await shot('dashboard');

await page.getByRole('link', { name: 'Products' }).click();
await page.getByTestId('product-card').first().waitFor();
await shot('products');

await page.getByRole('link', { name: 'Inventory' }).click();
await page.getByTestId('inventory-row').first().waitFor();
await page.getByRole('button', { name: 'Add 5 units of Indoor Plant Set' }).click();
await page.getByText('All changes saved').waitFor();
await page.getByRole('button', { name: 'Stock history for Indoor Plant Set' }).click();
await page.getByTestId('movement-list').waitFor();
await shot('inventory-history');
await page.keyboard.press('Escape');

await page.getByRole('link', { name: 'Orders' }).click();
await page.getByTestId('order-row').first().waitFor();
await page.getByRole('button', { name: 'New order' }).click();
await page.getByLabel('Customer name').fill('Sample Customer');
await page.getByLabel('Customer email').fill('customer@example.com');
await page.getByLabel('Delivery address').fill('12 Example Street');
await page.getByLabel('Product for line 1').selectOption({ label: 'Smart Watch Pro — $299.99 (75 in stock)' });
await page.getByRole('button', { name: 'Add item' }).click();
await page.getByLabel('Product for line 2').selectOption({ label: 'Artisan Coffee Beans — $19.99 (300 in stock)' });
await page.getByLabel('Quantity for line 2').fill('2');
await shot('order-create');
await page.getByRole('button', { name: 'Create order' }).click();
await page.getByText('Order created').waitFor();
await shot('orders');

await page.getByRole('link', { name: 'Analytics' }).click();
await page.getByText('Average order value').waitFor();
await shot('analytics');

await page.getByRole('link', { name: 'Settings' }).click();
await page.getByRole('heading', { name: 'Team' }).waitFor();
await shot('settings');

// Mobile
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
await signIn(m, 'staff');
await m.goto(`${base}/app/inventory`);
await m.getByTestId('inventory-row').first().waitFor();
await m.waitForTimeout(500);
await m.screenshot({ path: path.join(out, 'mobile-inventory.png') });
await m.getByRole('button', { name: 'Open navigation' }).click();
await m.waitForTimeout(500);
await m.screenshot({ path: path.join(out, 'mobile-nav.png') });
console.log('saved mobile');

// Database collections (redacted), rendered as an image.
const dump = await (await fetch(`${base}/__e2e/collections`)).json();
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#0a0e1a;color:#e2e8f0;font:13px/1.45 ui-monospace,Consolas,monospace;padding:24px}
  h1{font:600 18px system-ui;margin:0 0 4px} p{color:#94a3b8;margin:0 0 16px;font-family:system-ui}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
  section{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:14px}
  h2{font:600 14px system-ui;margin:0 0 8px;color:#93c5fd} h2 span{color:#64748b;font-weight:400}
  pre{margin:0;white-space:pre-wrap;word-break:break-all;color:#cbd5e1;max-height:300px;overflow:hidden}
</style><h1>MongoDB · stockflow_e2e</h1><p>Test fixture data. Password hashes and session contents are removed.</p><div class="grid">${dump
  .map((c) => `<section><h2>${c.name} <span>${c.count} documents</span></h2><pre>${JSON.stringify(c.sample, null, 2).replace(/</g, '&lt;')}</pre></section>`)
  .join('')}</div>`;
const db = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await db.setContent(html);
await db.screenshot({ path: path.join(out, 'collections.png'), fullPage: true });
console.log('saved collections');

await browser.close();
