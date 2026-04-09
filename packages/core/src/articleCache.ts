import type { Article, Category, Source } from './types.js';

// ---------------------------------------------------------------------------
// Article cache — stale-while-revalidate for fast startup
//
// Serialises the last successful full fetch to localStorage so returning
// users see their river immediately instead of waiting for the network.
// The cache is always revalidated in the background after it is served.
// ---------------------------------------------------------------------------

const CACHE_KEY    = 'stream-article-cache';
const MAX_ARTICLES = 300; // guard against localStorage quota (~5–10 MB)

interface CachedRiver {
  articles:   Article[];
  sources:    Source[];
  categories: Category[];
  cachedAt:   number; // ms epoch
}

// Date is not JSON-serialisable — store publishedAt as ISO string
type SerializedArticle  = Omit<Article, 'publishedAt'> & { publishedAt: string };
interface SerializedRiver {
  articles:   SerializedArticle[];
  sources:    Source[];
  categories: Category[];
  cachedAt:   number;
}

export function saveCache(data: Omit<CachedRiver, 'cachedAt'>): void {
  try {
    const payload: SerializedRiver = {
      articles: data.articles.slice(0, MAX_ARTICLES).map(a => ({
        ...a,
        publishedAt: a.publishedAt.toISOString(),
      })),
      sources:    data.sources,
      categories: data.categories,
      cachedAt:   Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage unavailable — silently skip
  }
}

export function loadCache(): CachedRiver | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SerializedRiver;
    return {
      ...parsed,
      articles: parsed.articles.map(a => ({
        ...a,
        publishedAt: new Date(a.publishedAt),
      })),
    };
  } catch {
    return null;
  }
}

export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
