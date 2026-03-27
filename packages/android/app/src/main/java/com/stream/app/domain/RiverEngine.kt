package com.stream.app.domain

import com.stream.app.data.model.Article
import com.stream.app.data.model.ScoredArticle
import com.stream.app.data.model.Source
import com.stream.app.data.model.VelocityTier
import kotlin.math.pow

/**
 * Port of riverEngine.ts — velocity-based article scoring.
 *
 * score = 0.5 ^ (elapsed_hours / half_life)
 */
object RiverEngine {

    /** Articles with a score below this threshold are excluded from the river. */
    const val VISIBILITY_THRESHOLD = 0.05

    /** Returns the effective half-life in hours for a source. */
    fun resolveHalfLife(source: Source): Double {
        return source.customHalfLife ?: VelocityTier.halfLifeForTier(source.velocityTier)
    }

    /**
     * Computes the visibility score for an article.
     *
     * @param publishedAtMillis Publication timestamp in epoch millis.
     * @param halfLifeHours Half-life of the source in hours.
     * @param nowMillis Current timestamp in epoch millis.
     */
    fun visibilityScore(publishedAtMillis: Long, halfLifeHours: Double, nowMillis: Long): Double {
        val elapsedHours = (nowMillis - publishedAtMillis) / 3_600_000.0
        return 0.5.pow(elapsedHours / halfLifeHours)
    }

    /**
     * Scores and filters a list of articles against the visibility threshold.
     * Returns articles above the threshold, sorted newest-first.
     *
     * @param articles Articles from any backend adapter.
     * @param sourceMap Map from sourceId to Source (for half-life resolution).
     * @param nowMillis Current timestamp in epoch millis.
     * @param preserveAll If true, assign score 1.0 to all articles (for saved view).
     */
    fun scoreRiver(
        articles: List<Article>,
        sourceMap: Map<String, Source>,
        nowMillis: Long,
        preserveAll: Boolean = false,
    ): List<ScoredArticle> {
        return articles.mapNotNull { article ->
            val source = sourceMap[article.sourceId] ?: return@mapNotNull null

            if (preserveAll) {
                return@mapNotNull ScoredArticle(article, 1.0)
            }

            val halfLife = resolveHalfLife(source)
            val score = visibilityScore(article.publishedAt, halfLife, nowMillis)

            if (score < VISIBILITY_THRESHOLD) null
            else ScoredArticle(article, score)
        }.sortedByDescending { it.article.publishedAt }
    }
}
