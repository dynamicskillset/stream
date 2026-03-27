package com.stream.app.ui.reading

import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReadingScreen(
    onBack: () -> Unit,
    viewModel: ReadingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val isDark = isSystemInDarkTheme()

    val article = state.article
    if (article == null) {
        onBack()
        return
    }

    val bgColor = MaterialTheme.colorScheme.background.toArgb()
    val textColor = MaterialTheme.colorScheme.onBackground.toArgb()
    val linkColor = MaterialTheme.colorScheme.primary.toArgb()

    val htmlContent = remember(article.content, isDark) {
        buildReadingHtml(
            title = article.title,
            content = article.content,
            bgColor = bgColor,
            textColor = textColor,
            linkColor = linkColor,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text(
                            text = "\u2190 Stream",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
                actions = {
                    // Share
                    IconButton(onClick = {
                        val sendIntent = Intent(Intent.ACTION_SEND).apply {
                            putExtra(Intent.EXTRA_TEXT, article.url)
                            putExtra(Intent.EXTRA_TITLE, article.title)
                            type = "text/plain"
                        }
                        context.startActivity(Intent.createChooser(sendIntent, "Share"))
                    }) {
                        Text(
                            text = "\u21B1",
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    // Save
                    IconButton(onClick = { viewModel.toggleSave() }) {
                        Text(
                            text = if (state.isSaved) "\u2665" else "\u2661",
                            color = if (state.isSaved) MaterialTheme.colorScheme.tertiary
                            else MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    // Open in browser
                    IconButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(article.url)))
                    }) {
                        Text(
                            text = "\u2197",
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Source meta
            if (state.source != null) {
                Text(
                    text = state.source!!.title,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(4.dp))
            }

            // WebView with article content
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                url: String?,
                            ): Boolean {
                                if (url != null) {
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }
                                return true
                            }
                        }
                        settings.apply {
                            javaScriptEnabled = false
                            loadWithOverviewMode = true
                            useWideViewPort = true
                        }
                        setBackgroundColor(bgColor)
                        loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )
        }
    }
}

private fun buildReadingHtml(
    title: String,
    content: String,
    bgColor: Int,
    textColor: Int,
    linkColor: Int,
): String {
    val bg = String.format("#%06X", bgColor and 0xFFFFFF)
    val text = String.format("#%06X", textColor and 0xFFFFFF)
    val link = String.format("#%06X", linkColor and 0xFFFFFF)

    return """
    <!DOCTYPE html>
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            background: $bg;
            color: $text;
            font-family: Georgia, serif;
            font-size: 18px;
            line-height: 1.7;
            padding: 16px;
            margin: 0;
            word-wrap: break-word;
        }
        a { color: $link; }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
        }
        pre, code {
            overflow-x: auto;
            font-size: 14px;
        }
        h1, h2, h3, h4, h5, h6 {
            line-height: 1.3;
        }
        blockquote {
            border-left: 3px solid $link;
            margin-left: 0;
            padding-left: 16px;
            opacity: 0.85;
        }
    </style>
    </head>
    <body>
    $content
    </body>
    </html>
    """.trimIndent()
}
