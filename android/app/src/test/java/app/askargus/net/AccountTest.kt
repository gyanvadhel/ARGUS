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

    @Test fun signOutForgetsThisPhoneWhileTheSessionStillWorks() = runTest {
        var hadSession = false
        val acc = Account(
            SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW }),
            sessions, "https://askargus.app",
            beforeSignOut = { hadSession = sessions.load() != null },
        )
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        acc.signIn("asha@example.com", "pw123456")
        acc.signOut()
        assertTrue(hadSession)
        assertNull(acc.session.value)
    }

    @Test fun signOutStillSignsOutWhenForgettingThePhoneFails() = runTest {
        val acc = Account(
            SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW }),
            sessions, "https://askargus.app",
            beforeSignOut = { error("offline") },
        )
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        acc.signIn("asha@example.com", "pw123456")
        acc.signOut()
        assertNull(acc.session.value)
    }
}
