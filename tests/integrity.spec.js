import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { expect((await request.post('/__e2e/reset')).ok()).toBeTruthy(); });
async function signIn(page, staff = false) {
  await page.goto('/');
  await page.getByLabel('Email').fill(staff ? 'staff@e2e.test' : 'admin@e2e.test');
  await page.getByLabel('Password').fill(staff ? 'e2e-staff-password-123' : 'e2e-admin-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('reversed successful stock requests show the final database quantity', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Inventory' }).click();
  const row = page.getByTestId('inventory-row').filter({ hasText: 'ELEC-UCA-009' });
  await expect(row.getByTestId('stock-value')).toHaveText('95 units');
  const firstArrived = deferred(), releaseFirst = deferred(), secondCommitted = deferred();
  await page.route('**/api/products/*/adjustments', async route => {
    const { delta } = route.request().postDataJSON();
    if (delta === 5) { firstArrived.resolve(); await releaseFirst.promise; }
    const response = await route.fetch();
    await route.fulfill({ response });
    if (delta === 20) secondCommitted.resolve();
  });
  await row.getByRole('button', { name: 'Add 5 units of USB-C Hub Adapter' }).click();
  await firstArrived.promise;
  await row.getByRole('button', { name: 'Add 20 units of USB-C Hub Adapter' }).click();
  await secondCommitted.promise; releaseFirst.resolve();
  await expect(page.getByTestId('sync-status')).toContainText('All changes saved');
  await expect(row.getByTestId('stock-value')).toHaveText('120 units');
  const res = await page.request.get('/api/products?q=ELEC-UCA-009');
  expect((await res.json()).items[0].stock).toBe(120);
});

test('fresh product page results replace inactive local cache values', async ({ page }) => {
  await signIn(page); await page.getByRole('link', { name: 'Products' }).click();
  const card = page.getByTestId('product-card').filter({ hasText: 'Yoga Mat Premium' });
  await expect(card).toContainText('$59.99');
  const me = await (await page.request.get('/api/auth/me')).json();
  const product = (await (await page.request.get('/api/products?q=SPT-YMP-005')).json()).items[0];
  const update = await page.request.patch('/api/products/' + product.id, { headers: { 'X-CSRF-Token': me.csrfToken }, data: { price: 12.34, version: product.version } });
  expect(update.ok()).toBeTruthy();
  await page.getByLabel('Filter by category').selectOption({ label: '⚽ Sports' });
  await expect(card).toContainText('$12.34');
  await expect(card).not.toContainText('$59.99');
});

test('business currency and low-stock notification preference affect the workspace', async ({ page }) => {
  await signIn(page); await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Currency code').fill('PHP');
  await page.getByLabel('Show low-stock alerts on the inventory page').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Business settings were updated.')).toBeVisible();
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page.getByTestId('low-stock-count')).toHaveText('1');
  await expect(page.getByText('Low-stock alert:', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('inventory-row').filter({ hasText: 'ELEC-UCA-009' })).toContainText('₱44.99');
  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page.getByTestId('product-card').filter({ hasText: 'Smart Watch Pro' })).toContainText('₱299.99');
  await page.getByRole('button', { name: 'Create Product' }).click();
  await expect(page.getByLabel('Selling Price (₱)')).toBeVisible();
});

test('password reset signs out an existing staff browser session', async ({ page, request }) => {
  await signIn(page, true);
  const admin = await request.post('/api/auth/login', { data: { email: 'admin@e2e.test', password: 'e2e-admin-password-123' } });
  const { csrfToken } = await admin.json();
  const users = (await (await request.get('/api/users')).json()).items;
  const staff = users.find(u => u.role === 'staff');
  const reset = await request.patch('/api/users/' + staff.id, { headers: { 'X-CSRF-Token': csrfToken }, data: { password: 'new-fixture-password-123' } });
  expect(reset.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill('staff@e2e.test');
  await page.getByLabel('Password').fill('new-fixture-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
});
