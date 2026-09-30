package app.askargus.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.nav.Routes
import kotlinx.coroutines.launch

@Composable
private fun Placeholder(title: String, content: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        content()
    }
}

@Composable
fun HomeScreen(container: AppContainer, go: (String) -> Unit) {
    val session by container.account.session.collectAsState()
    Placeholder("Home") {
        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.6f))
        Text(session?.let { "Signed in as ${it.email}" } ?: "Signed out")
        if (session == null) ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) })
        ArgusButton("Check something", onClick = { go(Routes.SCAN) })
    }
}

@Composable
fun SettingsScreen(container: AppContainer, go: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val session by container.account.session.collectAsState()
    Placeholder("Settings") {
        if (session != null) ArgusButton("Sign out", onClick = { scope.launch { container.account.signOut() } })
    }
}

@Composable fun QrCameraScreen(container: AppContainer, back: () -> Unit) = Placeholder("Scan a QR code")
@Composable fun ArgusScreen(container: AppContainer) = Placeholder("Argus")
@Composable fun FamilyScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) = Placeholder("Family")
@Composable fun JoinFamilyScreen(container: AppContainer, code: String, go: (String) -> Unit, back: () -> Unit) = Placeholder("Join a family")
@Composable fun LicensesScreen(back: () -> Unit) = Placeholder("Licences")
