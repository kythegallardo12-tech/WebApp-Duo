import { test, expect } from '@playwright/test';

/**
 * End-to-end tests against the real Express API and a throw-away MongoDB
 * (see server/scripts/e2e-server.js). Every test starts from the same fixtures.
 */

const ADMIN = { email: 'admin@e2e.test', password: 'e2e-admin-password-123' };
const STAFF = { email: 'staff@e2e.test', password: 'e2e-staff-password-123' };

test.beforeEach(async ({ request }) => {
  const res = await request.post('/__e2e/reset');
  expect(res.ok()).toBeTruthy();
});

async function login(page, who = ADMIN) {
  await page.goto('/');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
}

const inventoryRow = (page, sku) => page.locator(`[data-testid="inventory-row"][data-sku="${sku}"]`);

test.describe('authentication', () => {
  test('protected screens require sign-in and the API rejects anonymous calls', async ({ page, request }) => {
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: /Sign in to/ })).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(0);
    const res = await request.get('/api/products');
    expect(res.status()).toBe(401);
  });

  test('wrong password shows an error; login and logout work', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');

    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    await page.getByTestId('account-menu').click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('You have been signed out.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: /Sign in to/ })).toBeVisible();
  });

  test('an expired or revoked session returns the user to the login screen', async ({ page, context }) => {
    await login(page);
    await context.clearCookies();
    // The next API call gets 401 and the app returns to the login screen.
    await page.getByRole('link', { name: 'Orders' }).click();
    await expect(page.getByRole('heading', { name: /Sign in to/ })).toBeVisible();
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
  });

  test('keyboard-only sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Email')).toBeFocused();
    await page.keyboard.type(ADMIN.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(ADMIN.password);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    // Skip link is the first focusable element in the workspace.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  });
});

test.describe('permissions', () => {
  test('staff can work with products and orders but cannot delete or manage users', async ({ page }) => {
    await login(page, STAFF);
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Product' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Team' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
    await expect(page.getByText('You are signed in as')).toContainText('staff');

    const status = await page.evaluate(async () => (await fetch('/api/users')).status);
    expect(status).toBe(403);
  });

  test('admin sees team management and delete controls', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
    await expect(page.getByText('staff@e2e.test')).toBeVisible();
    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('button', { name: 'Table layout' }).click();
    await expect(page.getByRole('button', { name: /^Delete / }).first()).toBeVisible();
  });
});

test.describe('products', () => {
  test('create, edit and delete persist across reloads', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('button', { name: 'Create Product' }).click();
    await page.getByLabel('Product Label / Title').fill('E2E Desk Lamp');
    await page.getByLabel('SKU Identifier').fill('e2e lamp 1');
    await page.getByLabel('Selling Price ($)').fill('24.50');
    await page.getByLabel('Unit Cost ($)').fill('9');
    await page.getByLabel('Opening Stock').fill('12');
    await page.getByRole('button', { name: 'Save & Publish Product' }).click();
    await expect(page.getByText('Product saved')).toBeVisible();
    await expect(page.getByTestId('sync-status')).toContainText('All changes saved');

    await page.reload();
    await page.getByLabel('Search products').fill('E2E Desk');
    const card = page.getByTestId('product-card').filter({ hasText: 'E2E Desk Lamp' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('E2E-LAMP-1');
    await expect(card).toContainText('$24.50');

    // Card actions appear on hover or keyboard focus; use the keyboard.
    await card.getByRole('button', { name: 'Edit E2E Desk Lamp' }).focus();
    await expect(card.getByRole('button', { name: 'Edit E2E Desk Lamp' })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.getByLabel('Selling Price ($)').fill('26');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByLabel('Search products').fill('E2E Desk');
    await expect(page.getByTestId('product-card').filter({ hasText: 'E2E Desk Lamp' })).toContainText('$26.00');

    const again = page.getByTestId('product-card').filter({ hasText: 'E2E Desk Lamp' });
    await again.getByRole('button', { name: 'Delete E2E Desk Lamp' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Delete Product' }).click();
    await expect(page.getByText('Product removed')).toBeVisible();
    await page.reload();
    await page.getByLabel('Search products').fill('E2E Desk');
    await expect(page.getByText('No matching products')).toBeVisible();
  });

  test('duplicate SKU and invalid numbers are rejected with clear messages', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Products' }).click();
    await page.getByRole('button', { name: 'Create Product' }).click();
    await page.getByLabel('Product Label / Title').fill('Duplicate');
    await page.getByLabel('SKU Identifier').fill('elec-wbh-001');
    await page.getByLabel('Selling Price ($)').fill('-3');
    await page.getByRole('button', { name: 'Save & Publish Product' }).click();
    await expect(page.getByText('Enter a price of 0 or more.')).toBeVisible();

    await page.getByLabel('Selling Price ($)').fill('3');
    await page.getByRole('button', { name: 'Save & Publish Product' }).click();
    // Optimistic item is rolled back and the form re-opens with the server's field error.
    await expect(page.getByText('This SKU is already in use.')).toBeVisible();
    await expect(page.getByLabel('Product Label / Title')).toHaveValue('Duplicate');
  });

  test('filtering, sorting, pagination and CSV export use the server', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(page.getByText('10 products')).toBeVisible();
    await expect(page.getByText('Page 1 of 1')).toHaveCount(0);

    await page.getByLabel('Filter by stock status').selectOption('low_stock');
    await expect(page.getByTestId('product-card')).toHaveCount(1);
    await expect(page.getByTestId('product-card')).toContainText('Indoor Plant Set');

    await page.getByLabel('Filter by stock status').selectOption('all');
    await page.getByLabel('Filter by category').selectOption({ label: '💻 Electronics' });
    await page.getByLabel('Sort products').selectOption('-price');
    await expect(page.getByTestId('product-card')).toHaveCount(3);
    await expect(page.getByTestId('product-card').first()).toContainText('Smart Watch Pro');

    // The button triggers a real file download with the current filters...
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/);
    // ...and the same authenticated URL returns the filtered, sorted CSV.
    const href = await page.getByTestId('export-csv').getAttribute('href');
    const res = await page.request.get(href);
    expect(res.headers()['content-type']).toContain('text/csv');
    const csv = (await res.text()).trim().split(/\r?\n/);
    expect(csv[0]).toMatch(/^SKU,Name,Category,Price/);
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain('Smart Watch Pro');

    // Pagination: add products until there are two pages.
    await page.getByLabel('Filter by category').selectOption('all');
    await page.evaluate(async () => {
      const me = await (await fetch('/api/auth/me')).json();
      const cats = await (await fetch('/api/categories')).json();
      for (let i = 0; i < 4; i++) {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
          body: JSON.stringify({ name: `Paged ${i}`, sku: `PAGED-${i}`, category: cats.items[0].id, price: 1 }),
        });
      }
    });
    await page.reload();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(2);
  });
});

