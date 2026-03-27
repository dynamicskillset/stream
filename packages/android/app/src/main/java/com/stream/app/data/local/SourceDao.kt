package com.stream.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.stream.app.data.model.Source
import kotlinx.coroutines.flow.Flow

@Dao
interface SourceDao {

    @Query("SELECT * FROM sources ORDER BY title ASC")
    fun observeAll(): Flow<List<Source>>

    @Query("SELECT * FROM sources ORDER BY title ASC")
    suspend fun getAll(): List<Source>

    @Upsert
    suspend fun upsertAll(sources: List<Source>)

    @Query("UPDATE sources SET velocityTier = :tier WHERE id = :id")
    suspend fun updateVelocityTier(id: String, tier: Int)

    @Query("UPDATE sources SET categoryId = :categoryId WHERE id = :id")
    suspend fun updateCategory(id: String, categoryId: String?)

    @Query("DELETE FROM sources")
    suspend fun deleteAll()
}
