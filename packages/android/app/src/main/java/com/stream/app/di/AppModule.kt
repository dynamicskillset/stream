package com.stream.app.di

import android.content.Context
import androidx.room.Room
import com.stream.app.data.local.ArticleDao
import com.stream.app.data.local.PrefsStore
import com.stream.app.data.local.SourceDao
import com.stream.app.data.local.StreamDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): StreamDatabase {
        return Room.databaseBuilder(
            context,
            StreamDatabase::class.java,
            "stream.db",
        ).build()
    }

    @Provides
    fun provideArticleDao(db: StreamDatabase): ArticleDao = db.articleDao()

    @Provides
    fun provideSourceDao(db: StreamDatabase): SourceDao = db.sourceDao()

    @Provides
    @Singleton
    fun providePrefsStore(@ApplicationContext context: Context): PrefsStore {
        return PrefsStore(context)
    }
}
