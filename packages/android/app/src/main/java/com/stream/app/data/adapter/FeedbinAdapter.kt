package com.stream.app.data.adapter

import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.Base64

/**
 * Port of feedbin.ts — Feedbin REST API v2.
 * Auth: HTTP Basic (email + password) on every request.
 */
class FeedbinAdapter(private val client: OkHttpClient) : StreamAdapter {

    override val id = "feedbin"
    override val name = "Feedbin"

    private var credentials: String? = null
    private val feedIdToSubId = mutableMapOf<String, String>()
    private val feedIdToTaggingId = mutableMapOf<String, Int>()
    private var unreadIds = mutableSetOf<String>()
    private var starredIds = mutableSetOf<String>()

    private val json = Json { ignoreUnknownKeys = true }

    companion object {
        private const val BASE = "https://api.feedbin.com/v2"
        private val JSON_MEDIA = "application/json".toMediaType()
    }

    // --- Raw Feedbin API shapes -----------------------------------------------

    @Serializable
    private data class RawEntry(
        val id: Long,
        val feed_id: Long,
        val title: String? = null,
        val author: String? = null,
        val summary: String? = null,
        val content: String? = null,
        val url: String,
        val published: String,
        val created_at: String,
    )

    @Serializable
    private data class RawSubscription(
        val id: Long,
        val feed_id: Long,
        val title: String,
        val feed_url: String,
        val site_url: String = "",
        val json_feed: JsonFeed? = null,
    )

    @Serializable
    private data class JsonFeed(
        val favicon: String? = null,
        val favicon_url: String? = null,
    )

    @Serializable
    private data class RawTagging(
        val id: Int,
        val feed_id: Long,
        val name: String,
    )

    // --- Authentication -------------------------------------------------------

    override suspend fun authenticate(config: AdapterConfig): AuthResult = withContext(Dispatchers.IO) {
        val creds = Base64.getEncoder().encodeToString(
            "${config.username ?: ""}:${config.password ?: ""}".toByteArray()
        )
        credentials = creds

        val request = Request.Builder()
            .url("$BASE/authentication.json")
            .header("Authorization", "Basic $creds")
            .build()

        val response = client.newCall(request).execute()
        if (response.code == 200) {
            AuthResult(success = true)
        } else {
            credentials = null
            AuthResult(
                success = false,
                error = if (response.code == 401) "Invalid email or password."
                else "HTTP ${response.code}"
            )
        }
    }

    override fun isAuthenticated(): Boolean = credentials != null

    // --- Data -----------------------------------------------------------------

    override suspend fun fetchSources(): List<Source> = withContext(Dispatchers.IO) {
        val subsDeferred = async { get("$BASE/subscriptions.json") }
        val taggingsDeferred = async { get("$BASE/taggings.json") }

        val subsBody = subsDeferred.await()
        val taggingsBody = taggingsDeferred.await()

        val subs = json.decodeFromString<List<RawSubscription>>(subsBody)
        val taggings = try {
            json.decodeFromString<List<RawTagging>>(taggingsBody)
        } catch (_: Exception) { emptyList() }

        val feedTag = mutableMapOf<Long, String>()
        feedIdToTaggingId.clear()
        for (t in taggings) {
            if (t.feed_id !in feedTag) {
                feedTag[t.feed_id] = t.name
                feedIdToTaggingId[t.feed_id.toString()] = t.id
            }
        }

        feedIdToSubId.clear()
        for (sub in subs) {
            feedIdToSubId[sub.feed_id.toString()] = sub.id.toString()
        }

        subs.map { sub ->
            Source(
                id = sub.feed_id.toString(),
                title = sub.title,
                siteUrl = sub.site_url.ifEmpty { null },
                feedUrl = sub.feed_url,
                faviconUrl = sub.json_feed?.favicon_url ?: sub.json_feed?.favicon,
                categoryId = feedTag[sub.feed_id],
                velocityTier = 3,
                isVoice = false,
            )
        }
    }

    override suspend fun fetchCategories(): List<Category> = withContext(Dispatchers.IO) {
        val body = get("$BASE/taggings.json")
        val taggings = json.decodeFromString<List<RawTagging>>(body)

        val seen = mutableMapOf<String, Category>()
        for (t in taggings) {
            if (t.name !in seen) {
                seen[t.name] = Category(id = t.name, title = t.name)
            }
        }
        seen.values.toList()
    }

    override suspend fun fetchArticles(options: FetchOptions): FetchResult = withContext(Dispatchers.IO) {
        val params = mutableListOf("per_page=100")
        options.since?.let {
            params.add("since=${java.time.Instant.ofEpochMilli(it)}")
        }
        options.continuation?.let { params.add("page=$it") }

        val entriesDeferred = async {
            get("$BASE/entries.json?${params.joinToString("&")}")
        }
        val unreadDeferred = if (options.continuation == null) async { fetchIdList("unread_entries") } else null
        val starredDeferred = if (options.continuation == null) async { fetchIdList("starred_entries") } else null

        val entriesBody = entriesDeferred.await()
        unreadDeferred?.await()?.let { unreadIds = it.map { id -> id.toString() }.toMutableSet() }
        starredDeferred?.await()?.let { starredIds = it.map { id -> id.toString() }.toMutableSet() }

        val rawEntries = json.decodeFromString<List<RawEntry>>(entriesBody)

        // Parse Link header for next page
        // Note: OkHttp response headers would be needed for real pagination
        // For simplicity, check if we got a full page
        val hasMore = rawEntries.size >= 100

        val articles = rawEntries.map { e ->
            Article(
                id = e.id.toString(),
                sourceId = e.feed_id.toString(),
                title = e.title ?: "(no title)",
                author = e.author,
                url = e.url,
                content = e.content ?: e.summary ?: "",
                publishedAt = parseIso8601(e.published),
                isRead = e.id.toString() !in unreadIds,
                isStarred = e.id.toString() in starredIds,
            )
        }

        FetchResult(
            articles = articles,
            continuation = if (hasMore) {
                val currentPage = options.continuation?.toIntOrNull() ?: 1
                (currentPage + 1).toString()
            } else null,
            hasMore = hasMore,
        )
    }

