package app.askargus.ui.scan

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.askargus.core.Levels
import app.askargus.core.Reasons
import app.askargus.core.Verdict
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.ScoreDial
import app.askargus.ui.theme.ArgusColors

/** A verdict as on the website: the dial, the honest level word, why, and how many sources answered. */
@Composable
fun ResultView(verdict: Verdict, scanId: String?, onEvidence: (String) -> Unit) {
    val meta = Levels.meta(verdict.level, verdict.verified)
    val color = ArgusColors.risk(meta.risk)
    val (answered, total) = Reasons.answered(verdict)
    val reasons = Reasons.top(verdict)
    ArgusCard {
        ScoreDial(verdict.score, color, Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(8.dp))
        Text(meta.label, style = MaterialTheme.typography.displayMedium, color = color, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(Reasons.subtitle(verdict), style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Text(verdict.subject, style = MaterialTheme.typography.labelMedium, color = ArgusColors.Foreground.copy(alpha = 0.8f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(12.dp))
        Text(verdict.recommendation, style = MaterialTheme.typography.bodyLarge)
        if (reasons.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text("Why", style = MaterialTheme.typography.titleMedium)
            reasons.forEach { reason ->
                Row(Modifier.fillMaxWidth()) {
                    Text("•", color = color, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.alignByBaseline())
                    Spacer(Modifier.width(8.dp))
                    Text(reason, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.alignByBaseline())
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("$answered of $total sources answered", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        if (scanId != null) {
            Spacer(Modifier.height(12.dp))
            ArgusOutlinedButton("See full evidence", onClick = { onEvidence(scanId) }, modifier = Modifier.fillMaxWidth())
        }
    }
}
