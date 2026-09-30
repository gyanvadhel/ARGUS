package app.askargus.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun LicensesScreen(back: () -> Unit) {
    val context = LocalContext.current
    val ofl = remember { context.assets.open("licenses/archivo-OFL.txt").bufferedReader().use { it.readText() } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Licences", style = MaterialTheme.typography.headlineMedium)
        }
        Text("Argus uses the Archivo typeface under the SIL Open Font License:", style = MaterialTheme.typography.bodyMedium)
        Text(ofl, style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
    }
}
