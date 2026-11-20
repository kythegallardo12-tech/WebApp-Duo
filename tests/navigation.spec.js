import { test, expect } from '@playwright/test';

/**
 * Public landing page, sign-in routing, the sign-in form's states, and native scrolling.
 * Runs against the production build and the real API (see server/scripts/e2e-server.js).
 */

const ADMIN = { email: 'admin@e2e.test', password: 'e2e-admin-password-123' };

test.beforeEach(async ({ request }) => {
  expect((await request.post('/__e2e/reset')).ok()).toBeTruthy();
});

async function fillSignIn(page, who = ADMIN) {
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('landing page and routes', () => {
  test('the root URL is the public landing page and its actions lead somewhere real', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory and order management for small teams' })).toBeVisible();
    // Text-only wordmark: no image or svg inside the brand link.
    const brand = page.getByRole('banner').getByRole('link', { name: 'StockFlow home' });
    await expect(brand).toHaveText('StockFlow');
    await expect(brand.locator('svg, img')).toHaveCount(0);

    // Every product image on the page loads.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0)))
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Secondary action: in-page anchor to the features section.
    await page.getByRole('link', { name: 'See what’s included' }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.getByRole('heading', { name: 'Products, stock and orders, connected' })).toBeInViewport();

    // Primary action: the sign-in screen.
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Sign in to your workspace' }).first().click();
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { name: 'Sign in to StockFlow' })).toBeVisible();
  });

  test('a protected deep link returns to the same page after sign-in', async ({ page }) => {
    await page.goto('/app/orders?from=link');
    await expect(page).toHaveURL(/\/signin$/);
    await fillSignIn(page);
    await expect(page).toHaveURL(/\/app\/orders\?from=link$/);
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  });

  test('old workspace paths redirect into /app', async ({ page }) => {
    await page.goto('/signin');
    await fillSignIn(page);
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/inventory');
    await expect(page).toHaveURL(/\/app\/inventory$/);
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });

  test('signed-in visitors can still see the landing page, and /signin sends them to the workspace', async ({ page }) => {
    await page.goto('/signin');
    await fillSignIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory and order management for small teams' })).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: 'Open workspace' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto('/signin');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('unknown addresses show a not-found page with a way home', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('sign-in form', () => {
  test('empty and malformed input is explained under each field without a request', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/auth/login', (route) => {
      calls += 1;
      return route.continue();
    });
    await page.goto('/signin');
    const submit = page.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeEnabled(); // never greyed out just because fields are empty
    await submit.click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('x');
    await submit.click();
    await expect(page.getByText(/Enter a valid email address/)).toBeVisible();
    expect(calls).toBe(0);
  });

  test('submitting shows progress at once and sends a single request', async ({ page }) => {
    let calls = 0;
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    await page.route('**/api/auth/login', async (route) => {
      calls += 1;
      await gate;
      await route.continue();
    });
    await page.goto('/signin');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const busy = page.getByRole('button', { name: 'Signing in…' });
    await expect(busy).toBeVisible();
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await page.getByLabel('Password', { exact: true }).press('Enter'); // a second submit is ignored
    release();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    expect(calls).toBe(1);
  });

  test('a connection failure is explained and the form can be retried', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.abort('failed'));
    await page.goto('/signin');
    await fillSignIn(page);
    await expect(page.getByRole('alert')).toContainText('Can’t reach the StockFlow server');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});

test.describe('responsive tables', () => {
  test('wide tables scroll inside their card at tablet and small-laptop widths', async ({ page }) => {
    await page.goto('/signin');
    await fillSignIn(page);
    await expect(page.getByTestId('account-menu')).toBeVisible();
    for (const width of [768, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/app/inventory', '/app/orders', '/app/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});

test.describe('scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signin');
    await fillSignIn(page);
    await expect(page.getByTestId('account-menu')).toBeVisible();
  });

  test('a mouse-wheel step scrolls the page immediately (no smooth-scroll controller)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Roles and permissions' })).toBeVisible();
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(360);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  });

  test('closing a sheet or the mobile drawer leaves the page scrollable', async ({ page }) => {
    await page.getByRole('link', { name: 'Products' }).click();
    const trigger = page.getByRole('button', { name: 'Add product' });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'New product' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', '');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
    await expect(trigger).toBeFocused(); // focus returns to the control that opened it

    await page.setViewportSize({ width: 390, height: 700 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', '');
    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });
});
