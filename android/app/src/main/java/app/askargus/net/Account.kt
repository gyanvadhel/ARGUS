package app.askargus.net

import kotlinx.coroutines.flow.StateFlow

/** Signing in and out, for the screens. The session itself lives in the (encrypted) session store. */
class Account(
    private val auth: SupabaseAuth,
    private val sessions: ObservableSessionStore,
    private val appUrl: String,
    private val onSignedOut: suspend () -> Unit = {},
) {
    val session: StateFlow<Session?> get() = sessions.state

    suspend fun restore(): Session? = sessions.load()

    suspend fun signIn(email: String, password: String) = sessions.save(auth.signInWithPassword(email.trim(), password))

    suspend fun signUp(name: String, email: String, password: String): SignUpResult {
        val result = auth.signUp(name.trim(), email.trim(), password, "${appUrl.trimEnd('/')}/auth/confirm")
        if (result is SignUpResult.SignedIn) sessions.save(result.session)
        return result
    }

    suspend fun signInWithGoogle(idToken: String, rawNonce: String) = sessions.save(auth.signInWithGoogle(idToken, rawNonce))

    suspend fun signOut() {
        sessions.load()?.let { auth.signOut(it.accessToken) }
        sessions.save(null)
        onSignedOut()
    }
}
