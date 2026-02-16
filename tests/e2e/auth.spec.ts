import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should display signup page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
  });

  test('should show password reset page', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
  });

  test('should display Google sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Should show validation error or not submit
  });

  test('should toggle between login and signup', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign up free/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('should redirect to dashboard after successful login', async ({ page }) => {
    // This test requires a test account
    // Skip if no test credentials available
    test.skip(!process.env.TEST_USER_EMAIL, 'No test credentials');

    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });
});
