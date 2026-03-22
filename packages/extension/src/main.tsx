import { render } from 'preact';
import browser from 'webextension-polyfill';
import { App } from 'stream-core';

// ---------------------------------------------------------------------------
// CORS proxy — route all http/https fetch calls through the background
// service worker, which is not subject to CORS restrictions.
// ---------------------------------------------------------------------------

const _fetch = window.fetch.bind(window);

window.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === 'string'   ? input :
    input instanceof URL        ? input.href :
    (input as Request).url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const reqHeaders: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => { reqHeaders[k] = v; });
    }

    const result = await browser.runtime.sendMessage({
      type:    'FETCH',
      url,
      method:  init?.method ?? 'GET',
      headers: reqHeaders,
      body:    init?.body as string | undefined,
    }) as {
      ok:      boolean;
      status:  number;
      body:    string;
      headers: Record<string, string>;
    };

    return new Response(result.body, {
      status:  result.status,
      headers: result.headers,
    });
  }

  return _fetch(input, init);
};

// ---------------------------------------------------------------------------

const root = document.getElementById('app');
if (!root) throw new Error('Mount element #app not found.');
render(<App />, root);
