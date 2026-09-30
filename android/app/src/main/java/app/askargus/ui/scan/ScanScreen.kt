package app.askargus.ui.scan

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.scan.ScanState
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors

@Composable
fun ScanScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) {
    val vm = scanViewModel(container)
    val state by vm.state.collectAsState()
    val draft by vm.draft.collectAsState()
    val session by container.account.session.collectAsState()
    val clipboard = LocalClipboardManager.current
    val host = LocalHost.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::image) }
    val busy = state is ScanState.Reading || state is ScanState.Checking

    // Back from signing in: run the check that was waiting.
    LaunchedEffect(session) { if (session != null && state is ScanState.NeedsSignIn) vm.retry() }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Check anything", style = MaterialTheme.typography.headlineMedium)
        }
        LivingEye(moodFor(state), Modifier.fillMaxWidth(0.45f).align(Alignment.CenterHorizontally))
        OutlinedTextField(
            draft, vm::setDraft, Modifier.fillMaxWidth(), minLines = 4,
            placeholder = { Text("Paste a link, a message, an email or a phone number") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ArgusOutlinedButton("Paste", onClick = { clipboard.getText()?.text?.let(vm::setDraft) }, modifier = Modifier.weight(1f))
            ArgusOutlinedButton("Scan QR", onClick = { go(Routes.QR) }, modifier = Modifier.weight(1f))
            ArgusOutlinedButton(
                "Screenshot",
                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                modifier = Modifier.weight(1f),
            )
        }
        ArgusButton("Check", onClick = { vm.check(draft, "paste") }, modifier = Modifier.fillMaxWidth(), enabled = draft.isNotBlank(), busy = busy)
        when (val s = state) {
            ScanState.Idle -> Text(
                "Checks run on Argus's servers and are saved to your history. QR codes and screenshots are read on this phone.",
                style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
            )
            is ScanState.Reading -> Working(s.message)
            is ScanState.Checking -> Working("Checking live threat feeds, the page itself and more…")
            is ScanState.Done -> ResultView(s.verdict, s.scanId, onEvidence = { id -> host.openPage("/scan/$id") })
            is ScanState.Upi -> UpiCard(s.payment, onDismiss = vm::reset)
            is ScanState.NeedsSignIn -> ArgusCard {
                Text("Sign in to check it", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Checks use Argus's servers, so they need a free account. What you shared stays here until you're signed in.",
                    style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
                )
                Spacer(Modifier.height(12.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
            is ScanState.Failed -> ArgusCard {
                Text(s.message, color = ArgusColors.High)
                if (s.input != null) {
                    Spacer(Modifier.height(12.dp))
                    ArgusOutlinedButton("Try again", onClick = vm::retry)
                }
            }
        }
    }
}

@Composable
private fun Working(message: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArgusColors.Foreground)
        Spacer(Modifier.width(12.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
    }
}

private fun moodFor(state: ScanState): EyeMood = when (state) {
    is ScanState.Reading, is ScanState.Checking -> EyeMood.SCANNING
    is ScanState.Done -> when {
        state.verdict.score >= 60 -> EyeMood.DANGER
        state.verdict.score < 30 -> EyeMood.SAFE
        else -> EyeMood.WATCHING
    }
    is ScanState.Upi -> EyeMood.DANGER
    else -> EyeMood.WATCHING
}
