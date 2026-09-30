package app.askargus.ui.auth

import app.askargus.net.Account
import app.askargus.net.MemorySessionStore
import app.askargus.net.NOW
import app.askargus.net.ObservableSessionStore
import app.askargus.net.SupabaseAuth
import app.askargus.net.sessionJson
import app.askargus.ui.auth.SignInViewModel.Mode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SignInViewModelTest {
    private val server = MockWebServer()
    private lateinit var vm: SignInViewModel

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.start()
        val auth = SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW })
        vm = SignInViewModel(Account(auth, ObservableSessionStore(MemorySessionStore()), "https://askargus.app"))
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
        runCatching { server.shutdown() }
    }

    private fun settled() = runBlocking { withTimeout(5000) { vm.state.first { !it.busy && (it.done || it.error != null || it.notice != null) } } }

    @Test fun validatesBeforeCallingTheServer() {
        assertEquals("Tell us your name.", SignInViewModel.validate(Mode.CREATE, " ", "a@b.c", "12345678"))
        assertEquals("Enter your email address.", SignInViewModel.validate(Mode.SIGN_IN, "", "nope", "x"))
        assertEquals("Use at least 8 characters for your password.", SignInViewModel.validate(Mode.CREATE, "Asha", "a@b.c", "short"))
        assertEquals("Enter your password.", SignInViewModel.validate(Mode.SIGN_IN, "", "a@b.c", ""))
        assertNull(SignInViewModel.validate(Mode.SIGN_IN, "", "a@b.c", "x"))
        vm.submit("", "nope", "")
        assertEquals("Enter your email address.", vm.state.value.error)
        assertEquals(0, server.requestCount)
    }

    @Test fun signingInFinishes() {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        vm.submit("", "asha@example.com", "pw123456")
        assertTrue(settled().done)
    }

    @Test fun wrongPasswordIsShown() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"msg":"Invalid login credentials"}"""))
        vm.submit("", "asha@example.com", "wrong")
        assertEquals("That email and password don't match.", settled().error)
    }

    @Test fun newAccountsAreToldToCheckTheirInbox() {
        vm.setMode(Mode.CREATE)
        server.enqueue(MockResponse().setBody("""{"id":"u9","identities":[{"id":"i"}]}"""))
        vm.submit("Asha", "new@example.com", "pw123456")
        val s = settled()
        assertEquals(Mode.SIGN_IN, s.mode)
        assertTrue(s.notice!!.startsWith("Check your inbox"))
    }

    @Test fun anExistingEmailIsToldToSignIn() {
        vm.setMode(Mode.CREATE)
        server.enqueue(MockResponse().setBody("""{"id":"u9","identities":[]}"""))
        vm.submit("Asha", "old@example.com", "pw123456")
        assertEquals("That email already has an account. Sign in instead.", settled().error)
    }
}
