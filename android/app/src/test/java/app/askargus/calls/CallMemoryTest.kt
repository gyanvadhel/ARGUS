package app.askargus.calls

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MapStore : KeyValueStore {
    val map = mutableMapOf<String, String>()
    override suspend fun get(key: String) = map[key]
    override suspend fun put(key: String, value: String) { map[key] = value }
}

class CallMemoryTest {
    private val day = 24L * 60 * 60 * 1000
    private var clock = 1_000_000_000L
    private val store = MapStore()
    private fun memory() = CallMemory(store) { clock }

    @Test fun knownListSurvivesANewInstance() = runTest {
        memory().setKnown(mapOf("+919876543210" to "Reported as a scam by 5 Argus users"))
        assertEquals("Reported as a scam by 5 Argus users", memory().knownScamLabel("+919876543210"))
        assertNull(memory().knownScamLabel("+919000000000"))
        assertEquals(clock, memory().knownAt())
    }

    @Test fun verdictsAreKeptSevenDays() = runTest {
        memory().remember("+14155550100", 88)
        clock += 6 * day
        assertEquals(88, memory().recentScore("+14155550100"))
        clock += 2 * day
        assertNull(memory().recentScore("+14155550100"))
    }

    @Test fun notScamSticks() = runTest {
        memory().markNotScam("+14155550100")
        assertTrue(memory().isNotScam("+14155550100"))
        assertFalse(memory().isNotScam("+14155550101"))
    }

    @Test fun unmarkNotScamRemovesFromNotScam() = runTest {
        val m = memory()
        m.markNotScam("+14155550100")
        assertTrue(m.isNotScam("+14155550100"))
        m.unmarkNotScam("+14155550100")
        assertFalse(m.isNotScam("+14155550100"))
    }

    @Test fun sameNumberWarnsOnceInTwoMinutes() = runTest {
        assertTrue(memory().shouldWarn("+14155550100"))
        clock += 60_000
        assertFalse(memory().shouldWarn("+14155550100"))
        clock += 90_000
        assertTrue(memory().shouldWarn("+14155550100"))
    }

    @Test fun aDamagedStoreReadsAsEmpty() = runTest {
        store.map["calls.known"] = "not json"
        assertNull(memory().knownScamLabel("+919876543210"))
    }
}
