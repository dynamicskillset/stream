package com.stream.app.data.repository

import com.stream.app.data.adapter.AdapterConfig
import com.stream.app.data.adapter.AdapterFactory
import com.stream.app.data.adapter.FetchOptions
import com.stream.app.data.adapter.StreamAdapter
import com.stream.app.data.local.ArticleDao
import com.stream.app.data.local.PrefsStore
import com.stream.app.data.local.SourceDao
import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.ScoredArticle
import com.stream.app.data.model.Source
import com.stream.app.data.model.VelocityTier
import com.stream.app.domain.MuteEntry
import com.stream.app.domain.RiverEngine
import com.stream.app.domain.activeMutedIds
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StreamRepository @Inject constructor(
    private val articleDao: ArticleDao,
    private val sourceDao: SourceDao,
    private val prefsStore: PrefsStore,
    private val okHttpClient: OkHttpClient,
) {
    private var adapter: StreamAdapter? = null

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    val articles: Flow<List<Article>> = articleDao.observeAll()
    val sources: Flow<List<Source>> = sourceDao.observeAll()
    val displayPrefs: Flow<PrefsStore.DisplayPrefs> = prefsStore.displayPrefsFlow
    val mutedSources: Flow<List<MuteEntry>> = prefsStore.mutedSourcesFlow
    val quietHours: Flow<PrefsStore.QuietHoursState> = prefsStore.quietHoursFlow
    val connectionFlow: Flow<PrefsStore.SavedConnection?> = prefsStore.connectionFlow

    // --- Connection -----------------------------------------------------------

    suspend fun connect(adapterId: String, config: AdapterConfig): Result<Unit> {
        val a = AdapterFactory.create(adapterId, okHttpClient)
        val result = a.authenticate(config)
        if (!result.success) {
            return Result.failure(RuntimeException(result.error ?: "Authentication failed"))
        }
        adapter = a
        _isConnected.value = true
        prefsStore.saveConnection(
            adapterId = adapterId,
            baseUrl = config.baseUrl,
            username = config.username,
            password = config.password,
        )
        return Result.success(Unit)
    }

    suspend fun tryAutoConnect(): Boolean {
        val saved = prefsStore.getSavedConnection() ?: return false
        val config = AdapterConfig(
            baseUrl = saved.baseUrl,
            username = saved.username,
            password = saved.password,
        )
        return connect(saved.adapterId, config).isSuccess
    }

    suspend fun disconnect() {
        adapter = null
        _isConnected.value = false
        prefsStore.clearConnection()
        articleDao.deleteAll()
        sourceDao.deleteAll()
        _categories.value = emptyList()
    }

    // --- Data refresh ---------------------------------------------------------

    suspend fun refresh(): Result<Unit> {
        val a = adapter ?: return Result.failure(RuntimeException("Not connected"))
        _isLoading.value = true

        return try {
            // Fetch sources, categories, and articles in parallel-ish fashion
            val remoteSources = a.fetchSources()
            val remoteCategories = a.fetchCategories()

            // Merge velocity tiers from local DB
            val existingSources = sourceDao.getAll().associateBy { it.id }
            val mergedSources = remoteSources.map { remote ->
                val existing = existingSources[remote.id]
                if (existing != null) {
                    remote.copy(
                        velocityTier = existing.velocityTier,
                        customHalfLife = existing.customHalfLife,
                        isVoice = existing.isVoice,
                    )
                } else remote
            }
            sourceDao.upsertAll(mergedSources)
            _categories.value = remoteCategories

            // Fetch articles — use 2x max half-life as window
            val maxHalfLife = VelocityTier.EVERGREEN.halfLifeHours
            val sinceMillis = System.currentTimeMillis() - (2 * maxHalfLife * 3_600_000).toLong()

            val allArticles = mutableListOf<Article>()
            var continuation: String? = null
            var hasMore = true
            while (hasMore && allArticles.size < 500) {
                val page = a.fetchArticles(FetchOptions(
                    since = sinceMillis,
                    continuation = continuation,
                ))
                allArticles.addAll(page.articles)
                continuation = page.continuation
                hasMore = page.hasMore
            }

            articleDao.upsertAll(allArticles)

            // Clean up old articles
            articleDao.deleteOlderThan(sinceMillis)

            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            _isLoading.value = false
        }
    }

    // --- Article actions ------------------------------------------------------

    suspend fun markRead(articleId: String) {
        articleDao.markRead(articleId)
        try { adapter?.setArticleRead(articleId) } catch (_: Exception) {}
    }

    suspend fun setStarred(articleId: String, starred: Boolean) {
        articleDao.setStarred(articleId, starred)
        try { adapter?.setArticleStarred(articleId, starred) } catch (_: Exception) {}
    }

    // --- Source management -----------------------------------------------------

    suspend fun updateVelocityTier(sourceId: String, tier: Int) {
        sourceDao.updateVelocityTier(sourceId, tier)
    }

    suspend fun updateSourceCategory(sourceId: String, categoryId: String?) {
        sourceDao.updateCategory(sourceId, categoryId)
        if (categoryId != null) {
            try { adapter?.setSourceCategory(sourceId, categoryId) } catch (_: Exception) {}
        }
    }

    suspend fun addSource(feedUrl: String): Result<Source> {
        val a = adapter ?: return Result.failure(RuntimeException("Not connected"))
        return try {
            val source = a.addSource(feedUrl)
            sourceDao.upsertAll(listOf(source))
            Result.success(source)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun removeSource(sourceId: String): Result<Unit> {
        val a = adapter ?: return Result.failure(RuntimeException("Not connected"))
        return try {
            a.removeSource(sourceId)
            refresh() // re-fetch to reflect changes
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun importOPML(opmlXml: String): Result<List<Source>> {
        val a = adapter ?: return Result.failure(RuntimeException("Not connected"))
        return try {
            val sources = a.importOPML(opmlXml)
            refresh()
            Result.success(sources)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // --- Muted sources --------------------------------------------------------

    suspend fun muteSource(sourceId: String, sourceTitle: String, mutedUntil: Long) {
        val entries = prefsStore.mutedSourcesFlow.first().toMutableList()
        entries.removeAll { it.sourceId == sourceId }
        entries.add(MuteEntry(sourceId, sourceTitle, mutedUntil))
        prefsStore.saveMutedSources(entries)
    }

    suspend fun unmuteSource(sourceId: String) {
        val entries = prefsStore.mutedSourcesFlow.first().filter { it.sourceId != sourceId }
        prefsStore.saveMutedSources(entries)
    }

    // --- Quiet hours ----------------------------------------------------------

    suspend fun pauseRiver() = prefsStore.pauseRiver()
    suspend fun resumeRiver() = prefsStore.resumeRiver()

    // --- Display prefs --------------------------------------------------------

    suspend fun saveDisplayPrefs(prefs: PrefsStore.DisplayPrefs) = prefsStore.saveDisplayPrefs(prefs)

    // --- Reading progress -----------------------------------------------------

    suspend fun saveReadingProgress(articleId: String, pct: Float) = prefsStore.saveReadingProgress(articleId, pct)
    suspend fun getReadingProgress(articleId: String): Float? = prefsStore.getReadingProgress(articleId)

    // --- Scoring helper -------------------------------------------------------

    fun scoredRiver(
        articles: List<Article>,
        sources: List<Source>,
        mutedEntries: List<MuteEntry>,
        quietState: PrefsStore.QuietHoursState,
        preserveAll: Boolean = false,
    ): List<ScoredArticle> {
        val now = System.currentTimeMillis()
        val effectiveNow = prefsStore.effectiveNow(now, quietState)
        val mutedIds = activeMutedIds(mutedEntries, now)
        val sourceMap = sources.associateBy { it.id }
        val filtered = articles.filter { it.sourceId !in mutedIds }
        return RiverEngine.scoreRiver(filtered, sourceMap, effectiveNow, preserveAll)
    }
}
