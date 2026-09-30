package app.askargus.ui.family

import app.askargus.net.ArgusApi
import app.askargus.net.MemorySessionStore
import app.askargus.net.NOW
import app.askargus.net.Session
import app.askargus.net.SupabaseAuth
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class FamilyViewModelTest {
    private val server = MockWebServer()
    private val store = MemorySessionStore(Session("a1", "r1", NOW + 3600, "u1"))
    private lateinit var vm: FamilyViewModel

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.start()
        val base = server.url("/").toString()
        vm = FamilyViewModel(ArgusApi(OkHttpClient(), base, SupabaseAuth(OkHttpClient(), base, "pk", now = { NOW }), store, now = { NOW }))
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
        runCatching { server.shutdown() }
    }

    private fun loaded() = runBlocking { withTimeout(5000) { vm.state.first { !it.loading } } }

    @Test fun loadsMembers() {
        server.enqueue(MockResponse().setBody("""{"members":[{"linkId":"l1","name":"Asha Rao","joinedAt":"2026-09-30T10:00:00Z"}]}"""))
        vm.load()
        assertEquals("Asha Rao", loaded().members.single().name)
    }

    @Test fun signedOutPeopleAreAskedToSignIn() {
        runBlocking { store.save(null) }
        vm.load()
        assertTrue(loaded().signedOut)
    }

    @Test fun invitesComeBackAsALink() {
        server.enqueue(MockResponse().setBody("""{"url":"https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx","expiresAt":"2026-10-07T10:00:00Z"}"""))
        val invite = runBlocking { vm.invite() }
        assertEquals("https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx", invite!!.url)
    }
}
