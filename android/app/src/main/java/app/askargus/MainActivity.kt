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
import androidx.core.content.IntentCompat
import app.askargus.core.Incoming
import app.askargus.core.IncomingParser
import app.askargus.ui.auth.GoogleSignIn
import app.askargus.ui.components.LocalTouch
import app.askargus.ui.components.TouchState
import app.askargus.ui.components.trackTouches
import app.askargus.ui.nav.ArgusNav
import app.askargus.ui.theme.ArgusColors
import app.askargus.ui.theme.ArgusTheme
import app.askargus.ui.theme.argusEdgeToEdge
import app.askargus.web.WebPages
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity(), Host {
    private val container get() = (application as ArgusApp).container
    private val incoming = MutableStateFlow<Incoming?>(null)
    private lateinit var pages: WebPages

    override fun onCreate(savedInstanceState: Bundle?) {
        argusEdgeToEdge()
        super.onCreate(savedInstanceState)
        pages = WebPages(this, container)
        if (savedInstanceState == null) handle(intent)
        setContent {
            val touch = remember { TouchState() }
            val onboarded by container.prefs.onboarded.collectAsState(initial = null)
            LaunchedEffect(Unit) { container.account.restore() }
            ArgusTheme {
                CompositionLocalProvider(LocalTouch provides touch, LocalHost provides this) {
                    Box(Modifier.fillMaxSize().background(ArgusColors.Background).trackTouches(touch)) {
                        onboarded?.let { ArgusNav(container, it, incoming) { incoming.value = null } }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        incoming.value = IncomingParser.parse(
            intent.action, intent.type,
            intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
            intent.getStringExtra(Intent.EXTRA_SUBJECT),
            stream?.toString(),
            intent.dataString,
        ) ?: incoming.value
    }

    override fun openPage(path: String, force: Boolean) = pages.open(path, force)

    override fun onDestroy() {
        pages.destroy()
        super.onDestroy()
    }

    override fun openUrl(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    override fun share(text: String, title: String) {
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), title))
    }

    override suspend fun googleSignIn(): GoogleSignIn.Result = GoogleSignIn.request(this, BuildConfig.GOOGLE_WEB_CLIENT_ID)
}
