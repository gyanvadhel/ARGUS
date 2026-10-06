package app.askargus.ui.settings

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.calls.CallRole
import app.askargus.ui.theme.ArgusColors
import app.askargus.work.ScamListWorker
import kotlinx.coroutines.launch

@Composable
fun CallWarningsBody(container: AppContainer, signedIn: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val switchOn by container.prefs.callWarnings.collectAsState(initial = false)
    val silence by container.prefs.silenceCalls.collectAsState(initial = false)
    var note by remember { mutableStateOf<String?>(null) }

    fun turnOn() {
        scope.launch { container.prefs.setCallWarnings(true) }
        ScamListWorker.now(context)
        note = null
    }

    val askForRole = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (CallRole.holds(context)) turnOn()
        else note = "Android didn't give Argus the call-screening role, so warnings stay off."
    }

    val state = CallRole.state(Build.VERSION.SDK_INT, signedIn, switchOn, CallRole.holds(context))
    val explain = "Warns you while a scam number is calling. Only numbers that aren't in your contacts are checked, " +
        "and each new one is sent to Argus to look up."
    when (state) {
        CallRole.State.NEEDS_SIGN_IN -> SwitchRow("Call warnings", "Sign in to turn on call warnings.", checked = false, enabled = false) {}
        CallRole.State.UNSUPPORTED -> SwitchRow("Call warnings", "Needs Android 10 or newer.", checked = false, enabled = false) {}
        CallRole.State.OFF -> SwitchRow("Call warnings", explain, checked = false, enabled = true) {
            if (CallRole.holds(context)) turnOn() else CallRole.requestIntent(context)?.let { askForRole.launch(it) }
        }
        CallRole.State.ON -> SwitchRow("Call warnings", explain, checked = true, enabled = true) {
            scope.launch { container.prefs.setCallWarnings(false) }
            note = "Argus has stopped checking calls. To take away its call-screening role as well, go to " +
                "Settings > Apps > Default apps > Caller ID & spam."
        }
    }
    SwitchRow(
        "Silence likely scam calls",
        "Only silences numbers Argus already knows are scams. The call still shows in your recents.",
        checked = silence && state == CallRole.State.ON,
        enabled = state == CallRole.State.ON,
    ) { scope.launch { container.prefs.setSilenceCalls(!silence) } }
    note?.let { Text(it, color = ArgusColors.MutedText) }
}

@Composable
private fun SwitchRow(title: String, text: String, checked: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) ArgusColors.Foreground else ArgusColors.MutedText)
            Text(text, color = ArgusColors.MutedText)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = { onToggle() },
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = ArgusColors.Background,
                checkedTrackColor = ArgusColors.Foreground,
            ),
        )
    }
}
