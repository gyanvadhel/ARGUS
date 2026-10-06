package app.askargus.ui.settings

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.VpnService
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.core.content.ContextCompat
import app.askargus.AppContainer
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.style.TextOverflow
import app.askargus.blocker.AllowList
import app.askargus.blocker.ArgusVpnService
import app.askargus.blocker.BlockerState
import app.askargus.blocker.BlocklistWorker
import app.askargus.core.TimeAgo
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

/** The blocker's switch, shared by Home and Settings. Turning it on asks for Android's VPN permission the first time. */
class BlockerToggle(val on: Boolean, val note: String?, val toggle: () -> Unit)

@Composable
fun rememberBlockerToggle(container: AppContainer): BlockerToggle {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val blockerPref by container.prefs.blockerEnabled.collectAsState(initial = false)
    val isChecked = blockerPref && ArgusVpnService.running
    var note by remember { mutableStateOf<String?>(null) }

    fun startBlocker() {
        val intent = Intent(context, ArgusVpnService::class.java)
        ContextCompat.startForegroundService(context, intent)
        scope.launch {
            container.prefs.setBlockerEnabled(true)
            app.askargus.work.DeviceSyncWorker.syncNow(context)
        }
        BlocklistWorker.now(context)
        note = null
    }

    val askVpn = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (VpnService.prepare(context) == null) startBlocker()
        else note = "VPN permission was not granted, so the scam-site blocker stays off."
    }

    return BlockerToggle(isChecked, note) {
        if (isChecked) {
            context.startService(Intent(context, ArgusVpnService::class.java).apply { action = ArgusVpnService.ACTION_STOP })
            scope.launch {
                container.prefs.setBlockerEnabled(false)
                app.askargus.work.DeviceSyncWorker.syncNow(context)
            }
        } else {
            val prep = VpnService.prepare(context)
            if (prep == null) startBlocker() else askVpn.launch(prep)
        }
    }
}

@Composable
fun BlockerSectionBody(container: AppContainer) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val blocker = rememberBlockerToggle(container)
    val allowed by container.prefs.allowedSites.collectAsState(initial = emptySet())
    var note by remember { mutableStateOf<String?>(null) }

    val privateDns = remember { getPrivateDnsServer(context) }
    val now = System.currentTimeMillis()
    val lastSync = BlockerState.lastDownloadAt
    val entries = BlockerState.hostIndex.size
    val isOutOfDate = lastSync > 0 && (now - lastSync > 7L * 24 * 3600 * 1000)

    val explain = "Blocks known phishing and malware sites before they can load in any app on your phone. " +
        "Checks hostnames on your device against a downloaded list. Browsing never leaves your phone."

    SwitchRow(title = "Scam-site blocker", text = explain, checked = blocker.on, enabled = true, onToggle = blocker.toggle)
    blocker.note?.let { Text(it, color = ArgusColors.MutedText) }

    if (privateDns != null) {
        Spacer(Modifier.height(4.dp))
        Text(
            "Private DNS is on ($privateDns). Android routes DNS lookups directly to that provider, " +
                "so Argus cannot see or block scam domains. To let Argus protect you, set Private DNS to " +
                "Automatic or Off in Android Settings.",
            color = ArgusColors.Sus,
        )
    }

    Spacer(Modifier.height(4.dp))
    Text(
        "Browser Secure DNS: If your browser (such as Chrome or Brave) has its own Secure DNS enabled, " +
            "its lookups bypass Argus and cannot be blocked.",
        color = ArgusColors.MutedText,
    )

    if (entries > 0) {
        val syncText = if (lastSync > 0) "Updated ${TimeAgo.format(now, lastSync)}" else "Not updated yet"
        Text(
            "Blocklist: $entries scam domains. $syncText.",
            color = ArgusColors.MutedText,
        )
    }

    if (isOutOfDate) {
        Text(
            "The blocklist is over 7 days old and may be out of date.",
            color = ArgusColors.Sus,
        )
    }

    ArgusOutlinedButton(
        text = "Update blocklist now",
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            BlocklistWorker.now(context)
            note = "Blocklist update started."
        },
    )

    note?.let { Text(it, color = ArgusColors.MutedText) }

    if (allowed.isNotEmpty()) {
        Spacer(Modifier.height(4.dp))
        Text("Sites you allowed", color = ArgusColors.Foreground)
        allowed.sorted().forEach { site ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(site, color = ArgusColors.MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                TextButton(onClick = { scope.launch { AllowList.blockAgain(container.prefs, site) } }) {
                    Text("Block again", color = ArgusColors.Foreground)
                }
            }
        }
    }
}

private fun getPrivateDnsServer(context: Context): String? {
    if (Build.VERSION.SDK_INT >= 28) {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val network = cm.activeNetwork ?: return null
        val lp = cm.getLinkProperties(network) ?: return null
        return lp.privateDnsServerName?.takeIf { it.isNotEmpty() }
    }
    return null
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
