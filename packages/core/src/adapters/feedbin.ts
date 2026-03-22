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

/**
 * Feedbin adapter — Feedbin REST API.
 * Auth: HTTP Basic (email + password) on every request.
 * Docs: https://github.com/feedbin/feedbin-api
 */
export class FeedbinAdapter implements StreamAdapter {
  readonly id = 'feedbin';
  readonly name = 'Feedbin';

  private credentials: string | null = null;   // base64 email:password

  async authenticate(config: AdapterConfig): Promise<AuthResult> {
    this.credentials = btoa(`${config.username ?? ''}:${config.password ?? ''}`);

    const response = await fetch(`${FEEDBIN_BASE}/authentication.json`, {
      headers: this.authHeaders(),
    });

    if (response.status === 200) {
      return { success: true };
    }

    this.credentials = null;
    return { success: false, error: `HTTP ${response.status}` };
  }

  isAuthenticated(): boolean {
    return this.credentials !== null;
  }

  async fetchArticles(options: FetchOptions = {}): Promise<FetchResult> {
    // TODO: GET /entries.json?since=&per_page=&page=
    void options;
    return { articles: [], hasMore: false };
  }

  async fetchSources(): Promise<Source[]> {
    // TODO: GET /subscriptions.json
    return [];
  }

  async fetchCategories(): Promise<Category[]> {
    // TODO: GET /taggings.json (Feedbin uses tag-based grouping)
    return [];
  }

  async setArticleRead(articleId: string): Promise<void> {
    // TODO: POST /unread_entries/delete.json
    void articleId;
  }

  async setArticleStarred(articleId: string, starred: boolean): Promise<void> {
    // TODO: POST /starred_entries.json or DELETE
    void articleId;
    void starred;
  }

  async addSource(feedUrl: string): Promise<Source> {
    // TODO: POST /subscriptions.json { feed_url }
    void feedUrl;
    throw new Error('Not implemented');
  }

  async removeSource(sourceId: string): Promise<void> {
    // TODO: DELETE /subscriptions/{id}.json
    void sourceId;
  }

  async importOPML(opmlXml: string): Promise<Source[]> {
    // Feedbin has no native OPML import endpoint.
    // Phase 2: parse OPML client-side, POST each feed URL individually.
    void opmlXml;
    return [];
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `Basic ${this.credentials}` };
  }
}
