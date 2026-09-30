package app.askargus

import android.content.Context
import app.askargus.data.Prefs
import app.askargus.net.Account
import app.askargus.net.ArgusApi
import app.askargus.net.EncryptedSessionStore
import app.askargus.net.ObservableSessionStore
import app.askargus.net.SupabaseAuth
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Everything the screens and background jobs share, created once per process. */
class AppContainer(context: Context) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(70, TimeUnit.SECONDS)
        .callTimeout(75, TimeUnit.SECONDS)
        .build()
    val prefs = Prefs(context)
    private val sessions = ObservableSessionStore(EncryptedSessionStore(context))
    private val auth = SupabaseAuth(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY)
    val account = Account(auth, sessions, BuildConfig.APP_URL, onSignedOut = { prefs.setWebSignedInFor(null) })
    val api = ArgusApi(http, BuildConfig.APP_URL, auth, sessions)
}
