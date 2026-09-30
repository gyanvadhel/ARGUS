package app.askargus

import androidx.compose.runtime.staticCompositionLocalOf
import app.askargus.ui.auth.GoogleSignIn

/** What screens ask of the activity: opening pages and links, sharing, and Google's account picker. */
interface Host {
    fun openPage(path: String, force: Boolean = false)
    fun openUrl(url: String)
    fun share(text: String, title: String)
    suspend fun googleSignIn(): GoogleSignIn.Result
}

val LocalHost = staticCompositionLocalOf<Host> { error("Host not provided") }
