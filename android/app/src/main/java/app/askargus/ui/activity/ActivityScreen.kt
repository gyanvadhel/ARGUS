package app.askargus.ui.activity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.core.Kinds
import app.askargus.core.Levels
import app.askargus.core.TimeAgo
import app.askargus.data.ActivityEvent
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.LevelPill
import app.askargus.ui.theme.ArgusColors

import androidx.compose.foundation.layout.height
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import app.askargus.blocker.BlockerState
import kotlinx.coroutines.launch

@Composable
fun ActivityScreen(container: AppContainer) {
    val events by container.activity.recent().collectAsState(initial = emptyList())
    val host = LocalHost.current
    val now = System.currentTimeMillis()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Activity", style = MaterialTheme.typography.headlineMedium)
            Text("What Argus checked or warned about on this phone. This list stays on this phone.", style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
        }
        if (events.isEmpty()) {
            item { ArgusCard { Text("Nothing yet. Checks you run and warnings Argus gives will show up here.") } }
        }
        items(events, key = { it.id }) { e ->
            ActivityRow(e, now, container) { e.scanId?.let { host.openPage("/scan/$it") } }
        }
    }
}

@Composable
private fun ActivityRow(e: ActivityEvent, now: Long, container: AppContainer, onOpen: () -> Unit) {
    val scope = rememberCoroutineScope()
    var isAllowed by remember(e.subject) { mutableStateOf(BlockerState.isAllowed(e.subject)) }

    val onClick: (() -> Unit)? = when {
        e.scanId != null -> onOpen
        e.type == "site" && !isAllowed -> {
            {
                BlockerState.allow(e.subject)
                isAllowed = true
                scope.launch { container.prefs.allowSite(e.subject) }
            }
        }
        else -> null
    }

    ArgusCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row {
                    Text(Kinds.label(e.kind), style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                    Spacer(Modifier.weight(1f))
                    Text(TimeAgo.format(now, e.at), style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                }
                Text(e.subject, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (e.type == "site" && !isAllowed) {
                    Spacer(Modifier.height(4.dp))
                    Text("Tap to allow this site", style = MaterialTheme.typography.labelSmall, color = ArgusColors.Foreground)
                }
            }
            Spacer(Modifier.width(10.dp))
            when {
                e.type == "upi" -> LevelPill("Sends money", ArgusColors.Sus)
                e.type == "site" -> {
                    if (isAllowed) LevelPill("Allowed", ArgusColors.Clear)
                    else LevelPill("Blocked", ArgusColors.High)
                }
                e.level != null -> Levels.meta(e.level, e.verified).let { LevelPill(it.label, ArgusColors.risk(it.risk)) }
            }
        }
    }
}
