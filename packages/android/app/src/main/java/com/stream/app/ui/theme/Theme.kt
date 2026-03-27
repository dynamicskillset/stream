package com.stream.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    // Nord Snow Storm backgrounds
    background = Nord6,
    surface = Nord5,
    surfaceVariant = Nord5,
    outline = Nord4,
    outlineVariant = Nord4,

    // Nord Polar Night text
    onBackground = Nord0,
    onSurface = Nord0,
    onSurfaceVariant = Nord3,

    // Nord Frost accent
    primary = Nord10,
    onPrimary = Nord6,
    primaryContainer = Nord9,
    onPrimaryContainer = Nord0,

    // Aurora orange for saved / tertiary
    tertiary = Nord12,
    onTertiary = Nord6,
    tertiaryContainer = Nord12,
    onTertiaryContainer = Nord0,

    // Error
    error = ErrorLight,
    onError = Nord6,

    // Surface containers
    surfaceContainer = Nord5,
    surfaceContainerHigh = Nord4,
    surfaceContainerHighest = Nord4,
    surfaceContainerLow = Nord6,
    surfaceContainerLowest = Nord6,
)

private val DarkColorScheme = darkColorScheme(
    // Nord Polar Night backgrounds
    background = Nord0,
    surface = Nord1,
    surfaceVariant = Nord1,
    outline = Nord2,
    outlineVariant = Nord2,

    // Nord Snow Storm text
    onBackground = Nord6,
    onSurface = Nord6,
    onSurfaceVariant = Nord4,

    // Nord Frost accent
    primary = Nord8,
    onPrimary = Nord0,
    primaryContainer = Nord9,
    onPrimaryContainer = Nord6,

    // Aurora orange for saved / tertiary
    tertiary = Nord12,
    onTertiary = Nord0,
    tertiaryContainer = Nord12,
    onTertiaryContainer = Nord6,

    // Error
    error = ErrorDark,
    onError = Nord0,

    // Surface containers
    surfaceContainer = Nord1,
    surfaceContainerHigh = Nord2,
    surfaceContainerHighest = Nord2,
    surfaceContainerLow = Nord0,
    surfaceContainerLowest = Nord0,
)

@Composable
fun StreamTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = StreamTypography,
        content = content,
    )
}
