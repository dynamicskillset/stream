import type {
  StreamAdapter,
  AdapterConfig,
  AuthResult,
  FetchOptions,
  FetchResult,
  Source,
  Category,
  Article,
} from '../types.js';

// ---------------------------------------------------------------------------
// Raw Google Reader API shapes
// ---------------------------------------------------------------------------

interface RawSubscription {
  id: string;           // "feed/https://..."
  title: string;
  htmlUrl: string;
  url?: string;
  iconUrl?: string;
  categories?: Array<{ id: string; label: string }>;
}

interface RawTag {
  id: string;           // "user/-/label/NAME"
}

interface RawItem {
  id: string;           // "tag:google.com,2005:reader/item/HEX"
  title?: string | { content: string };
  canonical?: Array<{ href: string }>;
  alternate?: Array<{ href: string }>;
  author?: string;
  published?: number;   // unix seconds
  summary?: { content: string };
  content?: { content: string };
  origin?: { streamId: string };
  categories?: string[];
}

interface RawStreamContents {
  items?: RawItem[];
  continuation?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTitle(raw: RawItem['title']): string {
  if (!raw) return '(no title)';
  if (typeof raw === 'string') return raw;
  return raw.content ?? '(no title)';
}

function normaliseItem(item: RawItem): Article {
  const url =
    item.canonical?.[0]?.href ??
    item.alternate?.[0]?.href ??
    '';

  const content =
    item.content?.content ??
    item.summary?.content ??
    '';

  const isRead =
    item.categories?.includes('user/-/state/com.google/read') ?? false;
  const isStarred =
    item.categories?.includes('user/-/state/com.google/starred') ?? false;

  return {
    id:          item.id,
    sourceId:    item.origin?.streamId ?? '',
    title:       extractTitle(item.title),
    author:      item.author,
    url,
    content,
    publishedAt: new Date((item.published ?? 0) * 1000),
    isRead,
    isStarred,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * FreshRSS adapter — Google Reader API (`/api/greader.php`).
 *
 * Auth flow:
 *   1. POST ClientLogin → Auth token (long-lived)
 *   2. GET /reader/api/0/token → T-token (short-lived CSRF, cached)
 *
 * All state-mutating POSTs require the T-token appended as `T=...`.
 * On a 401/403 POST response, the T-token is invalidated and re-fetched once.
 */
export class FreshRSSAdapter implements StreamAdapter {
  readonly id   = 'freshrss';
  readonly name = 'FreshRSS';

  private baseUrl:    string      = '';
  private authToken:  string|null = null;
  private tToken:     string|null = null;

  // --- Authentication -------------------------------------------------------

  async authenticate(config: AdapterConfig): Promise<AuthResult> {
    const url = `${config.baseUrl}/api/greader.php/accounts/ClientLogin`;

    const body = new URLSearchParams({
      Email:  config.username ?? '',
      Passwd: config.password ?? '',
    });

    const res = await fetch(this.proxyUrl(url), { method: 'POST', body });

    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          error: 'Authentication failed (401). FreshRSS uses a separate API password — set one under Settings → Profile → API management, then use that here instead of your login password.',
        };
      }
      return { success: false, error: `HTTP ${res.status}` };
    }

    const text  = await res.text();
    const match = text.match(/^Auth=(.+)$/m);

    if (!match) {
      return { success: false, error: 'Auth token missing in response' };
    }

    this.baseUrl   = config.baseUrl ?? '';
    this.authToken = match[1].trim();
    this.tToken    = null; // reset on new auth

    return { success: true, token: this.authToken };
  }

  isAuthenticated(): boolean {
    return this.authToken !== null;
  }

  // --- T-token --------------------------------------------------------------

  private async fetchTToken(): Promise<string> {
    const res = await fetch(
      this.proxyUrl(`${this.baseUrl}/api/greader.php/reader/api/0/token`),
      { headers: this.authHeaders() },
    );
    if (!res.ok) throw new Error(`T-token fetch failed: HTTP ${res.status}`);
    return (await res.text()).trim();
  }

  private async getTToken(): Promise<string> {
    if (!this.tToken) this.tToken = await this.fetchTToken();
    return this.tToken;
  }

