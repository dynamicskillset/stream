package com.stream.app.data.adapter

import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.Source

data class AdapterConfig(
    val baseUrl: String? = null,
    val username: String? = null,
    val password: String? = null,
    val apiKey: String? = null,
)

data class AuthResult(
    val success: Boolean,
    val token: String? = null,
    val error: String? = null,
)

data class FetchOptions(
    val since: Long? = null,       // epoch millis
    val limit: Int? = null,
    val continuation: String? = null,
)

data class FetchResult(
    val articles: List<Article>,
    val continuation: String? = null,
    val hasMore: Boolean = false,
)

/**
 * Port of types.ts StreamAdapter — common interface for RSS backends.
 */
interface StreamAdapter {
    val id: String
    val name: String

    suspend fun authenticate(config: AdapterConfig): AuthResult
    fun isAuthenticated(): Boolean

    suspend fun fetchArticles(options: FetchOptions = FetchOptions()): FetchResult
    suspend fun fetchSources(): List<Source>
    suspend fun fetchCategories(): List<Category>

    suspend fun setArticleRead(articleId: String)
    suspend fun setArticleStarred(articleId: String, starred: Boolean)

    suspend fun setSourceCategory(sourceId: String, categoryId: String)

    suspend fun addSource(feedUrl: String): Source
    suspend fun removeSource(sourceId: String)
    suspend fun importOPML(opmlXml: String): List<Source>
}
