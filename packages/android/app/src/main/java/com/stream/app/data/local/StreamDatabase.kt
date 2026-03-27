package com.stream.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.stream.app.data.model.Article
import com.stream.app.data.model.Category
import com.stream.app.data.model.Source

@Database(
    entities = [Article::class, Source::class, Category::class],
    version = 1,
    exportSchema = false,
)
abstract class StreamDatabase : RoomDatabase() {
    abstract fun articleDao(): ArticleDao
    abstract fun sourceDao(): SourceDao
}
