import { test, expect } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

// Existing tests for landing page

test('should display responsive navigation on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(baseUrl);
  await expect(page.locator('nav')).toBeVisible();
});

// Additional tests for new features

test('should display moderator dashboard link', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('a[href="/moderator-dashboard"]')).toBeVisible();
});

// Additional tests for moderation rules builder

test('should display moderation rules builder', async ({ page }) => {
  await page.goto(`${baseUrl}/moderator-dashboard`);
  await expect(page.locator('.moderation-rules-builder')).toBeVisible();
});