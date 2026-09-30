package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

const val NOW = 1_790_000_000L

fun sessionJson(access: String, refresh: String = "r-$access", expiresAt: Long? = NOW + 3600) = """
    {"access_token":"$access","refresh_token":"$refresh","expires_in":3600${if (expiresAt != null) ",\"expires_at\":$expiresAt" else ""},
     "user":{"id":"u1","email":"asha@example.com","user_metadata":{"full_name":"Asha Rao"}}}
""".trimIndent()

class SupabaseAuthTest {
    private val server = MockWebServer()
    private lateinit var auth: SupabaseAuth

    @Before fun start() {
        server.start()
        auth = SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk_test", now = { NOW })
    }

    @After fun stop() = server.shutdown()

    @Test fun passwordSignInReturnsTheSession() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        val s = auth.signInWithPassword("asha@example.com", "pw123456")
        assertEquals(Session("a1", "r-a1", NOW + 3600, "u1", "asha@example.com", "Asha Rao"), s)
        val req = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=password", req.path)
        assertEquals("pk_test", req.getHeader("apikey"))
        assertTrue(req.body.readUtf8().contains("\"password\":\"pw123456\""))
    }

    @Test fun wrongPasswordIsExplainedPlainly() = runTest {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}"""))
        val e = runCatching { auth.signInWithPassword("asha@example.com", "nope") }.exceptionOrNull()
        assertTrue(e is AuthException)
        assertEquals("That email and password don't match.", e!!.message)
    }

    @Test fun googleSendsTheRawNonce() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("g1")))
        auth.signInWithGoogle("id-token", "raw-nonce")
        val req = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=id_token", req.path)
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"provider\":\"google\""))
        assertTrue(body.contains("\"id_token\":\"id-token\""))
        assertTrue(body.contains("\"nonce\":\"raw-nonce\""))
    }

    @Test fun usesExpiresInWhenExpiresAtIsMissing() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1", expiresAt = null)))
        assertEquals(NOW + 3600, auth.signInWithPassword("asha@example.com", "pw123456").expiresAt)
    }

    @Test fun signUpThatNeedsConfirmation() = runTest {
        server.enqueue(MockResponse().setBody("""{"id":"u9","email":"new@example.com","identities":[{"id":"i1"}]}"""))
        assertEquals(SignUpResult.CheckInbox, auth.signUp("Asha", "new@example.com", "pw123456", "https://askargus.app/auth/confirm"))
        val req = server.takeRequest()
        assertEquals("/auth/v1/signup?redirect_to=https%3A%2F%2Faskargus.app%2Fauth%2Fconfirm", req.path)
        assertTrue(req.body.readUtf8().contains("\"full_name\":\"Asha\""))
    }

    @Test fun signUpWithAnEmailThatAlreadyHasAnAccount() = runTest {
        server.enqueue(MockResponse().setBody("""{"id":"u9","email":"old@example.com","identities":[]}"""))
        assertEquals(SignUpResult.AlreadyRegistered, auth.signUp("Asha", "old@example.com", "pw123456", "https://askargus.app/auth/confirm"))
    }

    @Test fun signUpThatSignsStraightIn() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a5")))
        val r = auth.signUp("Asha", "new@example.com", "pw123456", "https://askargus.app/auth/confirm")
        assertTrue(r is SignUpResult.SignedIn && r.session.accessToken == "a5")
    }
}
