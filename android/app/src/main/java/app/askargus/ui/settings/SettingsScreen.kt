package app.askargus.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.core.Versions
import app.askargus.net.ApiException
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    ArgusCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
fun SettingsScreen(container: AppContainer, go: (String) -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val session by container.account.session.collectAsState()
    var checking by remember { mutableStateOf(false) }
    var updateNote by remember { mutableStateOf<String?>(null) }
    var updateReady by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Section("Account") {
            val s = session
            if (s != null) {
                Text("Signed in as ${s.email ?: s.name ?: "you"}")
                ArgusOutlinedButton("Sign in to the website again", onClick = { host.openPage("/dashboard", force = true) }, modifier = Modifier.fillMaxWidth())
                ArgusOutlinedButton("Sign out", onClick = { scope.launch { container.account.signOut() } }, modifier = Modifier.fillMaxWidth())
            } else {
                Text("Not signed in. Checks need a free account.", color = ArgusColors.MutedText)
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
        }
        Section("Family") {
            Text("Invite the people you look out for.", color = ArgusColors.MutedText)
            ArgusOutlinedButton("Family", onClick = { go(Routes.FAMILY) }, modifier = Modifier.fillMaxWidth())
        }
        Section("Updates") {
            Text("Argus ${BuildConfig.VERSION_NAME}")
            ArgusOutlinedButton(
                if (checking) "Checking…" else "Check for updates",
                enabled = !checking,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    scope.launch {
                        checking = true
                        updateReady = false
                        updateNote = try {
                            val latest = container.api.latest()
                            when {
                                latest == null -> "There's no release on the download page yet."
                                Versions.isNewer(latest.version, BuildConfig.VERSION_NAME) -> { updateReady = true; "Version ${latest.version} is ready." }
                                else -> "You have the latest version."
                            }
                        } catch (e: ApiException) {
                            e.message
                        }
                        checking = false
                    }
                },
            )
            updateNote?.let { Text(it, color = ArgusColors.MutedText) }
            if (updateReady) ArgusButton("Download the update", onClick = { host.openUrl("${BuildConfig.APP_URL}/app") }, modifier = Modifier.fillMaxWidth())
        }
        Section("About") {
            Text(
                "Argus is free. It never says “Safe” without proof, and it tells you when a check couldn't finish.",
                color = ArgusColors.MutedText,
            )
            TextButton(onClick = { host.openUrl("${BuildConfig.APP_URL}/privacy") }) { Text("Privacy policy", color = ArgusColors.Foreground) }
            TextButton(onClick = { go(Routes.LICENSES) }) { Text("Open-source licences", color = ArgusColors.Foreground) }
        }
    }
}
