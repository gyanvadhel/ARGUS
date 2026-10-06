package app.askargus.calls

import app.askargus.core.Verdict
import app.askargus.net.ApiException
import app.askargus.net.PhoneResponse
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeLookup(private val score: Int = 10, private val fail: Boolean = false, private val delayMs: Long = 0) : PhoneLookup {
    var calls = 0
    override suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse {
        calls++
        if (delayMs > 0) delay(delayMs)
        if (fail) throw ApiException("Argus's checker is waking up. Try again in a moment.", 502)
        return PhoneResponse(Verdict(kind = "phone", subject = number, score = score, level = "SUSPICIOUS", threatType = "Possible scam call"))
    }
}

class CallCheckerTest {
    private fun memory() = CallMemory(MapStore()) { 0L }

    @Test fun knownScamNumberWarnsWithoutAnyLookup() = runTest {
        val memory = memory().apply { setKnown(mapOf("+919876543210" to "Reported as a scam by 5 Argus users")) }
        val lookup = FakeLookup(score = 10)
        val out = CallChecker(memory, lookup).check("+919876543210", "IN") { true }
        out as CallOutcome.Warn
        assertEquals(CallLevel.LIKELY_SCAM, out.level)
        assertEquals(false, out.late)
        assertTrue(out.known)
        assertEquals("Reported as a scam by 5 Argus users", out.summary)
        assertEquals(0, lookup.calls)
    }

    @Test fun notScamNumberIsSkippedWithoutLookup() = runTest {
        val memory = memory().apply { markNotScam("+919876543210") }
        val lookup = FakeLookup(score = 95)
        assertEquals(CallOutcome.Skip, CallChecker(memory, lookup).check("+919876543210", "IN") { true })
        assertEquals(0, lookup.calls)
    }

    @Test fun recentVerdictAnswersWithoutLookup() = runTest {
        val memory = memory().apply { remember("+911111111111", 90); remember("+912222222222", 30) }
        val lookup = FakeLookup(score = 10)
        val high = CallChecker(memory, lookup).check("+911111111111", "IN") { true }
        assertEquals(CallLevel.LIKELY_SCAM, (high as CallOutcome.Warn).level)
        assertEquals(CallOutcome.Quiet(30), CallChecker(memory, lookup).check("+912222222222", "IN") { true })
        assertEquals(0, lookup.calls)
    }

    @Test fun lookupScoresMapToLevelsAndAreRemembered() = runTest {
        val memory = memory()
        val high = CallChecker(memory, FakeLookup(score = 85)).check("+911111111111", "IN") { true }
        high as CallOutcome.Warn
        assertEquals(CallLevel.LIKELY_SCAM, high.level)
        assertEquals(false, high.late)
        assertEquals("Possible scam call", high.summary)
        assertEquals(85, memory.recentScore("+911111111111"))
        val mid = CallChecker(memory, FakeLookup(score = 65)).check("+912222222222", "IN") { true }
        assertEquals(CallLevel.SUSPICIOUS, (mid as CallOutcome.Warn).level)
        assertEquals(CallOutcome.Quiet(40), CallChecker(memory, FakeLookup(score = 40)).check("+913333333333", "IN") { true })
    }

    @Test fun failedLookupSaysNothing() = runTest {
        val memory = memory()
        assertEquals(CallOutcome.Skip, CallChecker(memory, FakeLookup(fail = true)).check("+911111111111", "IN") { true })
        assertEquals(null, memory.recentScore("+911111111111"))
    }

    @Test fun answerAfterTheCallEndedIsLate() = runTest {
        val out = CallChecker(memory(), FakeLookup(score = 85)).check("+911111111111", "IN") { false }
        assertTrue((out as CallOutcome.Warn).late)
    }

    @Test fun slowLookupTimesOutWithoutAVerdict() = runTest {
        val memory = memory()
        val out = CallChecker(memory, FakeLookup(score = 10, delayMs = 10_000), budgetMs = 50).check("+911111111111", "IN") { true }
        assertEquals(CallOutcome.Skip, out)
        assertEquals(null, memory.recentScore("+911111111111"))
    }

    @Test fun hiddenNumberIsSkipped() = runTest {
        val lookup = FakeLookup(score = 95)
        assertEquals(CallOutcome.Skip, CallChecker(memory(), lookup).check("", "IN") { true })
        assertEquals(0, lookup.calls)
    }
}
