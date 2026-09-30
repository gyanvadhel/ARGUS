package app.askargus

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import app.askargus.core.HandoffPlan
import app.askargus.ui.auth.GoogleSignIn
import app.askargus.ui.components.LocalTouch
import app.askargus.ui.components.TouchState
import app.askargus.ui.components.trackTouches
import app.askargus.ui.nav.ArgusNav
import app.askargus.ui.theme.ArgusColors
import app.askargus.ui.theme.ArgusTheme
import app.askargus.ui.theme.argusEdgeToEdge

class MainActivity : ComponentActivity(), Host {
    private val container get() = (application as ArgusApp).container

    override fun onCreate(savedInstanceState: Bundle?) {
        argusEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val touch = remember { TouchState() }
            val onboarded by container.prefs.onboarded.collectAsState(initial = null)
            LaunchedEffect(Unit) { container.account.restore() }
            ArgusTheme {
                CompositionLocalProvider(LocalTouch provides touch, LocalHost provides this) {
                    Box(Modifier.fillMaxSize().background(ArgusColors.Background).trackTouches(touch)) {
                        onboarded?.let { ArgusNav(container, it) }
                    }
                }
            }
        }
    }

    // Task 14 replaces this with signed-in website pages (handoff + Trusted Web Activity).
    override fun openPage(path: String, force: Boolean) = openUrl(HandoffPlan.plainUrl(BuildConfig.APP_URL, path))

    override fun openUrl(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    override fun share(text: String, title: String) {
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), title))
    }

    override suspend fun googleSignIn(): GoogleSignIn.Result = GoogleSignIn.request(this, BuildConfig.GOOGLE_WEB_CLIENT_ID)
}
