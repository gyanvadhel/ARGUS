package app.askargus.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.net.MemberDevice
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch
import java.time.Instant

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
            IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Text("Family", style = MaterialTheme.typography.headlineMedium)
        }
        Text(
            "Invite the people you look out for, like parents or grandparents. Once they join, you'll be able to see that " +
                "Argus is protecting them and receive push alerts when it warns them about a likely scam. " +
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
                    val memberDevices = state.statusList.filter { it.memberName.equals(m.name, ignoreCase = true) }
                    ArgusCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(m.name, style = MaterialTheme.typography.titleMedium)
                                Text("Joined ${m.joinedAt.take(10)}", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                            }
                            TextButton(onClick = { vm.leave(m.linkId) }) { Text("Remove", color = ArgusColors.High) }
                        }

                        if (memberDevices.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            memberDevices.forEach { dev ->
                                DeviceStatusRow(dev)
                            }
                        } else {
                            Spacer(Modifier.height(6.dp))
                            Text("No device linked yet", style = MaterialTheme.typography.bodySmall, color = ArgusColors.MutedText)
                        }
                    }
                }
            }
        }
        state.error?.let { Text(it, color = ArgusColors.High) }
    }
}

@Composable
private fun DeviceStatusRow(dev: MemberDevice) {
    val (lastSeenLabel, lastSeenColor) = formatLastSeen(dev.lastSeenAt)
    val callsOn = dev.protections["calls"] == true
    val blockerOn = dev.protections["blocker"] == true

    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val label = (dev.deviceName ?: "Android device") + (dev.appVersion?.let { " · v$it" } ?: "")
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(lastSeenLabel, style = MaterialTheme.typography.labelSmall, color = lastSeenColor)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ProtectionBadge("Calls", callsOn)
            ProtectionBadge("Blocker", blockerOn)
        }
    }
}

@Composable
private fun ProtectionBadge(label: String, on: Boolean) {
    val bg = if (on) Color(0xFF1E293B) else Color(0xFF3B1D1D)
    val fg = if (on) ArgusColors.Foreground else ArgusColors.High
    Box(
        modifier = Modifier
            .background(bg, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            "$label ${if (on) "On" else "Off"}",
            style = MaterialTheme.typography.labelSmall,
            color = fg,
        )
    }
}

private fun formatLastSeen(timestamp: String?): Pair<String, Color> {
    if (timestamp.isNullOrBlank()) return "No check-in yet" to ArgusColors.MutedText
    return try {
        val instant = Instant.parse(timestamp)
        val deltaMs = System.currentTimeMillis() - instant.toEpochMilli()
        val hours = deltaMs / (1000 * 3600)
        when {
            hours < 1 -> "Active recently" to ArgusColors.Foreground
            hours < 48 -> "Seen ${hours}h ago" to ArgusColors.MutedText
            else -> "Offline (>48h)" to ArgusColors.High
        }
    } catch (_: Exception) {
        "Active" to ArgusColors.MutedText
    }
}
