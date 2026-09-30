package app.askargus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LevelPill
import app.askargus.ui.components.LivingEye
import app.askargus.ui.components.LocalTouch
import app.askargus.ui.components.ScoreDial
import app.askargus.ui.components.SoonPill
import app.askargus.ui.components.TouchState
import app.askargus.ui.components.trackTouches
import app.askargus.ui.theme.ArgusColors
import app.askargus.ui.theme.ArgusTheme
import app.askargus.ui.theme.argusEdgeToEdge

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        argusEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val touch = remember { TouchState() }
            ArgusTheme {
                CompositionLocalProvider(LocalTouch provides touch) {
                    Column(
                        Modifier.fillMaxSize().background(ArgusColors.Background).trackTouches(touch).systemBarsPadding().padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.6f))
                        Text("Argus", style = MaterialTheme.typography.displayLarge)
                        ScoreDial(96, ArgusColors.High)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            LevelPill("High risk", ArgusColors.High)
                            LevelPill("No red flags", ArgusColors.Clear)
                            SoonPill()
                        }
                        ArgusCard { Text("A card, with body text in Archivo.", style = MaterialTheme.typography.bodyLarge) }
                        ArgusButton("Check", onClick = {}, modifier = Modifier.fillMaxWidth())
                        ArgusOutlinedButton("Scan QR", onClick = {}, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}
