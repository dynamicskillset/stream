package com.stream.app.ui.reading

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stream.app.data.model.Article
import com.stream.app.data.model.Source
import com.stream.app.data.repository.StreamRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReadingUiState(
    val article: Article? = null,
    val source: Source? = null,
    val isSaved: Boolean = false,
    val initialScrollPct: Float = 0f,
)

@HiltViewModel
class ReadingViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: StreamRepository,
) : ViewModel() {

    private val articleId: String = savedStateHandle["articleId"] ?: ""

    private val _state = MutableStateFlow(ReadingUiState())
    val state: StateFlow<ReadingUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val articles = repository.articles.first()
            val sources = repository.sources.first()
            val article = articles.find { it.id == articleId }
            val source = article?.let { a -> sources.find { it.id == a.sourceId } }
            val scrollPct = repository.getReadingProgress(articleId) ?: 0f

            _state.value = ReadingUiState(
                article = article,
                source = source,
                isSaved = article?.isStarred == true,
                initialScrollPct = scrollPct,
            )

            // Mark as read
            if (article != null) {
                repository.markRead(article.id)
            }
        }
    }

    fun toggleSave() {
        val article = _state.value.article ?: return
        val newSaved = !_state.value.isSaved
        _state.value = _state.value.copy(isSaved = newSaved)
        viewModelScope.launch {
            repository.setStarred(article.id, newSaved)
        }
    }

    fun saveScrollProgress(pct: Float) {
        viewModelScope.launch {
            repository.saveReadingProgress(articleId, pct)
        }
    }
}