test.describe('inventory and orders', () => {
  test('stock adjustments persist and are recorded', async ({ page }) => {
    await login(page, STAFF);
    await page.getByRole('link', { name: 'Inventory' }).click();
    const row = inventoryRow(page, 'HOM-IPS-004');
    await expect(row.getByTestId('stock-value')).toHaveText('8 units');
    await row.getByRole('button', { name: 'Add 5 units of Indoor Plant Set' }).click();
    await expect(row.getByTestId('stock-value')).toHaveText('13 units'); // optimistic, immediate
    await expect(page.getByTestId('sync-status')).toContainText('All changes saved');

    await row.getByRole('button', { name: 'Adjust' }).click();
    await page.getByRole('radio', { name: 'Remove stock' }).click();
    await page.getByLabel('Units', { exact: true }).fill('3');
    await page.getByLabel('Reason', { exact: true }).fill('Damaged in storage');
    await page.getByRole('button', { name: 'Save Adjustment' }).click();
    await expect(page.getByText('Stock saved')).toBeVisible();

    await page.reload();
    await expect(inventoryRow(page, 'HOM-IPS-004').getByTestId('stock-value')).toHaveText('10 units');
    await inventoryRow(page, 'HOM-IPS-004').getByRole('button', { name: 'Stock history for Indoor Plant Set' }).click();
    const history = page.getByTestId('movement-list');
    await expect(history).toContainText('Damaged in storage');
    await expect(history).toContainText('by E2E Staff');
  });

  test('multi-item order reserves stock, advances status and cancellation restores stock', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Orders' }).click();
    await page.getByRole('button', { name: 'New Order' }).click();
    await page.getByLabel('Customer Full Name').fill('Playwright Buyer');
    await page.getByLabel('Customer Email').fill('buyer@e2e.test');
    await page.getByLabel('Delivery Address').fill('1 Test Street');
    await page.getByLabel('Product for line 1').selectOption({ label: 'Yoga Mat Premium — $59.99 (200 in stock)' });
    await page.getByLabel('Quantity for line 1').fill('2');
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Product for line 2').selectOption({ label: 'Artisan Coffee Beans — $19.99 (300 in stock)' });
    await page.getByLabel('Quantity for line 2').fill('3');
    await expect(page.getByText('$179.95')).toBeVisible(); // 2×59.99 + 3×19.99
    await page.getByRole('button', { name: 'Create Order' }).click();
    await expect(page.getByText('Order created')).toBeVisible();

    const row = page.getByTestId('order-row').filter({ hasText: 'Playwright Buyer' });
    await expect(row).toContainText('$179.95');
    await expect(row).toContainText(/ORD-\d{4}-\d{4}/);

    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(inventoryRow(page, 'SPT-YMP-005').getByTestId('stock-value')).toHaveText('198 units');
    await expect(inventoryRow(page, 'FOD-ACB-008').getByTestId('stock-value')).toHaveText('297 units');

    await page.getByRole('link', { name: 'Orders' }).click();
    const order = page.getByTestId('order-row').filter({ hasText: 'Playwright Buyer' });
    await order.getByTestId('order-status').click();
    await expect(order.getByTestId('order-status')).toContainText('Processing');
    await order.getByRole('button', { name: /^Cancel ORD-/ }).click();
    await page.getByRole('button', { name: 'Cancel Order' }).click();
    await expect(page.getByText('Order cancelled')).toBeVisible();
    await expect(order.getByTestId('order-status')).toContainText('Cancelled');

    await page.reload();
    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(inventoryRow(page, 'SPT-YMP-005').getByTestId('stock-value')).toHaveText('200 units');
    await expect(inventoryRow(page, 'FOD-ACB-008').getByTestId('stock-value')).toHaveText('300 units');
  });

  test('delivered orders offer no cancel action', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Orders' }).click();
    const delivered = page.getByTestId('order-row').filter({ hasText: 'Maria Santos' });
    await expect(delivered.getByTestId('order-status')).toContainText('Delivered');
    await expect(delivered.getByRole('button', { name: /^Cancel / })).toHaveCount(0);
  });
});

