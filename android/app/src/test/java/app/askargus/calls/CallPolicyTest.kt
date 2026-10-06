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

    @Test fun dialerNumbersBecomeInternational() {
        assertEquals("+919876543210", CallPolicy.e164("+91 98765 43210", "IN"))
        assertEquals("+919876543210", CallPolicy.e164("09876543210", "IN"))
        assertEquals("+919876543210", CallPolicy.e164("9876543210", "in"))
        assertEquals("+919876543210", CallPolicy.e164("919876543210", "IN"))
        assertEquals("+14155550123", CallPolicy.e164("(415) 555-0123", "US"))
        assertEquals("+447700900123", CallPolicy.e164("00447700900123", null))
    }

    @Test fun unsureNumbersStayUnread() {
        assertEquals(null, CallPolicy.e164("9876543210", null))
        assertEquals(null, CallPolicy.e164("9876543210", "FR"))
        assertEquals(null, CallPolicy.e164("+0123", "IN"))
    }
}
