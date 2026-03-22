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

/**
 * FreshRSS adapter — Google Reader API.
 * Endpoint: {baseUrl}/api/greader.php
 * Auth: ClientLogin — POST credentials, receive an Auth token.
 */
export class FreshRSSAdapter implements StreamAdapter {
  readonly id = 'freshrss';
  readonly name = 'FreshRSS';

  private baseUrl = '';
  private authToken: string | null = null;

  async authenticate(config: AdapterConfig): Promise<AuthResult> {
    const url = `${config.baseUrl}/api/greader.php/accounts/ClientLogin`;

    const body = new URLSearchParams({
      Email: config.username ?? '',
      Passwd: config.password ?? '',
    });

    const response = await fetch(url, { method: 'POST', body });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const match = text.match(/^Auth=(.+)$/m);

    if (!match) {
      return { success: false, error: 'Auth token not found in response' };
    }

    this.baseUrl = config.baseUrl ?? '';
    this.authToken = match[1];
    return { success: true, token: this.authToken };
  }

  isAuthenticated(): boolean {
    return this.authToken !== null;
  }

  async fetchArticles(options: FetchOptions = {}): Promise<FetchResult> {
    // TODO: implement Google Reader stream/contents endpoint
    void options;
    return { articles: [], hasMore: false };
  }

  async fetchSources(): Promise<Source[]> {
    // TODO: implement /subscription/list
    return [];
  }

  async fetchCategories(): Promise<Category[]> {
    // TODO: implement /tag/list
    return [];
  }

  async setArticleRead(articleId: string): Promise<void> {
    void articleId;
  }

  async setArticleStarred(articleId: string, starred: boolean): Promise<void> {
    void articleId;
    void starred;
  }

  async addSource(feedUrl: string): Promise<Source> {
    void feedUrl;
    throw new Error('Not implemented');
  }

  async removeSource(sourceId: string): Promise<void> {
    void sourceId;
  }

  async importOPML(opmlXml: string): Promise<Source[]> {
    void opmlXml;
    return [];
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `GoogleLogin auth=${this.authToken}` };
  }
}
