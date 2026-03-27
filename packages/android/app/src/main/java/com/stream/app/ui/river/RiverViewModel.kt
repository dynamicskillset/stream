package com.stream.app.ui.river

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stream.app.data.local.PrefsStore
import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.ScoredArticle
import com.stream.app.data.model.Source
import com.stream.app.data.repository.StreamRepository
import com.stream.app.domain.MuteEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RiverUiState(
    val scoredItems: List<ScoredArticle> = emptyList(),
    val sources: List<Source> = emptyList(),
    val categories: List<Category> = emptyList(),
    val activeCategory: String? = null,
    val unreadOnly: Boolean = false,
    val savedOnly: Boolean = false,
    val isPaused: Boolean = false,
    val isRefreshing: Boolean = false,
    val pendingUndo: Article? = null,
    val savedIds: Set<String> = emptySet(),
)

@HiltViewModel
class RiverViewModel @Inject constructor(
    private val repository: StreamRepository,
) : ViewModel() {

    private val _activeCategory = MutableStateFlow<String?>(null)
    private val _unreadOnly = MutableStateFlow(false)
    private val _savedOnly = MutableStateFlow(false)
    private val _pendingUndo = MutableStateFlow<DismissedItem?>(null)
    private val _dismissedIds = MutableStateFlow<Set<String>>(emptySet())
    private val _tick = MutableStateFlow(System.currentTimeMillis())

    private var undoJob: Job? = null

    private data class DismissedItem(
        val article: Article,
        val score: Double,
    )

    val isConnected: StateFlow<Boolean> = repository.isConnected

    val state: StateFlow<RiverUiState> = combine(
        repository.articles,
        repository.sources,
        repository.categories,
        repository.mutedSources,
        repository.quietHours,
        _activeCategory,
        _unreadOnly,
        _savedOnly,
        _dismissedIds,
        _pendingUndo,
    ) { values ->
        @Suppress("UNCHECKED_CAST")
        val articles = values[0] as List<Article>
        val sources = values[1] as List<Source>
        val categories = values[2] as List<Category>
        val mutedEntries = values[3] as List<MuteEntry>
        val quietState = values[4] as PrefsStore.QuietHoursState
        val activeCategory = values[5] as String?
        val unreadOnly = values[6] as Boolean
        val savedOnly = values[7] as Boolean
        val dismissedIds = values[8] as Set<String>
        val pendingUndoItem = values[9] as DismissedItem?

        val preserveAll = savedOnly
        val scored = repository.scoredRiver(articles, sources, mutedEntries, quietState, preserveAll)

        // Apply filters
        val filtered = scored.filter { sa ->
            val a = sa.article
            if (a.id in dismissedIds) return@filter false
            if (activeCategory != null) {
                val source = sources.find { it.id == a.sourceId }
                if (source?.categoryId != activeCategory) return@filter false
            }
            if (unreadOnly && a.isRead) return@filter false
            if (savedOnly && !a.isStarred) return@filter false
            true
        }

        val savedIds = articles.filter { it.isStarred }.map { it.id }.toSet()

        RiverUiState(
            scoredItems = filtered,
            sources = sources,
            categories = categories,
            activeCategory = activeCategory,
            unreadOnly = unreadOnly,
            savedOnly = savedOnly,
            isPaused = quietState.pausedAt != null,
            isRefreshing = false,
            pendingUndo = pendingUndoItem?.article,
            savedIds = savedIds,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), RiverUiState())

    init {
        // Periodic score recalculation every 60 seconds
        viewModelScope.launch {
            while (true) {
                delay(60_000)
                _tick.value = System.currentTimeMillis()
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            repository.refresh()
        }
    }

    fun setActiveCategory(categoryId: String?) {
        _activeCategory.value = categoryId
    }

    fun setUnreadOnly(value: Boolean) {
        _unreadOnly.value = value
        if (value) _savedOnly.value = false
    }

    fun setSavedOnly(value: Boolean) {
        _savedOnly.value = value
        if (value) _unreadOnly.value = false
    }

    fun dismiss(articleId: String) {
        val current = state.value
        val scored = current.scoredItems.find { it.article.id == articleId } ?: return

        // Cancel previous undo
        undoJob?.cancel()
        _pendingUndo.value?.let { prev ->
            // Finalize previous dismiss
        }

        _dismissedIds.value = _dismissedIds.value + articleId
        _pendingUndo.value = DismissedItem(scored.article, scored.score)

        viewModelScope.launch {
            repository.markRead(articleId)
        }

        undoJob = viewModelScope.launch {
            delay(5_000)
            _pendingUndo.value = null
        }
    }

    fun undo() {
        undoJob?.cancel()
        val dismissed = _pendingUndo.value ?: return
        _dismissedIds.value = _dismissedIds.value - dismissed.article.id
        _pendingUndo.value = null
    }

    fun save(articleId: String) {
        viewModelScope.launch {
            val current = state.value.savedIds.contains(articleId)
            repository.setStarred(articleId, !current)
        }
    }

    fun togglePause() {
        viewModelScope.launch {
            if (state.value.isPaused) {
                repository.resumeRiver()
            } else {
                repository.pauseRiver()
            }
        }
    }

    fun muteSource(sourceId: String, sourceTitle: String, mutedUntil: Long) {
        viewModelScope.launch {
            repository.muteSource(sourceId, sourceTitle, mutedUntil)
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            repository.disconnect()
        }
    }
}
