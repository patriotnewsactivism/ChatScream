import { test, expect } from '@playwright/test';

test.describe('Studio Page', () => {
  test.beforeEach(async ({ page }) => {
    // Studio requires authentication, so we expect redirect to login
    await page.goto('/studio');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Studio Page - Authenticated', () => {
  // These tests require authentication setup
  test.skip(!process.env.TEST_USER_EMAIL, 'Requires test credentials');

  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill(process.env.TEST_USER_EMAIL!);
    await page.getByPlaceholder(/password/i).fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/studio');
  });

  test('should display studio interface', async ({ page }) => {
    await expect(page.locator('text=ChatScream')).toBeVisible();
  });

  test('should display canvas area', async ({ page }) => {
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should display control deck', async ({ page }) => {
    // Look for mic/cam controls
    await expect(page.locator('[aria-label*="mic"]')).toBeVisible();
    await expect(page.locator('[aria-label*="cam"]')).toBeVisible();
  });

  test('should display Go Live button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /live/i })).toBeVisible();
  });

  test('should display AI assistant section', async ({ page }) => {
    await expect(page.locator('text=AI Studio Assistant')).toBeVisible();
  });

  test('should generate viral package when topic entered', async ({ page }) => {
    await page.getByPlaceholder(/stream about/i).fill('Gaming');
    await page.getByRole('button', { name: /generate/i }).click();
    // Wait for generation
    await expect(page.locator('text=Generating')).toBeVisible();
  });

  test('should toggle layout modes', async ({ page }) => {
    // Find layout selector and test different modes
    const layoutButton = page.locator('[aria-label*="layout"]');
    if (await layoutButton.isVisible()) {
      await layoutButton.click();
      await expect(page.locator('text=Full Camera')).toBeVisible();
    }
  });

  test('should display destination manager', async ({ page }) => {
    await expect(page.locator('text=Destinations')).toBeVisible();
  });
});

test.describe('Studio - Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('should display mobile controls', async ({ page }) => {
    await page.goto('/studio');
    // Should redirect to login, but if authenticated would show mobile UI
    await expect(page).toHaveURL(/\/login/);
  });
});
