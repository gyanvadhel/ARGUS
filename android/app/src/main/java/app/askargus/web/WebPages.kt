package app.askargus.web

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.lifecycle.lifecycleScope
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.core.HandoffPlan
import com.google.androidbrowserhelper.trusted.TwaLauncher
import kotlinx.coroutines.launch

/** Opens askargus.app pages full screen (Trusted Web Activity), signed in with a one-time link the first time.
 *  If the link can't be made, the page opens anyway and the website asks to sign in. */
class WebPages(private val activity: ComponentActivity, private val container: AppContainer) {
    private val launcher = TwaLauncher(activity)

    fun open(path: String, force: Boolean = false) {
        activity.lifecycleScope.launch {
            val session = container.account.restore()
            val signedInLink = if (HandoffPlan.needsHandoff(session?.userId, container.prefs.webSignedInFor(), force)) {
                runCatching { container.api.handoff(path) }
                    .onSuccess { container.prefs.setWebSignedInFor(session?.userId) }
                    .getOrNull()
            } else null
            show(signedInLink ?: HandoffPlan.plainUrl(BuildConfig.APP_URL, path))
        }
    }

    private fun show(url: String) {
        val colors = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(0xFF08080A.toInt())
            .setNavigationBarColor(0xFF08080A.toInt())
            .build()
        launcher.launch(TrustedWebActivityIntentBuilder(Uri.parse(url)).setDefaultColorSchemeParams(colors), null, null, null)
    }

    fun destroy() = launcher.destroy()
}
