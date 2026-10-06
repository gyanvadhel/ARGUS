package app.askargus.net

import app.askargus.calls.PhoneLookup
import app.askargus.core.Verdict
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URLEncoder
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(message: String, val code: Int) : Exception(message)
class SignedOutException : Exception("Sign in to use this.")

@Serializable data class ScanResponse(val id: String? = null, val verdict: Verdict)
@Serializable data class UrlResponse(val url: String)
@Serializable data class InviteResponse(val url: String, val expiresAt: String)
@Serializable data class JoinResponse(val name: String)
@Serializable data class FamilyMember(val linkId: String, val name: String, val joinedAt: String)
@Serializable data class FamilyList(val members: List<FamilyMember> = emptyList())
@Serializable data class PhoneResponse(val verdict: Verdict, val cached: Boolean = false, val id: String? = null)
@Serializable data class ScamNumber(val number: String, val label: String)
@Serializable data class ScamNumbers(val numbers: List<ScamNumber> = emptyList())
@Serializable data class InviteInfo(val name: String? = null, val valid: Boolean = false)
@Serializable data class DeviceReport(
    val deviceId: String,
    val name: String? = null,
    val appVersion: String,
    val protections: Map<String, Boolean> = emptyMap(),
    val fcmToken: String? = null,
)
@Serializable data class MemberDevice(
    val memberId: String,
    val memberName: String,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val appVersion: String? = null,
    val protections: Map<String, Boolean> = emptyMap(),
    val lastSeenAt: String? = null,
)
@Serializable data class FamilyStatusResponse(val members: List<MemberDevice> = emptyList())
@Serializable data class LatestRelease(
    val version: String,
    val apk: String,
    val smsHelperApk: String? = null,
    val notes: String = "",
    val publishedAt: String = "",
)

interface Checker {
    suspend fun scan(input: String, save: String): ScanResponse
}

