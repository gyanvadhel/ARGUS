package app.askargus.ui.argus

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.theme.ArgusColors

private data class Page(val title: String, val body: String, val path: String)

private val PAGES = listOf(
    Page("Dashboard", "Your stats, recent checks and protection status", "/dashboard"),
    Page("History", "Every check you've run, searchable", "/history"),
    Page("Caller ID", "Look up any number and report scam callers", "/caller-id"),
    Page("Inbox", "Connect Gmail and see which emails are scams", "/inbox"),
    Page("Family alerts", "Telegram alerts for the people you look out for", "/family"),
)

@Composable
fun ArgusScreen(container: AppContainer) {
    val host = LocalHost.current
    val session by container.account.session.collectAsState()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Argus", style = MaterialTheme.typography.headlineMedium)
            Text(
                if (session != null) "Everything on askargus.app, opened signed in." else "Everything on askargus.app. Sign in to see your history and family.",
                style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
            )
        }
        items(PAGES) { page ->
            ArgusCard(onClick = { host.openPage(page.path) }) {
                Text(page.title, style = MaterialTheme.typography.titleMedium)
                Text(page.body, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
            }
        }
    }
}
