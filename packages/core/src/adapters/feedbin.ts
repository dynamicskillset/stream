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

const FEEDBIN_BASE = 'https://api.feedbin.com/v2';

// ---------------------------------------------------------------------------
// Raw Feedbin API shapes
// ---------------------------------------------------------------------------

interface RawEntry {
  id:         number;
  feed_id:    number;
  title:      string | null;
  author:     string | null;
  summary:    string | null;
  content:    string | null;
  url:        string;
  published:  string;   // ISO 8601
  created_at: string;   // ISO 8601
}

interface RawSubscription {
  id:        number;
  feed_id:   number;
  title:     string;
  feed_url:  string;
  site_url:  string;
  json_feed?: { favicon?: string; favicon_url?: string } | null;
}

interface RawTagging {
  id:      number;
  feed_id: number;
  name:    string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLinkNextPage(header: string | null): number | undefined {
  if (!header) return undefined;
  const m = header.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
  return m ? parseInt(m[1], 10) : undefined;
}

function normaliseSource(sub: RawSubscription): Source {
  return {
    id:           String(sub.feed_id),
    title:        sub.title,
    siteUrl:      sub.site_url || undefined,
    feedUrl:      sub.feed_url,
    faviconUrl:   sub.json_feed?.favicon_url ?? sub.json_feed?.favicon ?? undefined,
    velocityTier: 3 as const,
    isVoice:      false,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Feedbin adapter — Feedbin REST API v2.
 * Auth: HTTP Basic (email + password) on every request.
 * Docs: https://github.com/feedbin/feedbin-api
 *
 * Note: Feedbin supports CORS, so no dev-proxy is needed.
 *
 * source.id = String(feed_id) — matches entry.feed_id for sourceMap lookups.
 * A private map caches feed_id → subscription.id for removeSource.
 */
export class FeedbinAdapter implements StreamAdapter {
  readonly id   = 'feedbin';
  readonly name = 'Feedbin';

  private credentials:     string | null        = null;
  private feedIdToSubId  = new Map<string, string>();
  private unreadIds      = new Set<string>();
  private starredIds     = new Set<string>();

  // --- Authentication -------------------------------------------------------

  async authenticate(config: AdapterConfig): Promise<AuthResult> {
    this.credentials = btoa(`${config.username ?? ''}:${config.password ?? ''}`);

    const res = await fetch(`${FEEDBIN_BASE}/authentication.json`, {
      headers: this.authHeaders(),
    });

    if (res.status === 200) return { success: true };

    this.credentials = null;
    return {
      success: false,
      error: res.status === 401
        ? 'Invalid email or password.'
        : `HTTP ${res.status}`,
    };
  }

  isAuthenticated(): boolean {
    return this.credentials !== null;
  }

  // --- Data -----------------------------------------------------------------

  async fetchSources(): Promise<Source[]> {
    const res = await fetch(`${FEEDBIN_BASE}/subscriptions.json`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`fetchSources failed: HTTP ${res.status}`);

    const subs: RawSubscription[] = await res.json();

    this.feedIdToSubId.clear();
    for (const sub of subs) {
      this.feedIdToSubId.set(String(sub.feed_id), String(sub.id));
    }

    return subs.map(normaliseSource);
  }

  async fetchCategories(): Promise<Category[]> {
    const res = await fetch(`${FEEDBIN_BASE}/taggings.json`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`fetchCategories failed: HTTP ${res.status}`);

    const taggings: RawTagging[] = await res.json();

    // Deduplicate by name — taggings are per feed, categories are named tags
    const seen = new Map<string, Category>();
    for (const t of taggings) {
      if (!seen.has(t.name)) seen.set(t.name, { id: t.name, title: t.name });
    }
    return [...seen.values()];
  }

  async fetchArticles(options: FetchOptions = {}): Promise<FetchResult> {
    const params = new URLSearchParams({ per_page: '100' });
    if (options.since)        params.set('since', options.since.toISOString());
    if (options.continuation) params.set('page',  options.continuation);

    // On the first page, refresh unread + starred ID sets in parallel
    const [entriesRes, freshUnread, freshStarred] = await Promise.all([
      fetch(`${FEEDBIN_BASE}/entries.json?${params}`, { headers: this.authHeaders() }),
      options.continuation ? null : this.fetchIdList('unread_entries'),
      options.continuation ? null : this.fetchIdList('starred_entries'),
    ]);

    if (!entriesRes.ok) throw new Error(`fetchArticles failed: HTTP ${entriesRes.status}`);

    if (freshUnread  !== null) this.unreadIds  = new Set(freshUnread.map(String));
    if (freshStarred !== null) this.starredIds = new Set(freshStarred.map(String));

    const rawEntries: RawEntry[] = await entriesRes.json();
    const nextPage = parseLinkNextPage(entriesRes.headers.get('Link'));

    const articles: Article[] = rawEntries.map(e => ({
      id:          String(e.id),
      sourceId:    String(e.feed_id),
      title:       e.title ?? '(no title)',
      author:      e.author ?? undefined,
      url:         e.url,
      content:     e.content ?? e.summary ?? '',
      publishedAt: new Date(e.published),
      isRead:      !this.unreadIds.has(String(e.id)),
      isStarred:   this.starredIds.has(String(e.id)),
    }));

    return {
      articles,
      continuation: nextPage ? String(nextPage) : undefined,
      hasMore:      nextPage !== undefined,
    };
  }

  // --- State ----------------------------------------------------------------

  async setArticleRead(articleId: string): Promise<void> {
    await fetch(`${FEEDBIN_BASE}/unread_entries.json`, {
      method:  'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ unread_entries: [parseInt(articleId, 10)] }),
    });
  }

  async setArticleStarred(articleId: string, starred: boolean): Promise<void> {
    await fetch(`${FEEDBIN_BASE}/starred_entries.json`, {
      method:  starred ? 'POST' : 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ starred_entries: [parseInt(articleId, 10)] }),
    });
  }

  // --- Subscription management ---------------------------------------------

  async addSource(feedUrl: string): Promise<Source> {
    const res = await fetch(`${FEEDBIN_BASE}/subscriptions.json`, {
      method:  'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ feed_url: feedUrl }),
    });
    // 201 Created or 302 (multiple feeds found — first match returned)
    if (!res.ok && res.status !== 302) {
      throw new Error(`addSource failed: HTTP ${res.status}`);
    }
    const sub: RawSubscription = await res.json();
    this.feedIdToSubId.set(String(sub.feed_id), String(sub.id));
    return normaliseSource(sub);
  }

  async removeSource(sourceId: string): Promise<void> {
    const subId = this.feedIdToSubId.get(sourceId);
    if (!subId) throw new Error('Subscription ID not found — call fetchSources first');

    const res = await fetch(`${FEEDBIN_BASE}/subscriptions/${subId}.json`, {
      method:  'DELETE',
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`removeSource failed: HTTP ${res.status}`);
  }

  async importOPML(opmlXml: string): Promise<Source[]> {
    const parser   = new DOMParser();
    const doc      = parser.parseFromString(opmlXml, 'application/xml');
    const outlines = Array.from(doc.querySelectorAll('outline[xmlUrl]'));

    const added: Source[] = [];
    for (const el of outlines) {
      const url = el.getAttribute('xmlUrl');
      if (url) {
        try { added.push(await this.addSource(url)); } catch { /* skip on error */ }
      }
    }
    return added;
  }

  // --- Private --------------------------------------------------------------

  private authHeaders(): HeadersInit {
    return { Authorization: `Basic ${this.credentials}` };
  }

  private async fetchIdList(resource: 'unread_entries' | 'starred_entries'): Promise<number[]> {
    const res = await fetch(`${FEEDBIN_BASE}/${resource}.json`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  }
}
