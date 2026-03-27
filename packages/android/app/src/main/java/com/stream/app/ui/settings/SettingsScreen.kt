package com.stream.app.ui.settings

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.stream.app.data.local.PrefsStore
import com.stream.app.data.model.VelocityTier
import com.stream.app.ui.theme.Nord8
import com.stream.app.ui.theme.Nord13
import com.stream.app.ui.theme.Nord14
import com.stream.app.ui.theme.Nord15

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onDisconnected: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    val opmlLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            val xml = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
            if (xml != null) viewModel.importOPML(xml)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text(
                            text = "\u2190",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // --- Add Feeds ---
            item {
                SectionHeader("Add feeds")
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = state.addFeedUrl,
                        onValueChange = { viewModel.setAddFeedUrl(it) },
                        placeholder = { Text("Feed URL") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { viewModel.addFeed() }) {
                        Text("Add")
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { opmlLauncher.launch("text/*") }) {
                    Text("Import OPML")
                }
                if (state.addFeedStatus != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = state.addFeedStatus!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // --- Display ---
            item {
                SectionHeader("Display")
                Spacer(Modifier.height(8.dp))

                // Text size
                Text("Text size", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (size in listOf("small", "default", "large")) {
                        OutlinedButton(
                            onClick = {
                                viewModel.updateDisplayPrefs(state.displayPrefs.copy(textSize = size))
                            },
                            colors = if (state.displayPrefs.textSize == size) {
                                ButtonDefaults.outlinedButtonColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                                )
                            } else ButtonDefaults.outlinedButtonColors(),
                        ) {
                            Text(size.replaceFirstChar { it.uppercase() })
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))

                // Accent color
                Text("Accent color", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val accents = listOf(
                        "frost" to Nord8,
                        "yellow" to Nord13,
                        "green" to Nord14,
                        "berry" to Nord15,
                    )
                    for ((id, color) in accents) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(color)
                                .then(
                                    if (state.displayPrefs.accentColor == id)
                                        Modifier.border(2.dp, MaterialTheme.colorScheme.onBackground, CircleShape)
                                    else Modifier
                                )
                                .clickable {
                                    viewModel.updateDisplayPrefs(state.displayPrefs.copy(accentColor = id))
                                },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))

                // Fade level
                Text("Fade intensity", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (level in listOf("none", "subtle", "full")) {
                        OutlinedButton(
                            onClick = {
                                viewModel.updateDisplayPrefs(state.displayPrefs.copy(fadeLevel = level))
                            },
                            colors = if (state.displayPrefs.fadeLevel == level) {
                                ButtonDefaults.outlinedButtonColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                                )
                            } else ButtonDefaults.outlinedButtonColors(),
                        ) {
                            Text(level.replaceFirstChar { it.uppercase() })
                        }
                    }
                }
            }

            // --- Velocity tiers ---
            item {
                SectionHeader("Velocity tiers")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = { viewModel.setSearchQuery(it) },
                    placeholder = { Text("Search sources...") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            val filteredSources = state.sources.filter {
                state.searchQuery.isEmpty() ||
                    it.title.contains(state.searchQuery, ignoreCase = true)
            }
            items(filteredSources, key = { it.id }) { source ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = source.title,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = VelocityTier.fromTier(source.velocityTier).label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Slider(
                        value = source.velocityTier.toFloat(),
                        onValueChange = {
                            viewModel.updateVelocityTier(source.id, it.toInt())
                        },
                        valueRange = 1f..5f,
                        steps = 3,
                        modifier = Modifier.width(120.dp),
                    )
                }
            }

            // --- Muted sources ---
            if (state.mutedEntries.isNotEmpty()) {
                item {
                    SectionHeader("Muted sources")
                }
                items(state.mutedEntries, key = { it.sourceId }) { entry ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = entry.sourceTitle,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedButton(onClick = { viewModel.unmuteSource(entry.sourceId) }) {
                            Text("Unmute")
                        }
                    }
                }
            }

            // --- Disconnect ---
            item {
                Spacer(Modifier.height(16.dp))
                OutlinedButton(
                    onClick = {
                        viewModel.disconnect()
                        onDisconnected()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Disconnect", color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onBackground,
    )
}
