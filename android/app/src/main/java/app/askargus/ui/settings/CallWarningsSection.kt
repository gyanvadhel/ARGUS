package app.askargus.ui.settings

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
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
import androidx.core.app.NotificationManagerCompat
import app.askargus.AppContainer
import app.askargus.calls.CallRole
import app.askargus.ui.theme.ArgusColors
import app.askargus.work.ScamListWorker
import kotlinx.coroutines.launch

/** The call-warnings switch, shared by Home and Settings: what state it's in and what tapping it does. */
class CallToggle(val state: CallRole.State, val note: String?, val toggle: () -> Unit) {
    val on: Boolean get() = state == CallRole.State.ON
    /** False when the switch can't do anything yet (no account, or Android too old). */
    val usable: Boolean get() = state != CallRole.State.NEEDS_SIGN_IN && state != CallRole.State.UNSUPPORTED
}

@Composable
fun rememberCallToggle(container: AppContainer, signedIn: Boolean): CallToggle {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val switchOn by container.prefs.callWarnings.collectAsState(initial = false)
    var note by remember { mutableStateOf<String?>(null) }
    // Android doesn't announce a change in notification permission, so it's re-read after every answer.
    var notificationsAllowed by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationsAllowed = granted
        if (!granted) note = "Without notifications Argus can't warn you about calls. You can allow them in Android's settings."
    }
    fun allowNotifications() {
        if (Build.VERSION.SDK_INT >= 33) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
        }
    }

    fun turnOn() {
        scope.launch {
            container.prefs.setCallWarnings(true)
            app.askargus.work.DeviceSyncWorker.syncNow(context)
        }
        ScamListWorker.now(context)
        note = null
        if (!notificationsAllowed) allowNotifications()
    }

    val askForRole = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (CallRole.holds(context)) turnOn()
        else note = "Android didn't give Argus the call-screening role, so warnings stay off."
    }

    val state = CallRole.state(Build.VERSION.SDK_INT, signedIn, switchOn, CallRole.holds(context), notificationsAllowed)
    return CallToggle(state, note) {
        when (state) {
            CallRole.State.NEEDS_SIGN_IN, CallRole.State.UNSUPPORTED -> Unit
            CallRole.State.OFF -> if (CallRole.holds(context)) turnOn() else CallRole.requestIntent(context)?.let { askForRole.launch(it) }
            CallRole.State.NEEDS_NOTIFICATIONS -> allowNotifications()
            CallRole.State.ON -> {
                scope.launch {
                    container.prefs.setCallWarnings(false)
                    app.askargus.work.DeviceSyncWorker.syncNow(context)
                }
                note = "Argus has stopped checking calls. To take away its call-screening role as well, go to " +
                    "Settings > Apps > Default apps > Caller ID & spam."
            }
        }
    }
}

@Composable
fun CallWarningsBody(container: AppContainer, signedIn: Boolean) {
    val scope = rememberCoroutineScope()
    val silence by container.prefs.silenceCalls.collectAsState(initial = false)
    val calls = rememberCallToggle(container, signedIn)
    val state = calls.state
    val explain = "Warns you while a scam number is calling. Only numbers that aren't in your contacts are checked, " +
        "and each new one is sent to Argus to look up."
    val text = when (state) {
        CallRole.State.NEEDS_SIGN_IN -> "Sign in to turn on call warnings."
        CallRole.State.UNSUPPORTED -> "Needs Android 10 or newer."
        CallRole.State.NEEDS_NOTIFICATIONS -> "Notifications are off for Argus, so it can't warn you. Tap to allow them."
        else -> explain
    }
    SwitchRow("Call warnings", text, checked = calls.on, enabled = calls.usable, onToggle = calls.toggle)
    SwitchRow(
        "Silence likely scam calls",
        "Only silences numbers Argus already knows are scams. The call still shows in your recents.",
        checked = silence && calls.on,
        enabled = calls.on,
    ) { scope.launch { container.prefs.setSilenceCalls(!silence) } }
    calls.note?.let { Text(it, color = ArgusColors.MutedText) }
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
