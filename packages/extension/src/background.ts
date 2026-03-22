import browser from 'webextension-polyfill';

// Service worker for Stream extension (Manifest V3).
//
// Responsibilities:
//   1. Open the Stream tab when the toolbar icon is clicked.
//   2. Proxy fetch() calls from the tab — extension service workers are not
//      subject to CORS, so they can reach any configured RSS backend.

browser.action.onClicked.addListener(async () => {
  await browser.tabs.create({ url: browser.runtime.getURL('index.html') });
});

// ---------------------------------------------------------------------------
// CORS proxy — message protocol
//
// Request:  { type: 'FETCH', url, method?, headers?, body? }
// Response: { ok, status, body, headers }
// ---------------------------------------------------------------------------

interface FetchRequest {
  type:     'FETCH';
  url:      string;
  method?:  string;
  headers?: Record<string, string>;
  body?:    string;
}

interface FetchResponse {
  ok:      boolean;
  status:  number;
  body:    string;
  headers: Record<string, string>;
}

browser.runtime.onMessage.addListener(
  (message: unknown): Promise<FetchResponse> | false => {
    if (!message || typeof message !== 'object') return false;
    const msg = message as Partial<FetchRequest>;
    if (msg.type !== 'FETCH' || !msg.url) return false;

    const isBodyless = !msg.method || msg.method === 'GET' || msg.method === 'HEAD';

    return fetch(msg.url, {
      method:  msg.method  ?? 'GET',
      headers: msg.headers ?? {},
      body:    isBodyless ? undefined : msg.body,
    }).then(async res => ({
      ok:      res.ok,
      status:  res.status,
      body:    await res.text(),
      headers: Object.fromEntries(res.headers.entries()),
    }));
  },
);
