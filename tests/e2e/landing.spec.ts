import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display hero section', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Stream Without Limits');
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
  });

  test('should navigate to signup when clicking Get Started', async ({ page }) => {
    await page.getByRole('button', { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('should navigate to login when clicking Sign In', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should display unlimited local streaming section', async ({ page }) => {
    await expect(page.locator('text=Stream From Any Device')).toBeVisible();
    await expect(page.locator('text=Unlimited Local Streaming')).toBeVisible();
  });

  test('should display cloud power section', async ({ page }) => {
    await expect(page.locator('text=The Cloud Engine')).toBeVisible();
  });

  test('should display Chat Screamer section', async ({ page }) => {
    await expect(page.locator('text=Chat Screamer')).toBeVisible();
    await expect(page.locator('text=Standard Scream')).toBeVisible();
  });

  test('should display pricing section', async ({ page }) => {
    await expect(page.locator('#pricing')).toBeVisible();
    await expect(page.locator('text=Choose Your Plan')).toBeVisible();
  });

  test('should have responsive navigation on mobile', async ({ page, isMobile }) => {
    if (isMobile) {
      await expect(page.locator('button[aria-label*="menu"]')).toBeVisible();
    }
  });

  test('should display leaderboard section', async ({ page }) => {
    await expect(page.locator('#leaderboard')).toBeVisible();
  });
});

test.describe('Landing Page - SEO', () => {
  test('should have proper meta tags', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
