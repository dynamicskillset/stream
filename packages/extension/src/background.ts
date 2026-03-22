import browser from 'webextension-polyfill';

// Service worker for Stream extension (Manifest V3).
// Primary role: proxy fetch() calls from the main UI tab to the user's
// configured RSS backend, bypassing CORS restrictions.

browser.action.onClicked.addListener(async () => {
  await browser.tabs.create({ url: browser.runtime.getURL('index.html') });
});

// TODO: Phase 1 — add message listener for proxied fetch requests.
// The main UI will send messages of the form { type: 'FETCH', url, init }
// and this worker will perform the fetch and return the response.