    // --- State ----------------------------------------------------------------

    override suspend fun setArticleRead(articleId: String): Unit = withContext(Dispatchers.IO) {
        delete(
            "$BASE/unread_entries.json",
            """{"unread_entries":[${articleId.toLong()}]}"""
        )
    }

    override suspend fun setArticleStarred(articleId: String, starred: Boolean): Unit = withContext(Dispatchers.IO) {
        val body = """{"starred_entries":[${articleId.toLong()}]}"""
        if (starred) {
            post("$BASE/starred_entries.json", body)
        } else {
            delete("$BASE/starred_entries.json", body)
        }
    }

    // --- Subscription management ---------------------------------------------

    override suspend fun setSourceCategory(sourceId: String, categoryId: String): Unit = withContext(Dispatchers.IO) {
        val oldTaggingId = feedIdToTaggingId[sourceId]
        if (oldTaggingId != null) {
            deleteNoBody("$BASE/taggings/$oldTaggingId.json")
            feedIdToTaggingId.remove(sourceId)
        }

        val body = """{"feed_id":${sourceId.toLong()},"name":"$categoryId"}"""
        post("$BASE/taggings.json", body)
    }

    override suspend fun addSource(feedUrl: String): Source = withContext(Dispatchers.IO) {
        val body = """{"feed_url":"$feedUrl"}"""
        val responseBody = post("$BASE/subscriptions.json", body)
        val sub = json.decodeFromString<RawSubscription>(responseBody)
        feedIdToSubId[sub.feed_id.toString()] = sub.id.toString()
        Source(
            id = sub.feed_id.toString(),
            title = sub.title,
            siteUrl = sub.site_url.ifEmpty { null },
            feedUrl = sub.feed_url,
            faviconUrl = sub.json_feed?.favicon_url ?: sub.json_feed?.favicon,
            velocityTier = 3,
            isVoice = false,
        )
    }

    override suspend fun removeSource(sourceId: String): Unit = withContext(Dispatchers.IO) {
        val subId = feedIdToSubId[sourceId]
            ?: error("Subscription ID not found — call fetchSources first")
        deleteNoBody("$BASE/subscriptions/$subId.json")
    }

    override suspend fun importOPML(opmlXml: String): List<Source> = withContext(Dispatchers.IO) {
        val added = mutableListOf<Source>()
        val feedUrls = parseOpmlFeedUrls(opmlXml)
        for ((url, categoryName) in feedUrls) {
            try {
                val source = addSource(url)
                if (categoryName != null) {
                    try { setSourceCategory(source.id, categoryName) } catch (_: Exception) {}
                }
                added.add(source)
            } catch (_: Exception) { /* skip unreachable feeds */ }
        }
        added
    }

    // --- Private helpers ------------------------------------------------------

    private fun authHeaders(): Map<String, String> = mapOf(
        "Authorization" to "Basic $credentials"
    )

    private fun get(url: String): String {
        val request = Request.Builder()
            .url(url)
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw RuntimeException("GET $url failed: HTTP ${response.code}")
        }
        return response.body?.string() ?: ""
    }

    private fun post(url: String, jsonBody: String): String {
        val request = Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody(JSON_MEDIA))
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        val response = client.newCall(request).execute()
        return response.body?.string() ?: ""
    }

    private fun delete(url: String, jsonBody: String) {
        val request = Request.Builder()
            .url(url)
            .delete(jsonBody.toRequestBody(JSON_MEDIA))
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        client.newCall(request).execute()
    }

    private fun deleteNoBody(url: String) {
        val request = Request.Builder()
            .url(url)
            .delete()
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        client.newCall(request).execute()
    }

    private fun fetchIdList(resource: String): List<Long> {
        return try {
            val body = get("$BASE/$resource.json")
            json.decodeFromString<List<Long>>(body)
        } catch (_: Exception) { emptyList() }
    }

    private fun parseIso8601(dateStr: String): Long {
        return try {
            java.time.Instant.parse(dateStr).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }
}

/** Parses OPML XML and returns (feedUrl, categoryName?) pairs. */
internal fun parseOpmlFeedUrls(opmlXml: String): List<Pair<String, String?>> {
    val results = mutableListOf<Pair<String, String?>>()
    try {
        val factory = javax.xml.parsers.DocumentBuilderFactory.newInstance()
        val builder = factory.newDocumentBuilder()
        val doc = builder.parse(opmlXml.byteInputStream())
        val outlines = doc.getElementsByTagName("outline")
        for (i in 0 until outlines.length) {
            val el = outlines.item(i)
            val xmlUrl = el.attributes?.getNamedItem("xmlUrl")?.nodeValue ?: continue
            val parent = el.parentNode
            val categoryName = if (parent?.nodeName?.lowercase() == "outline") {
                parent.attributes?.getNamedItem("text")?.nodeValue
                    ?: parent.attributes?.getNamedItem("title")?.nodeValue
            } else null
            results.add(xmlUrl to categoryName)
        }
    } catch (_: Exception) { /* malformed OPML */ }
    return results
}
