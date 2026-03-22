import type { Article, Source } from './types.js';

/** Half-lives in hours for each velocity tier (1 = Breaking, 5 = Evergreen). */
export const HALF_LIVES: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 3,
  2: 12,
  3: 24,
  4: 72,
  5: 168,
};

/** Articles with a score below this threshold are excluded from the river. */
export const VISIBILITY_THRESHOLD = 0.05;

/** Returns the effective half-life in hours for a source. */
export function resolveHalfLife(source: Source): number {
  return source.customHalfLife ?? HALF_LIVES[source.velocityTier];
}

/**
 * Computes the visibility score for an article.
 *
 * score = 0.5 ^ (elapsed / halfLife)
 *
 * @param publishedAt  Publication timestamp.
 * @param halfLifeHours  Half-life of the source in hours.
 * @param now  Injected current timestamp (milliseconds). Must be provided
 *             explicitly — the engine never calls Date.now() internally.
 */
export function visibilityScore(
  publishedAt: Date,
  halfLifeHours: number,
  now: number,
): number {
  const elapsedHours = (now - publishedAt.getTime()) / 3_600_000;
  return Math.pow(0.5, elapsedHours / halfLifeHours);
}

export interface ScoredArticle {
  article: Article;
  score: number;
}

/**
 * Scores and filters a list of articles against the visibility threshold.
 * Returns articles above the threshold, sorted newest-first.
 *
 * @param articles  Normalised articles from any backend adapter.
 * @param sourceMap  Map from sourceId to Source (for half-life resolution).
 * @param now  Injected current timestamp in milliseconds.
 */
export function scoreRiver(
  articles: Article[],
  sourceMap: Map<string, Source>,
  now: number,
): ScoredArticle[] {
  return articles
    .flatMap((article) => {
      const source = sourceMap.get(article.sourceId);
      if (!source) return [];

      const halfLife = resolveHalfLife(source);
      const score = visibilityScore(article.publishedAt, halfLife, now);

      if (score < VISIBILITY_THRESHOLD) return [];

      return [{ article, score }];
    })
    .sort((a, b) => b.article.publishedAt.getTime() - a.article.publishedAt.getTime());
}
