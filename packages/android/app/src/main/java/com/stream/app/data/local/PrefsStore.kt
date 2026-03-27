package com.stream.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.stream.app.domain.MuteEntry
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.dataStore by preferencesDataStore(name = "stream_prefs")

/**
 * DataStore wrapper — mirrors the web app's localStorage keys.
 */
class PrefsStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    // --- Connection -----------------------------------------------------------

    private val KEY_ADAPTER_ID = stringPreferencesKey("connection_adapter_id")
    private val KEY_BASE_URL = stringPreferencesKey("connection_base_url")
    private val KEY_USERNAME = stringPreferencesKey("connection_username")
    private val KEY_PASSWORD = stringPreferencesKey("connection_password")

    data class SavedConnection(
        val adapterId: String,
        val baseUrl: String?,
        val username: String?,
        val password: String?,
    )

    val connectionFlow: Flow<SavedConnection?> = context.dataStore.data.map { prefs ->
        val adapterId = prefs[KEY_ADAPTER_ID] ?: return@map null
        SavedConnection(
            adapterId = adapterId,
            baseUrl = prefs[KEY_BASE_URL],
            username = prefs[KEY_USERNAME],
            password = prefs[KEY_PASSWORD],
        )
    }

    suspend fun saveConnection(adapterId: String, baseUrl: String?, username: String?, password: String?) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ADAPTER_ID] = adapterId
            baseUrl?.let { prefs[KEY_BASE_URL] = it } ?: prefs.remove(KEY_BASE_URL)
            username?.let { prefs[KEY_USERNAME] = it } ?: prefs.remove(KEY_USERNAME)
            password?.let { prefs[KEY_PASSWORD] = it } ?: prefs.remove(KEY_PASSWORD)
        }
    }

    suspend fun clearConnection() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_ADAPTER_ID)
            prefs.remove(KEY_BASE_URL)
            prefs.remove(KEY_USERNAME)
            prefs.remove(KEY_PASSWORD)
        }
    }

    suspend fun getSavedConnection(): SavedConnection? = connectionFlow.first()

    // --- Display prefs --------------------------------------------------------

    private val KEY_TEXT_SIZE = stringPreferencesKey("display_text_size")
    private val KEY_FADE_LEVEL = stringPreferencesKey("display_fade_level")
    private val KEY_ACCENT_COLOR = stringPreferencesKey("display_accent_color")

    data class DisplayPrefs(
        val textSize: String = "default",     // small, default, large
        val fadeLevel: String = "full",        // none, subtle, full
        val accentColor: String = "frost",     // frost, yellow, green, berry
    )

    val displayPrefsFlow: Flow<DisplayPrefs> = context.dataStore.data.map { prefs ->
        DisplayPrefs(
            textSize = prefs[KEY_TEXT_SIZE] ?: "default",
            fadeLevel = prefs[KEY_FADE_LEVEL] ?: "full",
            accentColor = prefs[KEY_ACCENT_COLOR] ?: "frost",
        )
    }

    suspend fun saveDisplayPrefs(prefs: DisplayPrefs) {
        context.dataStore.edit { p ->
            p[KEY_TEXT_SIZE] = prefs.textSize
            p[KEY_FADE_LEVEL] = prefs.fadeLevel
            p[KEY_ACCENT_COLOR] = prefs.accentColor
        }
    }

    // --- Muted sources --------------------------------------------------------

    private val KEY_MUTED_SOURCES = stringPreferencesKey("muted_sources")

    val mutedSourcesFlow: Flow<List<MuteEntry>> = context.dataStore.data.map { prefs ->
        val raw = prefs[KEY_MUTED_SOURCES] ?: return@map emptyList()
        try { json.decodeFromString<List<MuteEntry>>(raw) } catch (_: Exception) { emptyList() }
    }

    suspend fun saveMutedSources(entries: List<MuteEntry>) {
        context.dataStore.edit { prefs ->
            prefs[KEY_MUTED_SOURCES] = json.encodeToString(entries)
        }
    }

    // --- Quiet hours ----------------------------------------------------------

    private val KEY_PAUSED_AT = longPreferencesKey("quiet_paused_at")
    private val KEY_ACCUMULATED_MS = longPreferencesKey("quiet_accumulated_ms")

    data class QuietHoursState(
        val pausedAt: Long? = null,
        val accumulatedMs: Long = 0L,
    )

    val quietHoursFlow: Flow<QuietHoursState> = context.dataStore.data.map { prefs ->
        QuietHoursState(
            pausedAt = prefs[KEY_PAUSED_AT],
            accumulatedMs = prefs[KEY_ACCUMULATED_MS] ?: 0L,
        )
    }

    suspend fun pauseRiver() {
        context.dataStore.edit { prefs ->
            if (prefs[KEY_PAUSED_AT] == null) {
                prefs[KEY_PAUSED_AT] = System.currentTimeMillis()
            }
        }
    }

    suspend fun resumeRiver() {
        context.dataStore.edit { prefs ->
            val pausedAt = prefs[KEY_PAUSED_AT] ?: return@edit
            val additional = System.currentTimeMillis() - pausedAt
            prefs[KEY_ACCUMULATED_MS] = (prefs[KEY_ACCUMULATED_MS] ?: 0L) + additional
            prefs.remove(KEY_PAUSED_AT)
        }
    }

    fun effectiveNow(wallNow: Long, state: QuietHoursState): Long {
        val currentPauseMs = if (state.pausedAt != null) wallNow - state.pausedAt else 0L
        return wallNow - state.accumulatedMs - currentPauseMs
    }

    // --- Reading progress -----------------------------------------------------

    private val KEY_READING_PROGRESS = stringPreferencesKey("reading_progress")

    @kotlinx.serialization.Serializable
    data class ProgressEntry(val pct: Float, val ts: Long)

    suspend fun saveReadingProgress(articleId: String, pct: Float) {
        context.dataStore.edit { prefs ->
            val raw = prefs[KEY_READING_PROGRESS] ?: "{}"
            val map = try {
                json.decodeFromString<MutableMap<String, ProgressEntry>>(raw)
            } catch (_: Exception) { mutableMapOf() }
            map[articleId] = ProgressEntry(pct, System.currentTimeMillis())
            prefs[KEY_READING_PROGRESS] = json.encodeToString(map)
        }
    }

    suspend fun getReadingProgress(articleId: String): Float? {
        val prefs = context.dataStore.data.first()
        val raw = prefs[KEY_READING_PROGRESS] ?: return null
        val map = try {
            json.decodeFromString<Map<String, ProgressEntry>>(raw)
        } catch (_: Exception) { return null }
        val entry = map[articleId] ?: return null
        // 7-day TTL
        if (System.currentTimeMillis() - entry.ts > 7 * 24 * 60 * 60 * 1000L) return null
        return entry.pct
    }
}
