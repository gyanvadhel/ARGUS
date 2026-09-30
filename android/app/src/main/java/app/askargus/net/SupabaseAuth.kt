package app.askargus.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder

class AuthException(message: String) : Exception(message)

sealed interface SignUpResult {
    data class SignedIn(val session: Session) : SignUpResult
    data object CheckInbox : SignUpResult
    data object AlreadyRegistered : SignUpResult
}

/** Supabase Auth over its REST API, with the public (publishable) key, exactly as the website's browser code uses it. */
class SupabaseAuth(
    private val http: OkHttpClient,
    baseUrl: String,
    private val apiKey: String,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val base = baseUrl.trimEnd('/')

    suspend fun signInWithPassword(email: String, password: String): Session =
        token("password", buildJsonObject { put("email", email); put("password", password) })

    suspend fun signInWithGoogle(idToken: String, rawNonce: String): Session =
        token("id_token", buildJsonObject { put("provider", "google"); put("id_token", idToken); put("nonce", rawNonce) })

    suspend fun refresh(refreshToken: String): Session =
        token("refresh_token", buildJsonObject { put("refresh_token", refreshToken) })

    suspend fun signUp(name: String, email: String, password: String, redirectTo: String): SignUpResult {
        val body = buildJsonObject {
            put("email", email)
            put("password", password)
            putJsonObject("data") { put("full_name", name) }
        }
        val json = post("/auth/v1/signup?redirect_to=${URLEncoder.encode(redirectTo, "UTF-8")}", body, bearer = null)
        if (json.text("access_token") != null) return SignUpResult.SignedIn(parseSession(json))
        val user = json["user"] as? JsonObject ?: json
        val identities = user["identities"] as? JsonArray
        return if (identities != null && identities.isEmpty()) SignUpResult.AlreadyRegistered else SignUpResult.CheckInbox
    }

    /** Best effort: the session is forgotten on the phone whether or not the server hears about it. */
    suspend fun signOut(accessToken: String) {
        runCatching { post("/auth/v1/logout", JsonObject(emptyMap()), bearer = accessToken) }
    }

    private suspend fun token(grant: String, body: JsonObject): Session =
        parseSession(post("/auth/v1/token?grant_type=$grant", body, bearer = null))

    private fun parseSession(json: JsonObject): Session {
        val missing = AuthException("Sign-in didn't finish. Try again.")
        val user = json["user"] as? JsonObject ?: throw missing
        val meta = user["user_metadata"] as? JsonObject
        val expiresAt = (json["expires_at"] as? JsonPrimitive)?.longOrNull
            ?: (now() + ((json["expires_in"] as? JsonPrimitive)?.longOrNull ?: 3600))
        return Session(
            accessToken = json.text("access_token") ?: throw missing,
            refreshToken = json.text("refresh_token") ?: throw missing,
            expiresAt = expiresAt,
            userId = user.text("id") ?: throw missing,
            email = user.text("email"),
            name = meta?.text("full_name") ?: meta?.text("name"),
        )
    }

    private suspend fun post(path: String, body: JsonObject, bearer: String?): JsonObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(base + path)
            .header("apikey", apiKey)
            .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val json = runCatching { ArgusJson.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!res.isSuccessful) throw AuthException(errorMessage(json, res.code))
            json
        }
    }

    companion object {
        fun errorMessage(json: JsonObject, code: Int): String {
            val raw = listOf("msg", "error_description", "message", "error").firstNotNullOfOrNull { json.text(it) }
                ?: return "Sign-in failed ($code). Try again."
            return when {
                raw.contains("Invalid login credentials", ignoreCase = true) -> "That email and password don't match."
                raw.contains("Email not confirmed", ignoreCase = true) -> "Confirm your email first: the link is in your inbox."
                else -> raw
            }
        }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
    }
}
