package app.askargus.ui.home

import android.Manifest
import android.os.Build
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.core.Links
import app.askargus.core.Versions
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.components.SoonPill
import app.askargus.ui.nav.Routes
import app.askargus.ui.scan.scanViewModel
import app.askargus.ui.theme.ArgusColors
import java.util.Calendar

private val COMING = listOf(
    "A scam-site blocker for every app",
    "Family alerts on your phone",
)

@Composable
fun HomeScreen(container: AppContainer, go: (String) -> Unit) {
    val host = LocalHost.current
    val scan = scanViewModel(container)
    val session by container.account.session.collectAsState()
    val update by container.prefs.availableUpdate.collectAsState(initial = null)
    val callsOn by container.prefs.callWarnings.collectAsState(initial = false)
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

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.62f).align(Alignment.CenterHorizontally))
        Text(session?.name?.substringBefore(' ')?.let { "Hi, $it" } ?: "Argus", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Check anything for scams, and let Argus speak up while a scam number is calling.",
            style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction("Scan QR", Modifier.weight(1f)) { go(Routes.QR) }
            QuickAction("Read screenshot", Modifier.weight(1f)) {
                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction("Check copied link", Modifier.weight(1f)) {
                val copied = clipboard.getText()?.text.orEmpty()
                scan.check(Links.first(copied) ?: copied, "clipboard")
                go(Routes.SCAN)
            }
            QuickAction("Paste a message", Modifier.weight(1f)) {
                scan.reset()
                go(Routes.SCAN)
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
        ArgusCard(onClick = { go(Routes.SETTINGS) }) {
            Text("Call warnings", style = MaterialTheme.typography.titleMedium)
            Text(if (callsOn && session != null) "On" else "Off, tap to turn on", color = ArgusColors.MutedText)
        }
        ArgusCard {
            Text("$today", style = MaterialTheme.typography.displayMedium)
            Text(if (today == 1) "check today" else "checks today", color = ArgusColors.MutedText)
        }
        update?.takeIf { Versions.isNewer(it, BuildConfig.VERSION_NAME) }?.let { version ->
            ArgusCard {
                Text("Argus $version is ready", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                ArgusButton("Download the update", onClick = { host.openUrl("${BuildConfig.APP_URL}/app") }, modifier = Modifier.fillMaxWidth())
            }
        }
        ArgusCard {
            Text("Coming to Argus", style = MaterialTheme.typography.titleMedium)
            COMING.forEach { item ->
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(item, modifier = Modifier.weight(1f))
                    SoonPill()
                }
            }
        }
        ArgusCard(onClick = { go(Routes.FAMILY) }) {
            Text("Look out for your family", style = MaterialTheme.typography.titleMedium)
            Text("Invite parents or grandparents to Argus.", color = ArgusColors.MutedText)
        }
    }
}

@Composable
private fun QuickAction(label: String, modifier: Modifier, onClick: () -> Unit) {
    ArgusCard(modifier, onClick = onClick) { Text(label, style = MaterialTheme.typography.titleMedium) }
}
