package app.askargus.ui.home

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.blocker.BlockerState
import app.askargus.calls.CallRole
import app.askargus.core.Links
import app.askargus.core.Versions
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.Glyph
import app.askargus.ui.components.GlyphIcon
import app.askargus.ui.components.LivingEye
import app.askargus.ui.components.SoonPill
import app.askargus.ui.nav.Routes
import app.askargus.ui.scan.scanViewModel
import app.askargus.ui.settings.rememberBlockerToggle
import app.askargus.ui.settings.rememberCallToggle
import app.askargus.ui.theme.ArgusColors
import java.util.Calendar
import kotlinx.coroutines.delay

private val COMING = listOf(
    "SMS scam helper",
    "Automatic Gmail alerts",
)

@Composable
fun HomeScreen(container: AppContainer, go: (String) -> Unit) {
    val host = LocalHost.current
    val scan = scanViewModel(container)
    val session by container.account.session.collectAsState()
    val update by container.prefs.availableUpdate.collectAsState(initial = null)
    val calls = rememberCallToggle(container, signedIn = session != null)
    val blocker = rememberBlockerToggle(container)
    val blocksToday = BlockerState.blockedSitesToday
    val startOfDay = remember {
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }
    val today by container.activity.countSince(startOfDay).collectAsState(initial = 0)
    val clipboard = LocalClipboardManager.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { scan.image(it); go(Routes.SCAN) }
    }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !container.prefs.askedNotifications()) {
            container.prefs.setAskedNotifications()
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    // Sections rise in one after another the first time Home opens, not every time you come back to it.
    var entered by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(700); entered = true }

    val onCount = listOf(calls.on, blocker.on).count { it }
    val status = when {
        onCount == 2 -> "Calls and sites are protected."
        calls.on -> "Calls are protected. Sites aren't yet."
        blocker.on -> "Sites are protected. Calls aren't yet."
        else -> "Protection is off. Turn it on below."
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Rise(0, entered) {
            LivingEye(
                if (onCount > 0) EyeMood.WATCHING else EyeMood.IDLE,
                Modifier.fillMaxWidth(0.5f).align(Alignment.CenterHorizontally),
            )
        }
        Rise(1, entered) {
            Text(session?.name?.substringBefore(' ')?.let { "Hi, $it" } ?: "Argus", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(4.dp))
            Text(status, style = MaterialTheme.typography.bodyLarge, color = if (onCount == 2) ArgusColors.Foreground else ArgusColors.MutedText)
        }

        update?.takeIf { Versions.isNewer(it, BuildConfig.VERSION_NAME) }?.let { version ->
            ArgusCard {
                Text("Argus $version is ready", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                ArgusButton("Download the update", onClick = { host.openUrl("${BuildConfig.APP_URL}/app") }, modifier = Modifier.fillMaxWidth())
            }
        }

        Rise(2, entered) {
            Label("Check something")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                QuickAction(Glyph.QR, "Scan a QR code", Modifier.weight(1f)) { go(Routes.QR) }
                QuickAction(Glyph.IMAGE, "Read a screenshot", Modifier.weight(1f)) {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                QuickAction(Glyph.LINK, "Check a copied link", Modifier.weight(1f)) {
                    val copied = clipboard.getText()?.text.orEmpty()
                    scan.check(Links.first(copied) ?: copied, "clipboard")
                    go(Routes.SCAN)
                }
                QuickAction(Glyph.MESSAGE, "Paste a message", Modifier.weight(1f)) {
                    scan.reset()
                    go(Routes.SCAN)
                }
            }
        }

        if (session == null) {
            ArgusCard {
                Text("Sign in to check links, messages and numbers", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Text("QR codes and screenshots are read without an account; checking what they say needs one. It's free.", color = ArgusColors.MutedText)
                Spacer(Modifier.height(12.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
        }

        Rise(3, entered) {
            Label("Protection")
            ArgusCard {
                ProtectionRow(
                    "Call warnings",
                    when (calls.state) {
                        CallRole.State.ON -> "Warns you while a scam number is calling"
                        CallRole.State.NEEDS_SIGN_IN -> "Sign in to turn this on"
                        CallRole.State.UNSUPPORTED -> "Needs Android 10 or newer"
                        CallRole.State.NEEDS_NOTIFICATIONS -> "Allow notifications so Argus can warn you"
                        CallRole.State.OFF -> "Off"
                    },
                    checked = calls.on, enabled = calls.usable, onToggle = calls.toggle,
                )
                calls.note?.let { Note(it) }
                Spacer(Modifier.height(14.dp))
                ProtectionRow(
                    "Scam-site blocker",
                    when {
                        !blocker.on -> "Off"
                        blocksToday == 0 -> "On · nothing blocked today"
                        else -> "On · $blocksToday blocked today"
                    },
                    checked = blocker.on, enabled = true, onToggle = blocker.toggle,
                )
                blocker.note?.let { Note(it) }
                TextButton(onClick = { go(Routes.SETTINGS) }, modifier = Modifier.padding(top = 4.dp)) {
                    Text("More options in Settings", color = ArgusColors.MutedText)
                }
            }
        }

        Rise(4, entered) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Stat("$today", if (today == 1) "check today" else "checks today", Modifier.weight(1f)) { go(Routes.ACTIVITY) }
                Stat("$blocksToday", if (blocksToday == 1) "site blocked today" else "sites blocked today", Modifier.weight(1f)) { go(Routes.ACTIVITY) }
            }
        }

        Rise(5, entered) {
            ArgusCard(onClick = { go(Routes.FAMILY) }) {
                Text("Look out for your family", style = MaterialTheme.typography.titleMedium)
                Text("See whether their protection is on, and hear when they get a scam warning.", color = ArgusColors.MutedText)
            }
        }

        Rise(6, entered) {
            ArgusCard {
                Text("Coming to Argus", style = MaterialTheme.typography.titleMedium)
                COMING.forEach { item ->
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(item, modifier = Modifier.weight(1f), color = ArgusColors.MutedText)
                        SoonPill()
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** Fades and lifts a section into place, a beat after the one above it. */
@Composable
private fun Rise(order: Int, alreadyShown: Boolean, content: @Composable ColumnScope.() -> Unit) {
    val progress = remember { Animatable(if (alreadyShown) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (progress.value < 1f) {
            delay(order * 55L)
            progress.animateTo(1f, tween(380))
        }
    }
    Column(
        Modifier.fillMaxWidth().graphicsLayer {
            alpha = progress.value
            translationY = (1f - progress.value) * 18.dp.toPx()
        },
        content = content,
    )
}

@Composable
private fun Label(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = ArgusColors.MutedText,
        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
    )
}

@Composable
private fun Note(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun QuickAction(glyph: Glyph, label: String, modifier: Modifier, onClick: () -> Unit) {
    ArgusCard(modifier, onClick = onClick, padding = 16.dp) {
        GlyphIcon(glyph)
        Spacer(Modifier.height(18.dp))
        Text(label, style = MaterialTheme.typography.titleMedium, minLines = 2)
    }
}

@Composable
private fun ProtectionRow(title: String, text: String, checked: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = if (enabled) ArgusColors.Foreground else ArgusColors.MutedText)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = if (checked) ArgusColors.Foreground else ArgusColors.MutedText)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = { onToggle() },
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedThumbColor = ArgusColors.Background, checkedTrackColor = ArgusColors.Foreground),
        )
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier, onClick: () -> Unit) {
    ArgusCard(modifier, onClick = onClick, padding = 16.dp) {
        Text(value, style = MaterialTheme.typography.displayMedium)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
    }
}
