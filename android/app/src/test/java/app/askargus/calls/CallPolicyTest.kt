package app.askargus.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CallPolicyTest {
    @Test fun levels() {
        assertEquals(CallLevel.LIKELY_SCAM, CallPolicy.level(80))
        assertEquals(CallLevel.SUSPICIOUS, CallPolicy.level(79))
        assertEquals(CallLevel.SUSPICIOUS, CallPolicy.level(60))
        assertEquals(CallLevel.NONE, CallPolicy.level(59))
    }

    @Test fun hiddenNumbers() {
        listOf(null, "", " ", "-1", "-2", "Unknown", "Private number").forEach { assertTrue("$it", CallPolicy.isHidden(it)) }
        assertFalse(CallPolicy.isHidden("+919876543210"))
    }

    @Test fun wording() {
        assertEquals("Likely scam call", CallPolicy.title(CallLevel.LIKELY_SCAM, late = false, number = "+91 98765 43210"))
        assertEquals("Suspicious number calling", CallPolicy.title(CallLevel.SUSPICIOUS, late = false, number = "+91 98765 43210"))
        assertEquals("That call from +91 98765 43210 was likely a scam", CallPolicy.title(CallLevel.LIKELY_SCAM, late = true, number = "+91 98765 43210"))
        assertEquals("That call from +91 98765 43210 looked suspicious", CallPolicy.title(CallLevel.SUSPICIOUS, late = true, number = "+91 98765 43210"))
    }

    @Test fun silenceOnlyWhenAlreadyKnownAsHighRisk() {
        assertTrue(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = true, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = false, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.SUSPICIOUS, known = true, silenceOn = true))
        assertFalse(CallPolicy.silences(CallLevel.LIKELY_SCAM, known = true, silenceOn = false))
    }
}
