package com.stream.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.stream.app.data.model.Article
import kotlinx.coroutines.flow.Flow

@Dao
interface ArticleDao {

    @Query("SELECT * FROM articles ORDER BY publishedAt DESC")
    fun observeAll(): Flow<List<Article>>

    @Query("SELECT * FROM articles ORDER BY publishedAt DESC")
    suspend fun getAll(): List<Article>

    @Query("SELECT * FROM articles WHERE isStarred = 1 ORDER BY publishedAt DESC")
    fun observeStarred(): Flow<List<Article>>

    @Query("SELECT * FROM articles WHERE isRead = 0 ORDER BY publishedAt DESC")
    fun observeUnread(): Flow<List<Article>>

    @Query("SELECT * FROM articles WHERE id = :id")
    suspend fun getById(id: String): Article?

    @Upsert
    suspend fun upsertAll(articles: List<Article>)

    @Query("UPDATE articles SET isRead = 1 WHERE id = :id")
    suspend fun markRead(id: String)

    @Query("UPDATE articles SET isStarred = :starred WHERE id = :id")
    suspend fun setStarred(id: String, starred: Boolean)

    @Query("DELETE FROM articles WHERE publishedAt < :cutoffMillis AND isStarred = 0")
    suspend fun deleteOlderThan(cutoffMillis: Long)

    @Query("DELETE FROM articles")
    suspend fun deleteAll()
}
