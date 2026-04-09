import { test, expect } from '@playwright/test';
import { mockFreshRSSRoutes, seedConnection, waitForRiver } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await mockFreshRSSRoutes(page);
  await seedConnection(page);
});

// ---------------------------------------------------------------------------
// 1. River loads from the network
// ---------------------------------------------------------------------------

test('river loads articles from backend', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  const headings = page.locator('article h2');
  await expect(headings).toHaveCount(3);
  await expect(headings.first()).toContainText('Breakthrough in quantum computing');
});

// ---------------------------------------------------------------------------
// 2. Connect screen → river (first-run: no saved connection)
// ---------------------------------------------------------------------------

test('connect screen appears without saved connection', async ({ page }) => {
  // Override seed: clear the connection so connect screen appears
  await page.addInitScript(() => {
    localStorage.removeItem('stream-connection');
    localStorage.removeItem('stream-article-cache');
  });
  await page.goto('/');
  // Connect screen has a heading or a form
  await expect(page.locator('form, [data-connect], h1, h2').first()).toBeVisible({ timeout: 5_000 });
  // No articles yet
  await expect(page.locator('article h2')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3. Article opens in reading view (mouse click)
// ---------------------------------------------------------------------------

test('clicking an article opens the reading view', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  // Click the article title link / open button
  const firstTitle = page.locator('article h2').first();
  await firstTitle.click();

  // Reading view should appear — it contains the article title as a heading
  await expect(page.locator('[role="dialog"] h1, [role="dialog"] h2').first()).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// 4. Article opens in reading view (keyboard Enter)
// ---------------------------------------------------------------------------

test('pressing Enter on focused article opens reading view', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  // j initialises focusedIndex to 0; wait for DOM to reflect focus before Enter
  await page.keyboard.press('j');
  await page.waitForSelector('article[aria-current="true"]', { timeout: 3_000 });
  await page.keyboard.press('Enter');

  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// 5. Dismiss article (keyboard d)
// ---------------------------------------------------------------------------

test('pressing d dismisses the focused article', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  const initialCount = await page.locator('article').count();

  // j initialises focusedIndex to 0; wait for DOM to reflect focus before d
  await page.keyboard.press('j');
  await page.waitForSelector('article[aria-current="true"]', { timeout: 3_000 });
  await page.keyboard.press('d');

  // One fewer article, undo toast appears
  await expect(page.locator('article')).toHaveCount(initialCount - 1);
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. Save / unsave article (keyboard s)
// ---------------------------------------------------------------------------

test('pressing s saves then unsaves an article', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  // j initialises focusedIndex to 0; wait for DOM to reflect focus before s
  await page.keyboard.press('j');
  await page.waitForSelector('article[aria-current="true"]', { timeout: 3_000 });

  const firstArticle = page.locator('article').first();
  const saveBtn   = firstArticle.getByRole('button', { name: 'Save to Read Later' });
  const savedBtn  = firstArticle.getByRole('button', { name: 'Saved' });

  await expect(saveBtn).toBeVisible();

  // Save
  await page.keyboard.press('s');
  await expect(savedBtn).toBeVisible({ timeout: 3_000 });

  // Unsave
  await page.keyboard.press('s');
  await expect(saveBtn).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// 7. Settings panel opens and closes
// ---------------------------------------------------------------------------

test('settings panel opens and closes', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  await page.getByRole('button', { name: /settings/i }).click();
  // Settings panel is now visible — contains source management content
  await expect(page.locator('h2, h3').filter({ hasText: /settings|sources|velocity/i }).first()).toBeVisible({ timeout: 5_000 });

  // Close via the header settings button (second "Back to stream" button — first is the logo)
  await page.getByRole('button', { name: /back to stream/i }).nth(1).click();
  // River is visible again
  await expect(page.locator('article h2').first()).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// 8. Theme toggle persists
// ---------------------------------------------------------------------------

test('theme toggle switches between paper and ink', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  const html = page.locator('html');
  // Default is paper (light) — no data-theme attribute or data-theme="paper"
  // Start in paper (light) — no data-theme attribute
  await expect(html).not.toHaveAttribute('data-theme');

  await page.getByRole('button', { name: /switch to dark mode/i }).click();

  // Now in ink (dark)
  await expect(html).toHaveAttribute('data-theme', 'ink');

  await page.getByRole('button', { name: /switch to light mode/i }).click();

  // Back to paper — attribute removed
  await expect(html).not.toHaveAttribute('data-theme');
});

// ---------------------------------------------------------------------------
// 9. Category filter narrows the river
// ---------------------------------------------------------------------------

test('selecting a category filters articles to that category', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  // Click the "Tech" category pill
  await page.getByRole('button', { name: /tech/i }).first().click();

  // Only tech articles remain — "New species discovered" (Science) should be gone
  const headings = page.locator('article h2');
  await expect(headings.filter({ hasText: /species/i })).toHaveCount(0);
  // At least one tech article is visible
  await expect(headings.filter({ hasText: /quantum|open source/i }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 10. Unread filter hides read articles
// ---------------------------------------------------------------------------

test('unread filter shows only unread articles', async ({ page }) => {
  await page.goto('/');
  await waitForRiver(page);

  const totalBefore = await page.locator('article').count();

  await page.getByRole('button', { name: 'Unread', exact: true }).click();

  // All fixture articles are unread, so count should stay the same
  await expect(page.locator('article')).toHaveCount(totalBefore);

  // Toggle back off
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(totalBefore);
});
