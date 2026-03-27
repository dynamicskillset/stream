package com.stream.app.data.adapter

import okhttp3.OkHttpClient

object AdapterFactory {
    fun create(adapterId: String, client: OkHttpClient): StreamAdapter {
        return when (adapterId) {
            "feedbin" -> FeedbinAdapter(client)
            "freshrss" -> FreshRSSAdapter(client)
            else -> throw IllegalArgumentException("Unknown adapter: $adapterId")
        }
    }
}
