import { test, expect } from '@playwright/test';
import { mockCaptionStream } from '../mocks/captionStream';
import { mockSignlangAvatar } from '../mocks/signlangAvatar';

test.beforeEach(async ({ page }) => {
  await page.route('/api/streams/1/captions', mockCaptionStream);
  await page.route('https://signlang-avatar/api/sign', mockSignlangAvatar);
});

test('sign language avatar functionality', async ({ page }) => {
  await page.goto('/stream/1');
  await page.getByLabel('Accessibility Settings').click();
  const toggle = page.getByLabel('Sign Language Avatar');
  await expect(toggle).toBeVisible();
  await toggle.click();
  const avatar = page.locator('.sign-language-avatar');
  await expect(avatar).toBeVisible();
  await mockCaptionStream.emit('caption', { text: 'Hello world' });
  await expect(avatar).toContainText('Hello world');
});

test('fallback when WebGL is unavailable', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebGL support varies by browser');
  await page.goto('/stream/1');
  await page.evaluate(() => {
    // Simulate WebGL failure
    window.WebGLRenderingContext = undefined;
  });
  await page.reload();
  const toggle = page.getByLabel('Sign Language Avatar');
  await expect(toggle).not.toBeVisible();
  await expect(page.locator('.sign-language-fallback')).toBeVisible();
});

test('drag-to-reposition functionality', async ({ page }) => {
  await page.goto('/stream/1');
  await page.getByLabel('Accessibility Settings').click();
  const toggle = page.getByLabel('Sign Language Avatar');
  await toggle.click();
  const avatar = page.locator('.sign-language-avatar');
  const initialBoundingBox = await avatar.boundingBox();
  await avatar.dragTo(page.locator('.video-player-container'));
  const finalBoundingBox = await avatar.boundingBox();
  expect(finalBoundingBox.x).not.toBe(initialBoundingBox.x);
  expect(finalBoundingBox.y).not.toBe(initialBoundingBox.y);
});

test('responsive behavior', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop test');
  await page.goto('/stream/1');
  await page.getByLabel('Accessibility Settings').click();
  const toggle = page.getByLabel('Sign Language Avatar');
  await toggle.click();
  const avatar = page.locator('.sign-language-avatar');
  await expect(avatar).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const largeSize = await avatar.boundingBox();
  await page.setViewportSize({ width: 375, height: 667 });
  const smallSize = await avatar.boundingBox();
  expect(smallSize.width).toBeLessThan(largeSize.width);
  expect(smallSize.height).toBeLessThan(largeSize.height);
});