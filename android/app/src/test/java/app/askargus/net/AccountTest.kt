package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountTest {
    private val server = MockWebServer().apply { start() }
    private val sessions = ObservableSessionStore(MemorySessionStore())
    private var signedOut = false
    private val account = Account(
        SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW }),
        sessions, "https://askargus.app", onSignedOut = { signedOut = true },
    )

    @After fun stop() {
        runCatching { server.shutdown() }
    }

    @Test fun signInTrimsTheEmailAndPublishesTheSession() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        account.signIn("  asha@example.com ", "pw123456")
        assertTrue(server.takeRequest().body.readUtf8().contains("\"email\":\"asha@example.com\""))
        assertEquals("a1", account.session.value!!.accessToken)
    }

    @Test fun aFreshProcessIsSignedInFromTheSavedSession() = runTest {
        val saved = ObservableSessionStore(MemorySessionStore(Session("a1", "r1", NOW + 3600, "u1")))
        val cold = Account(SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW }), saved, "https://askargus.app", onSignedOut = {})
        assertNull(cold.session.value)
        assertTrue(cold.signedIn())
    }

    @Test fun signOutForgetsTheSessionEvenIfTheServerIsUnreachable() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        account.signIn("asha@example.com", "pw123456")
        server.shutdown()
        account.signOut()
        assertNull(account.session.value)
        assertTrue(signedOut)
    }
}