  // --- POST helper with T-token + retry on invalid token ------------------

  private async postForm(
    path: string,
    params: Record<string, string>,
  ): Promise<Response> {
    const t = await this.getTToken();
    const body = new URLSearchParams({ ...params, T: t });

    const postUrl = this.proxyUrl(`${this.baseUrl}/api/greader.php${path}`);

    let res = await fetch(postUrl, {
      method:  'POST',
      headers: this.authHeaders(),
      body,
    });

    // Retry once if token expired
    if (res.status === 401 || res.status === 403) {
      this.tToken = null;
      const t2    = await this.getTToken();
      body.set('T', t2);
      res = await fetch(postUrl, {
        method:  'POST',
        headers: this.authHeaders(),
        body,
      });
    }

    return res;
  }

  // --- Data -----------------------------------------------------------------

  async fetchSources(): Promise<Source[]> {
    const res = await fetch(
      this.proxyUrl(`${this.baseUrl}/api/greader.php/reader/api/0/subscription/list?output=json`),
      { headers: this.authHeaders() },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`fetchSources failed: HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }

    const data: { subscriptions?: RawSubscription[] } = await res.json();

    return (data.subscriptions ?? []).map(sub => ({
      id:            sub.id,
      title:         sub.title,
      siteUrl:       sub.htmlUrl,
      feedUrl:       sub.url ?? sub.id.replace(/^feed\//, ''),
      faviconUrl:    sub.iconUrl,
      categoryId:    sub.categories?.[0]?.id,
      velocityTier:  3 as const,
      isVoice:       false,
    }));
  }

  async fetchCategories(): Promise<Category[]> {
    const res = await fetch(
      this.proxyUrl(`${this.baseUrl}/api/greader.php/reader/api/0/tag/list?output=json`),
      { headers: this.authHeaders() },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`fetchCategories failed: HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }

    const data: { tags?: RawTag[] } = await res.json();

    return (data.tags ?? [])
      .filter(t => t.id.includes('/label/'))
      .map(t => ({
        id:    t.id,
        title: t.id.replace(/^.*\/label\//, ''),
      }));
  }

  async fetchArticles(options: FetchOptions = {}): Promise<FetchResult> {
    const params = new URLSearchParams({ output: 'json', n: '100' });

    if (options.since) {
      params.set('ot', String(Math.floor(options.since.getTime() / 1000)));
    }
    if (options.continuation) {
      params.set('c', options.continuation);
    }

    const res = await fetch(
      this.proxyUrl(`${this.baseUrl}/api/greader.php/reader/api/0/stream/contents/reading-list?${params}`),
      { headers: this.authHeaders() },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`fetchArticles failed: HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }

    const data: RawStreamContents = await res.json();
    const articles = (data.items ?? []).map(normaliseItem);

    return {
      articles,
      continuation: data.continuation,
      hasMore:      !!data.continuation,
    };
  }

  // --- State ----------------------------------------------------------------

  async setArticleRead(articleId: string): Promise<void> {
    await this.postForm('/reader/api/0/edit-tag', {
      i: articleId,
      a: 'user/-/state/com.google/read',
    });
  }

  async setArticleStarred(articleId: string, starred: boolean): Promise<void> {
    await this.postForm('/reader/api/0/edit-tag', {
      i: articleId,
      [starred ? 'a' : 'r']: 'user/-/state/com.google/starred',
    });
  }

  // --- Subscription management ---------------------------------------------

  async setSourceCategory(sourceId: string, categoryId: string): Promise<void> {
    const res = await this.postForm('/reader/api/0/subscription/edit', {
      ac: 'edit',
      s:  sourceId,
      a:  categoryId,  // e.g. "user/-/label/Technology" — created implicitly if new
    });
    if (!res.ok) throw new Error(`setSourceCategory failed: HTTP ${res.status}`);
  }

  async addSource(feedUrl: string): Promise<Source> {
    const res = await this.postForm('/reader/api/0/subscription/quickadd', {
      quickadd: feedUrl,
    });
    if (!res.ok) throw new Error(`addSource failed: HTTP ${res.status}`);

    // quickadd returns { streamId: "feed/https://..." } — use that to find the
    // new entry reliably, since FreshRSS may normalise the URL during storage.
    let streamId: string | undefined;
    try {
      const data = await res.json();
      streamId = typeof data?.streamId === 'string' ? data.streamId : undefined;
    } catch { /* response may not be JSON on older versions */ }

    const sources = await this.fetchSources();

    const added =
      (streamId ? sources.find(s => s.id === streamId) : undefined) ??
      sources.find(s => s.feedUrl === feedUrl);

    if (!added) throw new Error('Feed added but not found in subscription list');
    return added;
  }

  async removeSource(sourceId: string): Promise<void> {
    const res = await this.postForm('/reader/api/0/subscription/edit', {
      ac: 'unsubscribe',
      s:  sourceId,
    });
    if (!res.ok) throw new Error(`removeSource failed: HTTP ${res.status}`);
  }

  async importOPML(opmlXml: string): Promise<Source[]> {
    // FreshRSS has no native OPML import endpoint — add feeds individually.
    // Batches the verification fetchSources to a single call at the end, and
    // reads parent <outline> elements to preserve OPML category structure.
    const parser = new DOMParser();
    const doc    = parser.parseFromString(opmlXml, 'application/xml');

    // Collect entries with their OPML category (parent outline text/title)
    const entries: Array<{ url: string; categoryName?: string }> = [];
    for (const el of Array.from(doc.querySelectorAll('outline[xmlUrl]'))) {
      const url = el.getAttribute('xmlUrl');
      if (!url) continue;
      const parent    = el.parentElement;
      const rawCat    = parent?.tagName.toLowerCase() === 'outline'
        ? (parent.getAttribute('text') || parent.getAttribute('title'))
        : null;
      entries.push({ url, categoryName: rawCat || undefined });
    }

    // quickadd each feed; collect streamIds for a single fetchSources at the end
    const pending: Array<{ streamId?: string; url: string; categoryName?: string }> = [];
    for (const { url, categoryName } of entries) {
      try {
        const res = await this.postForm('/reader/api/0/subscription/quickadd', { quickadd: url });
        if (!res.ok) continue;
        let streamId: string | undefined;
        try {
          const data = await res.json();
          if (typeof data?.streamId === 'string') streamId = data.streamId;
        } catch { /* older FreshRSS may not return JSON */ }
        pending.push({ streamId, url, categoryName });
      } catch { /* skip unreachable feeds */ }
    }

    if (pending.length === 0) return [];

    // One fetchSources for the whole batch
    const allSources = await this.fetchSources();
    const byId  = new Map(allSources.map(s => [s.id,      s]));
    const byUrl = new Map(allSources.map(s => [s.feedUrl, s]));

    const result: Source[] = [];
    for (const { streamId, url, categoryName } of pending) {
      const source = (streamId ? byId.get(streamId) : undefined) ?? byUrl.get(url);
      if (!source) continue;
      if (categoryName) {
        try {
          await this.setSourceCategory(source.id, `user/-/label/${categoryName}`);
        } catch { /* category assignment is best-effort */ }
      }
      result.push(source);
    }
    return result;
  }

  // --- Private --------------------------------------------------------------

  private authHeaders(): HeadersInit {
    return { Authorization: `GoogleLogin auth=${this.authToken}` };
  }

  /**
   * Routes requests through a same-origin proxy to avoid CORS restrictions.
   *
   * - Dev: Vite's devProxyPlugin handles /dev-proxy.
   * - Production (Netlify): VITE_PROXY_URL is set to /.netlify/functions/proxy.
   * - Other production hosts: VITE_PROXY_URL can point to any compatible proxy,
   *   or leave unset to make direct requests (requires CORS headers on the backend).
   */
  private proxyUrl(url: string): string {
    if (import.meta.env.DEV) {
      return `/dev-proxy?url=${encodeURIComponent(url)}`;
    }
    const base = import.meta.env.VITE_PROXY_URL;
    if (base) {
      return `${base}?url=${encodeURIComponent(url)}`;
    }
    return url;
  }
}
