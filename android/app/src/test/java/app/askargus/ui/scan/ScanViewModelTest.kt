package app.askargus.ui.scan

import android.content.ContextWrapper
import app.askargus.core.Verdict
import app.askargus.net.Checker
import app.askargus.net.ScanResponse
import app.askargus.read.ImageReader
import app.askargus.scan.ScanFlow
import app.askargus.scan.ScanState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ScanViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val verdict = Verdict("text", "Hello", 10, "SAFE", "No red flags", emptyList(), "Safe", "2026-10-01", true)
    private val checker = object : Checker {
        override suspend fun scan(input: String, save: String): ScanResponse = ScanResponse("s1", verdict)
    }
    private val flow = ScanFlow(checker, { true }, { })
    private val reader = ImageReader(ContextWrapper(null))
    private lateinit var vm: ScanViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        vm = ScanViewModel(flow, reader)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun setDraftUpdatesDraft() {
        vm.setDraft("test text")
        assertEquals("test text", vm.draft.value)
    }

    @Test
    fun resetClearsDraftAndSetsStateToIdle() {
        vm.setDraft("previous text")
        vm.reset()
        assertEquals("", vm.draft.value)
        assertEquals(ScanState.Idle, vm.state.value)
    }
}
