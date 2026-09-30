package app.askargus.ui.nav

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.askargus.AppContainer
import app.askargus.R
import app.askargus.core.Incoming
import app.askargus.ui.activity.ActivityScreen
import app.askargus.ui.argus.ArgusScreen
import app.askargus.ui.family.FamilyScreen
import app.askargus.ui.HomeScreen
import app.askargus.ui.family.JoinFamilyScreen
import app.askargus.ui.settings.LicensesScreen
import app.askargus.ui.scan.QrCameraScreen
import app.askargus.ui.scan.ScanScreen
import app.askargus.ui.scan.scanViewModel
import app.askargus.ui.settings.SettingsScreen
import app.askargus.ui.auth.SignInScreen
import app.askargus.ui.onboarding.WelcomeScreen
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

object Routes {
    const val WELCOME = "welcome"
    const val SIGN_IN = "signin?back={back}"
    const val HOME = "home"
    const val ACTIVITY = "activity"
    const val ARGUS = "argus"
    const val SETTINGS = "settings"
    const val SCAN = "scan"
    const val QR = "qr"
    const val FAMILY = "family"
    const val LICENSES = "licenses"
    const val JOIN = "join/{code}"
    fun signIn(back: Boolean) = "signin?back=$back"
    fun join(code: String) = "join/$code"
}

private data class Tab(val route: String, val label: String, val icon: @Composable () -> Unit)

@Composable
fun ArgusNav(container: AppContainer, onboarded: Boolean, incoming: StateFlow<Incoming?>, onIncomingHandled: () -> Unit) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val scope = rememberCoroutineScope()
    val go: (String) -> Unit = { nav.navigate(it) }
    val back: () -> Unit = { nav.popBackStack() }
    val tabs = listOf(
        Tab(Routes.HOME, "Home") { Icon(Icons.Default.Home, contentDescription = null) },
        Tab(Routes.ACTIVITY, "Activity") { Icon(Icons.Default.List, contentDescription = null) },
        Tab(Routes.ARGUS, "Argus") { Icon(painterResource(R.drawable.ic_notification), contentDescription = null) },
        Tab(Routes.SETTINGS, "Settings") { Icon(Icons.Default.Settings, contentDescription = null) },
    )
    val finishOnboarding: () -> Unit = {
        scope.launch { container.prefs.setOnboarded() }
        nav.navigate(Routes.HOME) { popUpTo(0) { inclusive = true } }
    }
    val scan = scanViewModel(container)
    val pending by incoming.collectAsState()
    LaunchedEffect(pending) {
        when (val item = pending ?: return@LaunchedEffect) {
            is Incoming.Text -> {
                scan.check(item.text, "share")
                nav.navigate(Routes.SCAN) { launchSingleTop = true }
            }
            is Incoming.Image -> {
                scan.image(Uri.parse(item.uri))
                nav.navigate(Routes.SCAN) { launchSingleTop = true }
            }
            is Incoming.Join -> nav.navigate(Routes.join(item.code))
        }
        onIncomingHandled()
    }

    Scaffold(
        containerColor = ArgusColors.Background,
        bottomBar = {
            if (tabs.any { it.route == route }) {
                NavigationBar(containerColor = ArgusColors.Card) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(Routes.HOME) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = tab.icon,
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = ArgusColors.Foreground,
                                selectedTextColor = ArgusColors.Foreground,
                                indicatorColor = ArgusColors.Accent,
                                unselectedIconColor = ArgusColors.MutedText,
                                unselectedTextColor = ArgusColors.MutedText,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = if (onboarded) Routes.HOME else Routes.WELCOME, modifier = Modifier.padding(padding)) {
            composable(Routes.WELCOME) { WelcomeScreen(onStart = { nav.navigate(Routes.signIn(back = false)) }) }
            composable(Routes.SIGN_IN, arguments = listOf(navArgument("back") { type = NavType.BoolType; defaultValue = false })) {
                val returning = it.arguments?.getBoolean("back") ?: false
                val leave: () -> Unit = { if (returning) back() else finishOnboarding() }
                SignInScreen(container, back = returning, onDone = leave, onSkip = leave)
            }
            composable(Routes.HOME) { HomeScreen(container, go) }
            composable(Routes.ACTIVITY) { ActivityScreen(container) }
            composable(Routes.ARGUS) { ArgusScreen(container) }
            composable(Routes.SETTINGS) { SettingsScreen(container, go) }
            composable(Routes.SCAN) { ScanScreen(container, go, back) }
            composable(Routes.QR) { QrCameraScreen(container, back) }
            composable(Routes.FAMILY) { FamilyScreen(container, go, back) }
            composable(Routes.LICENSES) { LicensesScreen(back) }
            composable(Routes.JOIN) { JoinFamilyScreen(container, it.arguments?.getString("code").orEmpty(), go, back) }
        }
    }
}
