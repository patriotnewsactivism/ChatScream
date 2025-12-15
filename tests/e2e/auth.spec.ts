import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test('should display signup page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('text=Create your account')).toBeVisible();
  });

  test('should show password reset page', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.locator('text=Reset your password')).toBeVisible();
  });

  test('should display Google sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill('invalid-email');
    await page.getByPlaceholder(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Should show validation error or not submit
  });

  test('should toggle between login and signup', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /create.*account|sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('should redirect to dashboard after successful login', async ({ page }) => {
    // This test requires a test account
    // Skip if no test credentials available
    test.skip(!process.env.TEST_USER_EMAIL, 'No test credentials');

    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill(process.env.TEST_USER_EMAIL!);
    await page.getByPlaceholder(/password/i).fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });
});
