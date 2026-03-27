package com.stream.app.ui.river

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RiverScreen(
    onOpenArticle: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onDisconnected: () -> Unit,
    viewModel: RiverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = rememberUndoSnackbarState()
    val isConnected by viewModel.isConnected.collectAsState()

    // Navigate back to connect if disconnected
    LaunchedEffect(isConnected) {
        if (!isConnected) onDisconnected()
    }

    UndoSnackbarEffect(
        pendingUndo = state.pendingUndo,
        snackbarHostState = snackbarHostState,
        onUndo = { viewModel.undo() },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Stream") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
                actions = {
                    // Pause/Resume
                    IconButton(onClick = { viewModel.togglePause() }) {
                        Text(
                            text = if (state.isPaused) "\u25B6" else "\u23F8",
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    // Refresh
                    IconButton(onClick = { viewModel.refresh() }) {
                        Text(
                            text = "\u21BB",
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                    // Settings
                    IconButton(onClick = onOpenSettings) {
                        Text(
                            text = "\u2699",
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Pause banner
            if (state.isPaused) {
                Text(
                    text = "River paused \u2014 articles won\u2019t fade",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 4.dp),
                )
            }

            if (state.scoredItems.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = "The stream is quiet.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Filter bar
                    item {
                        FilterBar(
                            categories = state.categories,
                            activeCategory = state.activeCategory,
                            unreadOnly = state.unreadOnly,
                            savedOnly = state.savedOnly,
                            onCategory = { viewModel.setActiveCategory(it) },
                            onUnreadOnly = { viewModel.setUnreadOnly(it) },
                            onSavedOnly = { viewModel.setSavedOnly(it) },
                        )
                    }

                    items(
                        items = state.scoredItems,
                        key = { it.article.id },
                    ) { scored ->
                        val source = state.sources.find { it.id == scored.article.sourceId }
                            ?: return@items

                        val dismissState = rememberSwipeToDismissBoxState(
                            confirmValueChange = { value ->
                                when (value) {
                                    SwipeToDismissBoxValue.StartToEnd -> {
                                        viewModel.save(scored.article.id)
                                        false // Don't actually dismiss the card
                                    }
                                    SwipeToDismissBoxValue.EndToStart -> {
                                        viewModel.dismiss(scored.article.id)
                                        true
                                    }
                                    else -> false
                                }
                            }
                        )

                        SwipeToDismissBox(
                            state = dismissState,
                            backgroundContent = {},
                        ) {
                            RiverCard(
                                scored = scored,
                                source = source,
                                isSaved = scored.article.id in state.savedIds,
                                onOpen = { onOpenArticle(scored.article.id) },
                                onDismiss = { viewModel.dismiss(scored.article.id) },
                                onSave = { viewModel.save(scored.article.id) },
                                onShare = {
                                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                        putExtra(Intent.EXTRA_TEXT, scored.article.url)
                                        putExtra(Intent.EXTRA_TITLE, scored.article.title)
                                        type = "text/plain"
                                    }
                                    context.startActivity(Intent.createChooser(sendIntent, "Share article"))
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

