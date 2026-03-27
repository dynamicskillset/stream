package com.stream.app.data.adapter

import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Port of freshrss.ts — Google Reader API (/api/greader.php).
 *
 * Auth flow:
 *   1. POST ClientLogin -> Auth token (long-lived)
 *   2. GET /reader/api/0/token -> T-token (short-lived CSRF, cached)
 *
 * All state-mutating POSTs require the T-token appended as T=...
 */
class FreshRSSAdapter(private val client: OkHttpClient) : StreamAdapter {

    override val id = "freshrss"
    override val name = "FreshRSS"

    private var baseUrl: String = ""
    private var authToken: String? = null
    private var tToken: String? = null

    private val json = Json { ignoreUnknownKeys = true }

    // --- Raw API shapes -------------------------------------------------------

    @Serializable
    private data class RawSubscription(
        val id: String,
        val title: String,
        val htmlUrl: String = "",
        val url: String? = null,
        val iconUrl: String? = null,
        val categories: List<SubCategory>? = null,
    )

    @Serializable
    private data class SubCategory(val id: String, val label: String)

    @Serializable
    private data class RawTag(val id: String)

    // --- Authentication -------------------------------------------------------

    override suspend fun authenticate(config: AdapterConfig): AuthResult = withContext(Dispatchers.IO) {
        val url = "${config.baseUrl}/api/greader.php/accounts/ClientLogin"

        val body = FormBody.Builder()
            .add("Email", config.username ?: "")
            .add("Passwd", config.password ?: "")
            .build()

        val request = Request.Builder().url(url).post(body).build()
        val response = client.newCall(request).execute()

        if (!response.isSuccessful) {
            return@withContext if (response.code == 401) {
                AuthResult(
                    success = false,
                    error = "Authentication failed (401). FreshRSS uses a separate API password \u2014 " +
                        "set one under Settings \u2192 Profile \u2192 API management, then use that here."
                )
            } else {
                AuthResult(success = false, error = "HTTP ${response.code}")
            }
        }

        val text = response.body?.string() ?: ""
        val match = Regex("^Auth=(.+)$", RegexOption.MULTILINE).find(text)

        if (match == null) {
            return@withContext AuthResult(success = false, error = "Auth token missing in response")
        }

        baseUrl = config.baseUrl?.trimEnd('/') ?: ""
        authToken = match.groupValues[1].trim()
        tToken = null
        AuthResult(success = true, token = authToken)
    }

    override fun isAuthenticated(): Boolean = authToken != null

    // --- T-token --------------------------------------------------------------

