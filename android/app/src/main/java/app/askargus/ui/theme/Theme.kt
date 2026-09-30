package app.askargus.ui.theme

import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

private val scheme = darkColorScheme(
    primary = ArgusColors.Foreground,
    onPrimary = ArgusColors.OnPrimary,
    secondary = ArgusColors.Accent,
    onSecondary = ArgusColors.Foreground,
    background = ArgusColors.Background,
    onBackground = ArgusColors.Foreground,
    surface = ArgusColors.Background,
    onSurface = ArgusColors.Foreground,
    surfaceVariant = ArgusColors.Card,
    onSurfaceVariant = ArgusColors.MutedText,
    surfaceContainer = ArgusColors.Card,
    outline = ArgusColors.Border,
    error = ArgusColors.High,
)

@Composable
fun ArgusTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = ArgusTypography) {
        // Text outside a Surface would otherwise be black on Argus's near-black background.
        CompositionLocalProvider(LocalContentColor provides ArgusColors.Foreground, content = content)
    }
}

/** Edge to edge with light status-bar icons, even when the phone itself is in light mode: Argus is always dark. */
fun ComponentActivity.argusEdgeToEdge() {
    enableEdgeToEdge(
        statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
}