/** askargus.app's app endpoints. Signed-in calls carry the Supabase access token, refreshed once when it's stale. */
class ArgusApi(
    private val http: OkHttpClient,
    appUrl: String,
    private val auth: SupabaseAuth,
    private val sessions: SessionStore,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) : Checker, PhoneLookup {
    private val base = appUrl.trimEnd('/')
    private val refreshLock = Mutex()

    override suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse =
        authed(
            "GET",
            "/api/app/phone?number=${enc(number)}" + (country?.let { "&country=${enc(it)}" } ?: "") + (if (call) "&call=1" else ""),
            null,
            PhoneResponse.serializer(),
        )

    suspend fun scamNumbers(): List<ScamNumber> =
        authed("GET", "/api/app/scam-numbers", null, ScamNumbers.serializer()).numbers

    suspend fun report(number: String, country: String?) {
        authed("POST", "/api/app/report", buildJsonObject { put("number", number); country?.let { put("country", it) } }, JsonObject.serializer())
    }

    override suspend fun scan(input: String, save: String): ScanResponse =
        authed("POST", "/api/app/scan", buildJsonObject { put("input", input); put("save", save) }, ScanResponse.serializer())

    suspend fun handoff(next: String): String =
        authed("POST", "/api/app/handoff", buildJsonObject { put("next", next) }, UrlResponse.serializer()).url

    suspend fun familyInvite(): InviteResponse =
        authed("POST", "/api/app/family/invite", JsonObject(emptyMap()), InviteResponse.serializer())

    suspend fun familyJoin(code: String): JoinResponse =
        authed("POST", "/api/app/family/join", buildJsonObject { put("code", code) }, JoinResponse.serializer())

    suspend fun family(): FamilyList = authed("GET", "/api/app/family", null, FamilyList.serializer())

    suspend fun familyStatus(): FamilyStatusResponse =
        authed("GET", "/api/app/family/status", null, FamilyStatusResponse.serializer())

    suspend fun reportDevice(report: DeviceReport): Boolean = try {
        val payload = buildJsonObject {
            put("deviceId", report.deviceId)
            report.name?.let { put("name", it) }
            put("appVersion", report.appVersion)
            putJsonObject("protections") {
                report.protections.forEach { (k, v) -> put(k, v) }
            }
            report.fcmToken?.let { put("fcmToken", it) }
        }
        authed("POST", "/api/app/device", payload, JsonObject.serializer())
        true
    } catch (e: Exception) {
        false
    }

    /** Signing out: the server forgets this phone, so the circle stops seeing it and stops pushing to it. */
    suspend fun forgetDevice(deviceId: String) {
        authed("DELETE", "/api/app/device", buildJsonObject { put("deviceId", deviceId) }, JsonObject.serializer())
    }

    suspend fun leaveFamily(linkId: String) {
        authed("DELETE", "/api/app/family/${enc(linkId)}", null, JsonObject.serializer())
    }

    suspend fun inviteInfo(code: String): InviteInfo =
        decode(send("GET", "/api/app/family/invite-info?code=${enc(code)}", null, null), InviteInfo.serializer())

    suspend fun latest(): LatestRelease? = try {
        decode(send("GET", "/api/app/latest", null, null), LatestRelease.serializer())
    } catch (e: ApiException) {
        if (e.code == 404) null else throw e
    }

    private suspend fun <T> authed(method: String, path: String, body: JsonObject?, serializer: KSerializer<T>): T {
        var session = sessions.load() ?: throw SignedOutException()
        if (session.expiresAt - now() < 60) session = refreshed(session) ?: throw SignedOutException()
        val first = send(method, path, body, session.accessToken)
        if (first.code != 401) return decode(first, serializer)
        val fresh = refreshed(session) ?: throw SignedOutException()
        return decode(send(method, path, body, fresh.accessToken), serializer)
    }

    /** One refresh at a time; a refresh token the server rejects means the session is over, so it's forgotten. */
    private suspend fun refreshed(stale: Session): Session? = refreshLock.withLock {
        val current = sessions.load() ?: return@withLock null
        if (current.accessToken != stale.accessToken && current.expiresAt - now() >= 60) return@withLock current
        try {
            auth.refresh(current.refreshToken).also { sessions.save(it) }
        } catch (e: AuthException) {
            sessions.save(null)
            null
        }
    }

    private class Reply(val code: Int, val text: String)

    // Asynchronous, so a caller that stops waiting (a call warning out of time) also stops the request.
    private suspend fun send(method: String, path: String, body: JsonObject?, token: String?): Reply {
        val payload = body?.toString()?.toRequestBody(JSON)
        val request = Request.Builder().url(base + path).apply {
            if (token != null) header("Authorization", "Bearer $token")
            when (method) {
                "GET" -> get()
                "DELETE" -> delete(payload)
                else -> method(method, payload ?: "{}".toRequestBody(JSON))
            }
        }.build()
        val call = http.newCall(request)
        return suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    cont.resumeWithException(ApiException("Couldn't reach Argus. Check your connection.", 0))
                }

                override fun onResponse(call: Call, response: Response) {
                    val reply = try {
                        response.use { Reply(it.code, it.body?.string().orEmpty()) }
                    } catch (e: IOException) {
                        cont.resumeWithException(ApiException("Couldn't reach Argus. Check your connection.", 0))
                        return
                    }
                    cont.resume(reply)
                }
            })
        }
    }

    private fun <T> decode(reply: Reply, serializer: KSerializer<T>): T {
        if (reply.code in 200..299) return ArgusJson.decodeFromString(serializer, reply.text.ifEmpty { "{}" })
        throw ApiException(errorMessage(reply), reply.code)
    }

    private fun errorMessage(reply: Reply): String {
        val fromServer = runCatching {
            ((ArgusJson.parseToJsonElement(reply.text) as JsonObject)["error"] as? JsonPrimitive)?.contentOrNull
        }.getOrNull()
        return when {
            !fromServer.isNullOrBlank() -> fromServer
            reply.code in 502..504 -> "Argus's checker is waking up. Try again in a moment."
            reply.code == 429 -> "You've reached today's limit. Try again tomorrow."
            reply.code == 401 -> "Sign in again."
            else -> "Something went wrong (${reply.code}). Try again."
        }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
        fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
    }
}
