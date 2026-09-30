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
}
