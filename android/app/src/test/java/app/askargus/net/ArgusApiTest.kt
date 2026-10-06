package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ArgusApiTest {
    private val server = MockWebServer()
    private lateinit var store: MemorySessionStore
    private lateinit var api: ArgusApi
    private val scanJson = """{"id":"s1","verdict":{"kind":"text","subject":"hi","score":0,"level":"SAFE","threat_type":"None","signals":[]}}"""

    @Before fun start() {
        server.start()
        val base = server.url("/").toString()
        store = MemorySessionStore(Session("a1", "r1", NOW + 3600, "u1"))
        api = ArgusApi(OkHttpClient(), base, SupabaseAuth(OkHttpClient(), base, "pk", now = { NOW }), store, now = { NOW })
    }

    @After fun stop() {
        runCatching { server.shutdown() }
    }

    @Test fun aSlowReplyStopsWhenTheCallerGivesUp() = kotlinx.coroutines.runBlocking {
        server.enqueue(MockResponse().setBody("{}").setHeadersDelay(5, java.util.concurrent.TimeUnit.SECONDS))
        val started = System.currentTimeMillis()
        kotlinx.coroutines.withTimeoutOrNull(300) { api.phone("+911111111111", "IN", call = true) }
        assertTrue(System.currentTimeMillis() - started < 2_000)
    }

    @Test fun sendsTheAccessToken() = runTest {
        server.enqueue(MockResponse().setBody(scanJson))
        val r = api.scan("hi", "always")
        assertEquals("s1", r.id)
        val req = server.takeRequest()
        assertEquals("/api/app/scan", req.path)
        assertEquals("Bearer a1", req.getHeader("Authorization"))
        assertTrue(req.body.readUtf8().contains("\"input\":\"hi\""))
    }

    @Test fun refreshesOnceOn401ThenRetries() = runTest {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Sign in again."}"""))
        server.enqueue(MockResponse().setBody(sessionJson("a2")))
        server.enqueue(MockResponse().setBody(scanJson))
        api.scan("hi", "always")
        assertEquals("Bearer a1", server.takeRequest().getHeader("Authorization"))
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
        assertEquals("Bearer a2", server.takeRequest().getHeader("Authorization"))
        assertEquals("a2", store.load()!!.accessToken)
    }

    @Test fun rejectedRefreshSignsOut() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid_grant","error_description":"Invalid Refresh Token"}"""))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull()
        assertTrue(e is SignedOutException)
        assertNull(store.load())
    }

    @Test fun refreshesAnExpiringSessionFirst() = runTest {
        store.save(Session("a1", "r1", NOW + 10, "u1"))
        server.enqueue(MockResponse().setBody(sessionJson("a2")))
        server.enqueue(MockResponse().setBody(scanJson))
        api.scan("hi", "always")
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
        assertEquals("Bearer a2", server.takeRequest().getHeader("Authorization"))
    }

    @Test fun wakingEngineMessage() = runTest {
        server.enqueue(MockResponse().setResponseCode(504).setBody("<html>Gateway Timeout</html>"))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("Argus's checker is waking up. Try again in a moment.", e.message)
    }

    @Test fun serverMessagesAreShownAsTheyAre() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":"You've reached today's limit of 500 checks."}"""))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("You've reached today's limit of 500 checks.", e.message)
        assertEquals(429, e.code)
    }

    @Test fun offlineMessage() = runTest {
        server.shutdown()
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("Couldn't reach Argus. Check your connection.", e.message)
    }

    @Test fun signedOutWithoutASession() = runTest {
        store.save(null)
        assertTrue(runCatching { api.scan("hi", "always") }.exceptionOrNull() is SignedOutException)
        assertEquals(0, server.requestCount)
    }

    @Test fun publicCallsCarryNoToken() = runTest {
        server.enqueue(MockResponse().setBody("""{"version":"0.2.0","apk":"https://example.com/argus-0.2.0.apk"}"""))
        assertEquals("0.2.0", api.latest()!!.version)
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"No Android release yet."}"""))
        assertNull(api.latest())
    }

    @Test fun phoneLookupSendsNumberCountryAndCall() = runTest {
        server.enqueue(MockResponse().setBody("""{"verdict":{"kind":"phone","subject":"+919876543210","score":85,"level":"HIGH RISK","threat_type":"Possible scam call","signals":[]},"cached":true}"""))
        val r = api.phone("+919876543210", "IN", call = true)
        assertEquals(85, r.verdict.score)
        assertTrue(r.cached)
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/api/app/phone?number=%2B919876543210&country=IN&call=1", req.path)
        assertEquals("Bearer a1", req.getHeader("Authorization"))
    }

    @Test fun scamNumbersAreDecoded() = runTest {
        server.enqueue(MockResponse().setBody("""{"numbers":[{"number":"+14155550100","label":"Reported as a scam by 3 Argus users"}]}"""))
        val list = api.scamNumbers()
        assertEquals(listOf(ScamNumber("+14155550100", "Reported as a scam by 3 Argus users")), list)
        assertEquals("/api/app/scam-numbers", server.takeRequest().path)
    }

    @Test fun reportPostsTheNumber() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.report("+919876543210", "IN")
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/app/report", req.path)
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"number\":\"+919876543210\""))
        assertTrue(body.contains("\"country\":\"IN\""))
    }

    @Test fun reportDevicePostsProtectionsAndFCMToken() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        val ok = api.reportDevice(
            DeviceReport(
                deviceId = "dev-123",
                name = "Google Pixel 8",
                appVersion = "0.2.0",
                protections = mapOf("calls" to true, "blocker" to false),
                fcmToken = "token-xyz",
            )
        )
        assertTrue(ok)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/app/device", req.path)
        assertEquals("Bearer a1", req.getHeader("Authorization"))
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"deviceId\":\"dev-123\""))
        assertTrue(body.contains("\"name\":\"Google Pixel 8\""))
        assertTrue(body.contains("\"appVersion\":\"0.2.0\""))
        assertTrue(body.contains("\"calls\":true"))
        assertTrue(body.contains("\"blocker\":false"))
        assertTrue(body.contains("\"fcmToken\":\"token-xyz\""))
    }

    @Test fun familyStatusReturnsMemberDevices() = runTest {
        val json = """{"members":[{"memberId":"m1","memberName":"Mom","deviceId":"d1","deviceName":"Pixel 7","appVersion":"0.2.0","protections":{"calls":true,"blocker":true},"lastSeenAt":"2026-10-06T12:00:00Z"}]}"""
        server.enqueue(MockResponse().setBody(json))
        val resp = api.familyStatus()
        assertEquals(1, resp.members.size)
        val mom = resp.members[0]
        assertEquals("m1", mom.memberId)
        assertEquals("Mom", mom.memberName)
        assertEquals("Pixel 7", mom.deviceName)
        assertEquals("0.2.0", mom.appVersion)
        assertEquals(true, mom.protections["calls"])
        assertEquals(true, mom.protections["blocker"])
        assertEquals("2026-10-06T12:00:00Z", mom.lastSeenAt)
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/api/app/family/status", req.path)
        assertEquals("Bearer a1", req.getHeader("Authorization"))
    }
}
