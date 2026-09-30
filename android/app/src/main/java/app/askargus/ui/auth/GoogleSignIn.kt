package app.askargus.ui.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.askargus.core.Nonce
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** Google's account picker. Google gets the nonce's hash; Supabase gets the raw nonce to check it. */
object GoogleSignIn {
    class Result(val idToken: String, val rawNonce: String)

    suspend fun request(activity: Activity, webClientId: String): Result {
        val raw = Nonce.raw()
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .setNonce(Nonce.sha256Hex(raw))
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            return Result(GoogleIdTokenCredential.createFrom(credential.data).idToken, raw)
        }
        throw IllegalStateException("Google didn't return an account.")
    }

    fun friendly(e: Throwable): String = when (e) {
        is GetCredentialCancellationException -> "Google sign-in was cancelled."
        is NoCredentialException -> "There's no Google account on this phone. Add one in Settings, or use email."
        is GetCredentialException -> "Google sign-in isn't available right now. Use email instead."
        else -> e.message ?: "Google sign-in didn't work. Use email instead."
    }
}
