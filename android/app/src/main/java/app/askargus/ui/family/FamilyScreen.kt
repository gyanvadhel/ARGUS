package app.askargus.ui.family

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
fun FamilyScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) {
    val vm: FamilyViewModel = viewModel { FamilyViewModel(container.api) }
    val state by vm.state.collectAsState()
    val session by container.account.session.collectAsState()
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(session) { vm.load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Family", style = MaterialTheme.typography.headlineMedium)
        }
        Text(
            "Invite the people you look out for, like parents or grandparents. Once they join, you'll be able to see that " +
                "Argus is protecting them and hear when it warns them about a likely scam (coming in a later update). " +
                "What their messages say and which sites they visit are never shared.",
            style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
        )
        when {
            session == null || state.signedOut -> ArgusCard {
                Text("Sign in to invite family.")
                Spacer(Modifier.height(10.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
            state.loading -> CircularProgressIndicator(color = ArgusColors.Foreground)
            else -> {
                ArgusButton(
                    "Invite family",
                    busy = state.busy,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        scope.launch {
                            vm.invite()?.let { host.share("Join my family on Argus, so we can look out for each other: ${it.url}", "Invite family") }
                        }
                    },
                )
                Text("Each link works once and expires in 7 days.", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                if (state.members.isEmpty()) Text("No family members yet.")
                state.members.forEach { m ->
                    ArgusCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(m.name, style = MaterialTheme.typography.titleMedium)
                                Text("Joined ${m.joinedAt.take(10)}", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                            }
                            TextButton(onClick = { vm.leave(m.linkId) }) { Text("Remove", color = ArgusColors.High) }
                        }
                    }
                }
            }
        }
        state.error?.let { Text(it, color = ArgusColors.High) }
    }
}
