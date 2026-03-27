package com.stream.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stream.app.data.local.PrefsStore
import com.stream.app.data.model.Category
import com.stream.app.data.model.Source
import com.stream.app.data.model.VelocityTier
import com.stream.app.data.repository.StreamRepository
import com.stream.app.domain.MuteEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val sources: List<Source> = emptyList(),
    val categories: List<Category> = emptyList(),
    val displayPrefs: PrefsStore.DisplayPrefs = PrefsStore.DisplayPrefs(),
    val mutedEntries: List<MuteEntry> = emptyList(),
    val addFeedUrl: String = "",
    val addFeedStatus: String? = null,
    val searchQuery: String = "",
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: StreamRepository,
) : ViewModel() {

    private val _addFeedUrl = MutableStateFlow("")
    private val _addFeedStatus = MutableStateFlow<String?>(null)
    private val _searchQuery = MutableStateFlow("")

    @Suppress("UNCHECKED_CAST")
    val state: StateFlow<SettingsUiState> = combine(
        flows = arrayOf(
            repository.sources,
            repository.categories,
            repository.displayPrefs,
            repository.mutedSources,
            _addFeedUrl,
            _addFeedStatus,
            _searchQuery,
        ),
    ) { values ->
        SettingsUiState(
            sources = values[0] as List<Source>,
            categories = values[1] as List<Category>,
            displayPrefs = values[2] as PrefsStore.DisplayPrefs,
            mutedEntries = values[3] as List<MuteEntry>,
            addFeedUrl = values[4] as String,
            addFeedStatus = values[5] as String?,
            searchQuery = values[6] as String,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SettingsUiState())

    fun setAddFeedUrl(url: String) {
        _addFeedUrl.value = url
        _addFeedStatus.value = null
    }

    fun addFeed() {
        val url = _addFeedUrl.value.trim()
        if (url.isEmpty()) return
        viewModelScope.launch {
            _addFeedStatus.value = "Adding..."
            val result = repository.addSource(url)
            if (result.isSuccess) {
                _addFeedUrl.value = ""
                _addFeedStatus.value = "Added: ${result.getOrNull()?.title}"
            } else {
                _addFeedStatus.value = "Error: ${result.exceptionOrNull()?.message}"
            }
        }
    }

    fun importOPML(opmlXml: String) {
        viewModelScope.launch {
            _addFeedStatus.value = "Importing..."
            val result = repository.importOPML(opmlXml)
            if (result.isSuccess) {
                _addFeedStatus.value = "Imported ${result.getOrNull()?.size ?: 0} feeds"
            } else {
                _addFeedStatus.value = "Import error: ${result.exceptionOrNull()?.message}"
            }
        }
    }

    fun updateVelocityTier(sourceId: String, tier: Int) {
        viewModelScope.launch {
            repository.updateVelocityTier(sourceId, tier)
        }
    }

    fun updateSourceCategory(sourceId: String, categoryId: String?) {
        viewModelScope.launch {
            repository.updateSourceCategory(sourceId, categoryId)
        }
    }

    fun updateDisplayPrefs(prefs: PrefsStore.DisplayPrefs) {
        viewModelScope.launch {
            repository.saveDisplayPrefs(prefs)
        }
    }

    fun unmuteSource(sourceId: String) {
        viewModelScope.launch {
            repository.unmuteSource(sourceId)
        }
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun disconnect() {
        viewModelScope.launch {
            repository.disconnect()
        }
    }
}
