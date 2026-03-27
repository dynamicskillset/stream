package com.stream.app.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "sources")
data class Source(
    @PrimaryKey val id: String,
    val title: String,
    val siteUrl: String? = null,
    val feedUrl: String,
    val faviconUrl: String? = null,
    val categoryId: String? = null,
    val velocityTier: Int = 3,       // 1..5, default Article (24h)
    val customHalfLife: Double? = null, // hours; overrides tier when set
    val isVoice: Boolean = false,
)
