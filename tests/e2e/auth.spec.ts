import { test, expect } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

test('should authenticate user', async ({ page }) => {
  await page.goto(`${baseUrl}/auth`);
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
});

// Additional tests for moderation override workflow

test('should flag message and allow moderator to override', async ({ page }) => {
  await page.goto(`${baseUrl}/chat`);
  await page.fill('textarea[name="message"]', 'You are an idiot.');
  await page.click('button[type="send"]');
  await expect(page.locator('.flagged-message')).toBeVisible();
  await page.goto(`${baseUrl}/moderator-dashboard`);
  await page.click('.override-button');
  await expect(page.locator('.flagged-message')).not.toBeVisible();
});

// Additional tests for false positive handling

test('should dismiss false positive flag', async ({ page }) => {
  await page.goto(`${baseUrl}/chat`);
  await page.fill('textarea[name="message"]', 'Hello, how are you?');
  await page.click('button[type="send"]');
  await expect(page.locator('.flagged-message')).toBeVisible();
  await page.goto(`${baseUrl}/moderator-dashboard`);
  await page.click('.dismiss-button');
  await expect(page.locator('.flagged-message')).not.toBeVisible();
});