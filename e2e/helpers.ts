import type { Page, Route } from '@playwright/test';
import {
  AUTH_RESPONSE,
  T_TOKEN_RESPONSE,
  SUBSCRIPTIONS_RESPONSE,
  TAGS_RESPONSE,
  STREAM_RESPONSE,
  SAVED_CONNECTION,
  BASE_URL,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Route mocking — intercepts all FreshRSS API calls
// ---------------------------------------------------------------------------

export async function mockFreshRSSRoutes(page: Page) {
  await page.route(`${BASE_URL}/api/greader.php/accounts/ClientLogin`, (route: Route) => {
    route.fulfill({ status: 200, body: AUTH_RESPONSE, contentType: 'text/plain' });
  });

  await page.route(`${BASE_URL}/api/greader.php/reader/api/0/token`, (route: Route) => {
    route.fulfill({ status: 200, body: T_TOKEN_RESPONSE, contentType: 'text/plain' });
  });

  await page.route(`${BASE_URL}/api/greader.php/reader/api/0/subscription/list*`, (route: Route) => {
    route.fulfill({ status: 200, json: SUBSCRIPTIONS_RESPONSE });
  });

  await page.route(`${BASE_URL}/api/greader.php/reader/api/0/tag/list*`, (route: Route) => {
    route.fulfill({ status: 200, json: TAGS_RESPONSE });
  });

  await page.route(`${BASE_URL}/api/greader.php/reader/api/0/stream/**`, (route: Route) => {
    route.fulfill({ status: 200, json: STREAM_RESPONSE });
  });

  // Mark-as-read / starred POSTs — just acknowledge
  await page.route(`${BASE_URL}/api/greader.php/reader/api/0/edit-tag**`, (route: Route) => {
    route.fulfill({ status: 200, body: 'OK', contentType: 'text/plain' });
  });
}

// ---------------------------------------------------------------------------
// Seed localStorage so tests start with a live river, not the connect screen
// ---------------------------------------------------------------------------

export async function seedConnection(page: Page) {
  await page.addInitScript((conn) => {
    localStorage.setItem('stream-connection', JSON.stringify(conn));
    // Clear state that can leak between tests
    localStorage.removeItem('stream-article-cache');
    localStorage.removeItem('stream-active-category');
    localStorage.removeItem('stream-theme'); // ensure consistent paper (light) start
  }, SAVED_CONNECTION);
}

// ---------------------------------------------------------------------------
// Wait for the river to be fully loaded
// ---------------------------------------------------------------------------

export async function waitForRiver(page: Page) {
  // The river renders article headings once data loads
  await page.waitForSelector('article h2', { timeout: 10_000 });
}
