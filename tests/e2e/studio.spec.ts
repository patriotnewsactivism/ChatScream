import { test, expect } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

// Existing tests for studio page

test('should display chat stream', async ({ page }) => {
  await page.goto(`${baseUrl}/studio`);
  await expect(page.locator('.chat-stream')).toBeVisible();
});

// Additional tests for chat moderation

test('should flag toxic content in chat stream', async ({ page }) => {
  await page.goto(`${baseUrl}/studio`);
  await page.fill('textarea[name="message"]', 'You are an idiot.');
  await page.click('button[type="send"]');
  await expect(page.locator('.flagged-message')).toBeVisible();
});

// Additional tests for moderation override workflow

test('should allow moderator to override flagged message', async ({ page }) => {
  await page.goto(`${baseUrl}/studio`);
  await page.fill('textarea[name="message"]', 'You are an idiot.');
  await page.click('button[type="send"]');
  await expect(page.locator('.flagged-message')).toBeVisible();
  await page.goto(`${baseUrl}/moderator-dashboard`);
  await page.click('.override-button');
  await expect(page.locator('.flagged-message')).not.toBeVisible();
});