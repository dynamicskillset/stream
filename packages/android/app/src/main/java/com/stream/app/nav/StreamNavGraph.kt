package com.stream.app.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.stream.app.ui.connect.ConnectScreen
import com.stream.app.ui.reading.ReadingScreen
import com.stream.app.ui.river.RiverScreen
import com.stream.app.ui.settings.SettingsScreen

object Routes {
    const val CONNECT = "connect"
    const val RIVER = "river"
    const val READING = "reading/{articleId}"
    const val SETTINGS = "settings"

    fun reading(articleId: String) = "reading/$articleId"
}

@Composable
fun StreamNavGraph() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Routes.CONNECT,
    ) {
        composable(Routes.CONNECT) {
            ConnectScreen(
                onConnected = {
                    navController.navigate(Routes.RIVER) {
                        popUpTo(Routes.CONNECT) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.RIVER) {
            RiverScreen(
                onOpenArticle = { articleId ->
                    navController.navigate(Routes.reading(articleId))
                },
                onOpenSettings = {
                    navController.navigate(Routes.SETTINGS)
                },
                onDisconnected = {
                    navController.navigate(Routes.CONNECT) {
                        popUpTo(Routes.RIVER) { inclusive = true }
                    }
                },
            )
        }

        composable(
            route = Routes.READING,
            arguments = listOf(navArgument("articleId") { type = NavType.StringType }),
        ) {
            ReadingScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onDisconnected = {
                    navController.navigate(Routes.CONNECT) {
                        popUpTo(Routes.RIVER) { inclusive = true }
                    }
                },
            )
        }
    }
}
