package com.stream.app.domain

import kotlinx.serialization.Serializable

@Serializable
data class MuteEntry(
    val sourceId: String,
    val sourceTitle: String,
    val mutedUntil: Long,  // epoch millis
)

data class MuteDuration(val label: String, val ms: Long)

val MUTE_DURATIONS = listOf(
    MuteDuration("1 day", 24 * 60 * 60 * 1000L),
    MuteDuration("1 week", 7 * 24 * 60 * 60 * 1000L),
    MuteDuration("1 month", 30 * 24 * 60 * 60 * 1000L),
)

/** Returns the set of currently-muted sourceIds (expired entries excluded). */
fun activeMutedIds(entries: List<MuteEntry>, now: Long = System.currentTimeMillis()): Set<String> {
    return entries.filter { it.mutedUntil > now }.map { it.sourceId }.toSet()
}
