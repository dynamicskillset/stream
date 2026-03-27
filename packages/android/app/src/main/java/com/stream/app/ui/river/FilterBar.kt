package com.stream.app.ui.river

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.stream.app.data.model.Category

@Composable
fun FilterBar(
    categories: List<Category>,
    activeCategory: String?,
    unreadOnly: Boolean,
    savedOnly: Boolean,
    onCategory: (String?) -> Unit,
    onUnreadOnly: (Boolean) -> Unit,
    onSavedOnly: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Category pills
        if (categories.isNotEmpty()) {
            FilterChip(
                selected = activeCategory == null,
                onClick = { onCategory(null) },
                label = { Text("All") },
            )
            for (cat in categories) {
                FilterChip(
                    selected = activeCategory == cat.id,
                    onClick = {
                        onCategory(if (activeCategory == cat.id) null else cat.id)
                    },
                    label = { Text(cat.title) },
                )
            }
        }

        // Status pills
        FilterChip(
            selected = unreadOnly,
            onClick = { onUnreadOnly(!unreadOnly) },
            label = { Text("Unread") },
        )
        FilterChip(
            selected = savedOnly,
            onClick = { onSavedOnly(!savedOnly) },
            label = { Text("Saved") },
        )
    }
}
