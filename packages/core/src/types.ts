// --- Article ---

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  author?: string;
  url: string;
  content: string;        // HTML content or summary from the backend
  publishedAt: Date;
  isRead: boolean;
  isStarred: boolean;
}

// --- Source ---

export interface Source {
  id: string;
  title: string;
  siteUrl?: string;
  feedUrl: string;
  faviconUrl?: string;
  categoryId?: string;
  // Stream-specific — stored in IndexedDB, never sent to the backend
  velocityTier: 1 | 2 | 3 | 4 | 5;   // defaults to 3 (Article, 24h)
  customHalfLife?: number;             // hours; overrides tier when set
  isVoice: boolean;
}

// --- Category ---

export interface Category {
  id: string;
  title: string;
}

// --- Adapter config / auth ---

export interface AdapterConfig {
  baseUrl?: string;       // for self-hosted adapters
  username?: string;
  password?: string;
  apiKey?: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

// --- Fetch options / result ---

export interface FetchOptions {
  since?: Date;
  limit?: number;
  continuation?: string;  // opaque pagination token
}

export interface FetchResult {
  articles: Article[];
  continuation?: string;
  hasMore: boolean;
}

// --- Adapter interface ---

export interface StreamAdapter {
  readonly id: string;
  readonly name: string;

  authenticate(config: AdapterConfig): Promise<AuthResult>;
  isAuthenticated(): boolean;

  fetchArticles(options?: FetchOptions): Promise<FetchResult>;
  fetchSources(): Promise<Source[]>;
  fetchCategories(): Promise<Category[]>;

  setArticleRead(articleId: string): Promise<void>;
  setArticleStarred(articleId: string, starred: boolean): Promise<void>;

  addSource(feedUrl: string): Promise<Source>;
  removeSource(sourceId: string): Promise<void>;
  importOPML(opmlXml: string): Promise<Source[]>;
}