    private fun fetchTToken(): String {
        val request = Request.Builder()
            .url("$baseUrl/api/greader.php/reader/api/0/token")
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) throw RuntimeException("T-token fetch failed: HTTP ${response.code}")
        return (response.body?.string() ?: "").trim()
    }

    private fun getTToken(): String {
        if (tToken == null) tToken = fetchTToken()
        return tToken!!
    }

    // --- POST helper with T-token + retry on invalid token -------------------

    private fun postForm(path: String, params: Map<String, String>): String {
        val t = getTToken()
        val allParams = params + ("T" to t)

        val body = FormBody.Builder()
            .apply { allParams.forEach { (k, v) -> add(k, v) } }
            .build()

        val url = "$baseUrl/api/greader.php$path"
        val request = Request.Builder()
            .url(url)
            .post(body)
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        var response = client.newCall(request).execute()

        // Retry once if token expired
        if (response.code == 401 || response.code == 403) {
            tToken = null
            val t2 = getTToken()
            val retryParams = params + ("T" to t2)
            val retryBody = FormBody.Builder()
                .apply { retryParams.forEach { (k, v) -> add(k, v) } }
                .build()
            val retryRequest = Request.Builder()
                .url(url)
                .post(retryBody)
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()
            response = client.newCall(retryRequest).execute()
        }

        return response.body?.string() ?: ""
    }

    // --- Data -----------------------------------------------------------------

    override suspend fun fetchSources(): List<Source> = withContext(Dispatchers.IO) {
        val body = get("$baseUrl/api/greader.php/reader/api/0/subscription/list?output=json")
        val data = json.parseToJsonElement(body).jsonObject
        val subscriptions = data["subscriptions"]?.jsonArray ?: return@withContext emptyList()

        subscriptions.map { el ->
            val sub = json.decodeFromJsonElement(RawSubscription.serializer(), el)
            Source(
                id = sub.id,
                title = sub.title,
                siteUrl = sub.htmlUrl.ifEmpty { null },
                feedUrl = sub.url ?: sub.id.removePrefix("feed/"),
                faviconUrl = sub.iconUrl,
                categoryId = sub.categories?.firstOrNull()?.id,
                velocityTier = 3,
                isVoice = false,
            )
        }
    }

    override suspend fun fetchCategories(): List<Category> = withContext(Dispatchers.IO) {
        val body = get("$baseUrl/api/greader.php/reader/api/0/tag/list?output=json")
        val data = json.parseToJsonElement(body).jsonObject
        val tags = data["tags"]?.jsonArray ?: return@withContext emptyList()

        tags.mapNotNull { el ->
            val tag = json.decodeFromJsonElement(RawTag.serializer(), el)
            if ("/label/" !in tag.id) return@mapNotNull null
            Category(
                id = tag.id,
                title = tag.id.substringAfterLast("/label/"),
            )
        }
    }

    override suspend fun fetchArticles(options: FetchOptions): FetchResult = withContext(Dispatchers.IO) {
        val params = mutableListOf("output=json", "n=100")
        options.since?.let { params.add("ot=${it / 1000}") }
        options.continuation?.let { params.add("c=$it") }

        val body = get(
            "$baseUrl/api/greader.php/reader/api/0/stream/contents/reading-list?${params.joinToString("&")}"
        )
        val data = json.parseToJsonElement(body).jsonObject
        val items = data["items"]?.jsonArray ?: emptyList()
        val continuation = (data["continuation"] as? JsonPrimitive)?.contentOrNull

        val articles = items.map { el ->
            normaliseItem(el.jsonObject)
        }

        FetchResult(
            articles = articles,
            continuation = continuation,
            hasMore = continuation != null,
        )
    }

    // --- State ----------------------------------------------------------------

    override suspend fun setArticleRead(articleId: String): Unit = withContext(Dispatchers.IO) {
        postForm("/reader/api/0/edit-tag", mapOf(
            "i" to articleId,
            "a" to "user/-/state/com.google/read",
        ))
    }

    override suspend fun setArticleStarred(articleId: String, starred: Boolean): Unit = withContext(Dispatchers.IO) {
        val key = if (starred) "a" else "r"
        postForm("/reader/api/0/edit-tag", mapOf(
            "i" to articleId,
            key to "user/-/state/com.google/starred",
        ))
    }

    // --- Subscription management ---------------------------------------------

    override suspend fun setSourceCategory(sourceId: String, categoryId: String): Unit = withContext(Dispatchers.IO) {
        val responseBody = postForm("/reader/api/0/subscription/edit", mapOf(
            "ac" to "edit",
            "s" to sourceId,
            "a" to categoryId,
        ))
    }

    override suspend fun addSource(feedUrl: String): Source = withContext(Dispatchers.IO) {
        val responseBody = postForm("/reader/api/0/subscription/quickadd", mapOf(
            "quickadd" to feedUrl,
        ))

        var streamId: String? = null
        try {
            val data = json.parseToJsonElement(responseBody).jsonObject
            streamId = (data["streamId"] as? JsonPrimitive)?.contentOrNull
        } catch (_: Exception) { /* older FreshRSS may not return JSON */ }

        val sources = fetchSources()
        val added = (streamId?.let { sid -> sources.find { it.id == sid } })
            ?: sources.find { it.feedUrl == feedUrl }
            ?: throw RuntimeException("Feed added but not found in subscription list")

        added
    }

    override suspend fun removeSource(sourceId: String): Unit = withContext(Dispatchers.IO) {
        postForm("/reader/api/0/subscription/edit", mapOf(
            "ac" to "unsubscribe",
            "s" to sourceId,
        ))
    }

    override suspend fun importOPML(opmlXml: String): List<Source> = withContext(Dispatchers.IO) {
        val feedUrls = parseOpmlFeedUrls(opmlXml)
        val pending = mutableListOf<Triple<String?, String, String?>>() // streamId, url, categoryName

        for ((url, categoryName) in feedUrls) {
            try {
                val responseBody = postForm("/reader/api/0/subscription/quickadd", mapOf(
                    "quickadd" to url,
                ))
                var streamId: String? = null
                try {
                    val data = json.parseToJsonElement(responseBody).jsonObject
                    streamId = (data["streamId"] as? JsonPrimitive)?.contentOrNull
                } catch (_: Exception) {}
                pending.add(Triple(streamId, url, categoryName))
            } catch (_: Exception) { /* skip unreachable feeds */ }
        }

        if (pending.isEmpty()) return@withContext emptyList()

        val allSources = fetchSources()
        val byId = allSources.associateBy { it.id }
        val byUrl = allSources.associateBy { it.feedUrl }

        val result = mutableListOf<Source>()
        for ((streamId, url, categoryName) in pending) {
            val source = (streamId?.let { byId[it] }) ?: byUrl[url] ?: continue
            if (categoryName != null) {
                try {
                    setSourceCategory(source.id, "user/-/label/$categoryName")
                } catch (_: Exception) {}
            }
            result.add(source)
        }
        result
    }

    // --- Private helpers ------------------------------------------------------

    private fun authHeaders(): Map<String, String> = mapOf(
        "Authorization" to "GoogleLogin auth=$authToken"
    )

    private fun get(url: String): String {
        val request = Request.Builder()
            .url(url)
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: ""
        if (!response.isSuccessful) {
            throw RuntimeException("GET $url failed: HTTP ${response.code}${if (body.isNotEmpty()) " \u2014 $body" else ""}")
        }
        return body
    }

    private fun normaliseItem(item: JsonObject): Article {
        val id = item["id"]?.jsonPrimitive?.contentOrNull ?: ""

        val title = when (val t = item["title"]) {
            is JsonPrimitive -> t.contentOrNull ?: "(no title)"
            is JsonObject -> (t["content"] as? JsonPrimitive)?.contentOrNull ?: "(no title)"
            else -> "(no title)"
        }

        val url = item["canonical"]?.jsonArray?.firstOrNull()?.jsonObject?.get("href")?.jsonPrimitive?.contentOrNull
            ?: item["alternate"]?.jsonArray?.firstOrNull()?.jsonObject?.get("href")?.jsonPrimitive?.contentOrNull
            ?: ""

        val content = item["content"]?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull
            ?: item["summary"]?.jsonObject?.get("content")?.jsonPrimitive?.contentOrNull
            ?: ""

        val published = item["published"]?.jsonPrimitive?.longOrNull ?: 0L
        val sourceId = item["origin"]?.jsonObject?.get("streamId")?.jsonPrimitive?.contentOrNull ?: ""

        val categories = item["categories"]?.jsonArray?.mapNotNull {
            (it as? JsonPrimitive)?.contentOrNull
        } ?: emptyList()

        val isRead = "user/-/state/com.google/read" in categories
        val isStarred = "user/-/state/com.google/starred" in categories

        return Article(
            id = id,
            sourceId = sourceId,
            title = title,
            url = url,
            content = content,
            publishedAt = published * 1000,
            isRead = isRead,
            isStarred = isStarred,
        )
    }
}
