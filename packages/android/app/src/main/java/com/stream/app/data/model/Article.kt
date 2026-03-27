package com.stream.app.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Serializable
@Entity(tableName = "articles")
data class Article(
    @PrimaryKey val id: String,
    val sourceId: String,
    val title: String,
    val author: String? = null,
    val url: String,
    val content: String,
    val publishedAt: Long,       // epoch millis
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
)
