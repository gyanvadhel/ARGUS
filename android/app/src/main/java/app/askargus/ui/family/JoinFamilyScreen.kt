package app.askargus.ui.family

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.family.JoinViewModel.UiState
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors

@Composable
fun JoinFamilyScreen(container: AppContainer, code: String, go: (String) -> Unit, back: () -> Unit) {
    val vm: JoinViewModel = viewModel(key = code) { JoinViewModel(container.api, code) }
    val state by vm.state.collectAsState()
    val session by container.account.session.collectAsState()
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        LivingEye(if (state is UiState.Joined) EyeMood.SAFE else EyeMood.WATCHING, Modifier.fillMaxWidth(0.5f))
        when (val s = state) {
            UiState.Loading -> CircularProgressIndicator(color = ArgusColors.Foreground)
            UiState.Dead -> {
                Text("This invite doesn't work anymore", style = MaterialTheme.typography.headlineMedium)
                Text("It has expired or was already used. Ask for a new one.", color = ArgusColors.MutedText)
                ArgusButton("Done", onClick = { go(Routes.HOME) }, modifier = Modifier.fillMaxWidth())
            }
            is UiState.Invite -> {
                Text("${s.name ?: "Someone"} invited you to their family on Argus", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "Joining links your two Argus accounts. Soon you'll see that Argus is protecting each other, and hear when it " +
                        "warns about a likely scam. What your messages say and which sites you visit are never shared.",
                    color = ArgusColors.MutedText,
                )
                if (session == null) ArgusButton("Sign in to join", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
                else ArgusButton("Join the family", onClick = vm::join, busy = s.busy, modifier = Modifier.fillMaxWidth())
                s.error?.let { Text(it, color = ArgusColors.High) }
            }
            is UiState.Joined -> {
                Text("You and ${s.name} are now family on Argus", style = MaterialTheme.typography.headlineMedium)
                ArgusButton("Done", onClick = { go(Routes.HOME) }, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
