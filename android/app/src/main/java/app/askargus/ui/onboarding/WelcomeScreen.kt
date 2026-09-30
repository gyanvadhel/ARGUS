package app.askargus.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.theme.ArgusColors

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.SpaceBetween) {
        Column {
            Spacer(Modifier.height(40.dp))
            LivingEye(EyeMood.WATCHING, Modifier.fillMaxWidth(0.7f))
            Spacer(Modifier.height(36.dp))
            Text("Argus", style = MaterialTheme.typography.displayLarge)
            Text("The watcher that never sleeps.", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            Text(
                "Check any link, message, phone number, QR code or screenshot for scams, right from your phone.",
                style = MaterialTheme.typography.bodyLarge,
                color = ArgusColors.Foreground.copy(alpha = 0.8f),
            )
        }
        Column {
            ArgusButton("Get started", onClick = onStart, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Text("Free. Argus never says “Safe” without proof.", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        }
    }
}