test.describe('dashboard', () => {
  test('figures come from the database', async ({ page }) => {
    await login(page);
    const api = await page.evaluate(async () => (await fetch('/api/dashboard')).json());
    // Seeded sample orders: 6 orders, $1,009.84 total.
    expect(api.totals.orders).toBe(6);
    expect(api.totals.revenue).toBeCloseTo(1009.84, 2);
    const stats = page.getByTestId('dashboard-stats');
    await expect(stats).toContainText('$1,009.84', { timeout: 10_000 });
    await expect(stats).toContainText('Total Orders');
    await expect(page.getByText('Peak Month')).toBeVisible();
  });
});

test.describe('optimistic updates', () => {
  test('a rejected stock change is rolled back without touching other rows', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(inventoryRow(page, 'SPT-RSE-010').getByTestId('stock-value')).toHaveText('45 units');

    await page.route('**/api/products/*/adjustments', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock (simulated).' } }) })
    );
    const row = inventoryRow(page, 'SPT-RSE-010');
    await row.getByRole('button', { name: 'Add 20 units of Running Shoes Elite' }).click();
    await expect(page.getByText('Not enough stock (simulated).')).toBeVisible();
    await expect(row.getByTestId('stock-value')).toHaveText('45 units');
    await expect(page.getByTestId('sync-status')).toContainText('Conflict');
    await expect(inventoryRow(page, 'SPT-YMP-005').getByTestId('stock-value')).toHaveText('200 units');
  });

  test('an ambiguous network failure is retried with the same key, then reconciled with the server', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Inventory' }).click();
    const keys = [];
    let calls = 0;
    await page.route('**/api/products/*/adjustments', async (route) => {
      calls += 1;
      keys.push(route.request().headers()['idempotency-key']);
      if (calls === 1) {
        // The server applies the change but the response is lost.
        await route.fetch();
        return route.abort('connectionreset');
      }
      return route.continue();
    });
    const row = inventoryRow(page, 'ELEC-UCA-009');
    await expect(row.getByTestId('stock-value')).toHaveText('95 units');
    await row.getByRole('button', { name: 'Add 5 units of USB-C Hub Adapter' }).click();
    await expect(page.getByTestId('sync-status')).toContainText('All changes saved', { timeout: 15_000 });
    expect(calls).toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    await page.unroute('**/api/products/*/adjustments');
    await page.reload();
    await expect(inventoryRow(page, 'ELEC-UCA-009').getByTestId('stock-value')).toHaveText('100 units'); // applied once
  });
});

test.describe('loading states', () => {
  test('fast responses show no loader; 1–10 s shows a skeleton; >10 s shows an honest indeterminate state', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(page.getByText('Average Order Value')).toBeVisible();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);

    let delay = 3000;
    await page.route('**/api/dashboard', async (route) => {
      await new Promise((r) => setTimeout(r, delay));
      await route.continue();
    });
    await page.reload();
    await expect(page.getByTestId('skeleton')).toBeVisible({ timeout: 2500 });
    await expect(page.getByText('Average Order Value')).toBeVisible({ timeout: 8000 });

    delay = 12500;
    await page.reload();
    await expect(page.getByText('Time remaining is unknown')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('progressbar', { name: 'Loading, progress unknown' })).toBeVisible();
    await expect(page.getByText('% complete')).toHaveCount(0);
    await expect(page.locator('.animate-spin')).toHaveCount(0);
  });

  test('API failures are shown, never replaced with sample data', async ({ page }) => {
    await login(page);
    await page.route('**/api/dashboard', (route) => route.abort('failed'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Cannot reach the server' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByTestId('dashboard-stats')).toHaveCount(0);
  });
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('navigation drawer and no horizontal scrolling', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('link', { name: 'Products' })).not.toBeInViewport();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Orders' }).click();
    await expect(page.getByRole('heading', { name: 'Fulfillment & Dispatch Pipeline' })).toBeVisible();
    for (const path of ['/', '/products', '/inventory', '/orders', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
