package com.stream.app.ui.river

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.stream.app.data.model.ScoredArticle
import com.stream.app.data.model.Source
import com.stream.app.domain.RiverEngine

private fun stripHtml(html: String): String {
    return html.replace(Regex("<[^>]+>"), " ").replace(Regex("\\s+"), " ").trim()
}

private fun makePreview(html: String): String {
    val text = stripHtml(html)
    if (text.length <= 100) return text
    return text.take(100).replace(Regex("\\s\\S*$"), "") + "\u2026"
}

private fun readingMins(html: String): Int? {
    val words = stripHtml(html).split(Regex("\\s+")).filter { it.isNotEmpty() }.size
    if (words < 50) return null
    return maxOf(1, (words + 199) / 200)
}

private fun scoreToAge(score: Double): Float {
    val age = 1.0 - (score - RiverEngine.VISIBILITY_THRESHOLD) / (1.0 - RiverEngine.VISIBILITY_THRESHOLD)
    return age.coerceIn(0.0, 1.0).toFloat()
}

@Composable
fun relativeTime(epochMillis: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - epochMillis
    return remember(epochMillis) {
        when {
            diff < 60_000 -> "now"
            diff < 3_600_000 -> "${diff / 60_000}m ago"
            diff < 86_400_000 -> "${diff / 3_600_000}h ago"
            diff < 604_800_000 -> "${diff / 86_400_000}d ago"
            else -> "${diff / 604_800_000}w ago"
        }
    }
}

@Composable
fun RiverCard(
    scored: ScoredArticle,
    source: Source,
    isSaved: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val article = scored.article
    val cardAge = scoreToAge(scored.score)
    val fadeAlpha = 1f - (cardAge * 0.7f) // Max 70% fade
    val preview = remember(article.content) { makePreview(article.content) }
    val mins = remember(article.content) { readingMins(article.content) }
    val relTime = relativeTime(article.publishedAt)
    val accentColor = MaterialTheme.colorScheme.primary

    Card(
        onClick = onOpen,
        modifier = modifier
            .fillMaxWidth()
            .alpha(fadeAlpha)
            .drawBehind {
                // Age progress bar on left border
                val barHeight = size.height * (1f - cardAge)
                drawLine(
                    color = accentColor,
                    start = Offset(0f, size.height),
                    end = Offset(0f, size.height - barHeight),
                    strokeWidth = 3.dp.toPx(),
                )
            },
        shape = RoundedCornerShape(4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Header: favicon, source, time, reading time, actions
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                // Favicon
                if (source.faviconUrl != null) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(source.faviconUrl)
                            .crossfade(true)
                            .build(),
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                } else {
                    // Fallback: first letter
                    Box(
                        modifier = Modifier.size(16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = source.title.take(1),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                }

                Text(
                    text = source.title,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )

                Spacer(Modifier.width(8.dp))

                Text(
                    text = relTime,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (mins != null) {
                    Text(
                        text = " \u00B7 ${mins} min read",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Spacer(Modifier.weight(1f))

                // Action buttons
                Row(horizontalArrangement = Arrangement.End) {
                    IconButton(onClick = onShare, modifier = Modifier.size(32.dp)) {
                        Text(
                            text = "\u21B1",  // share arrow
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onSave, modifier = Modifier.size(32.dp)) {
                        Text(
                            text = if (isSaved) "\u2665" else "\u2661",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (isSaved) MaterialTheme.colorScheme.tertiary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                        Text(
                            text = "\u00D7",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            // Title
            Text(
                text = article.title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            // Preview
            if (preview.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
