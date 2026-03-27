package com.stream.app.ui.connect

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stream.app.data.adapter.AdapterConfig
import com.stream.app.data.repository.StreamRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConnectUiState(
    val backend: String = "freshrss",  // "freshrss" or "feedbin"
    val url: String = "",
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val isConnected: Boolean = false,
)

@HiltViewModel
class ConnectViewModel @Inject constructor(
    private val repository: StreamRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConnectUiState())
    val state: StateFlow<ConnectUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true)
            val autoConnected = repository.tryAutoConnect()
            if (autoConnected) {
                repository.refresh()
                _state.value = _state.value.copy(isLoading = false, isConnected = true)
            } else {
                _state.value = _state.value.copy(isLoading = false)
            }
        }
    }

    fun setBackend(backend: String) {
        _state.value = _state.value.copy(backend = backend, error = null)
    }

    fun setUrl(url: String) {
        _state.value = _state.value.copy(url = url)
    }

    fun setUsername(username: String) {
        _state.value = _state.value.copy(username = username)
    }

    fun setPassword(password: String) {
        _state.value = _state.value.copy(password = password)
    }

    fun connect() {
        val s = _state.value
        _state.value = s.copy(isLoading = true, error = null)

        viewModelScope.launch {
            val config = if (s.backend == "feedbin") {
                AdapterConfig(username = s.username, password = s.password)
            } else {
                AdapterConfig(
                    baseUrl = s.url.trimEnd('/'),
                    username = s.username,
                    password = s.password,
                )
            }

            val result = repository.connect(s.backend, config)
            if (result.isSuccess) {
                repository.refresh()
                _state.value = _state.value.copy(isLoading = false, isConnected = true)
            } else {
                _state.value = _state.value.copy(
                    isLoading = false,
                    error = result.exceptionOrNull()?.message ?: "Connection failed.",
                )
            }
        }
    }
}
