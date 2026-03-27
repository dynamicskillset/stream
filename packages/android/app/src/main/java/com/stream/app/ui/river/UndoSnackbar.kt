package com.stream.app.ui.river

import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import com.stream.app.data.model.Article

@Composable
fun rememberUndoSnackbarState(): SnackbarHostState = remember { SnackbarHostState() }

@Composable
fun UndoSnackbarEffect(
    pendingUndo: Article?,
    snackbarHostState: SnackbarHostState,
    onUndo: () -> Unit,
) {
    LaunchedEffect(pendingUndo) {
        if (pendingUndo != null) {
            val result = snackbarHostState.showSnackbar(
                message = "Article dismissed",
                actionLabel = "Undo",
                duration = SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed) {
                onUndo()
            }
        }
    }
}
