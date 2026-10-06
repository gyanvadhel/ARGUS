package app.askargus.blocker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockerStateTest {
    @Test fun oneVisitIsReportedOnceThoughThePhoneAsksSeveralTimes() {
        BlockerState.resetDaily()
        // A browser asks for the IPv4 and IPv6 address, and retries: all within a second or two.
        assertTrue(BlockerState.shouldReport("evil.example", now = 1_000))
        assertFalse(BlockerState.shouldReport("evil.example", now = 1_200))
        assertFalse(BlockerState.shouldReport("EVIL.example.", now = 3_000))
        assertTrue(BlockerState.shouldReport("other.example", now = 3_000))
        // Coming back to it later is a new visit.
        assertTrue(BlockerState.shouldReport("evil.example", now = 1_000 + 61_000))
    }

    @Test fun anAllowedSiteCanBeBlockedAgain() {
        BlockerState.setAllowed(emptyList())
        BlockerState.allow("Evil.example.")
        assertTrue(BlockerState.isAllowed("evil.example"))
        assertTrue(BlockerState.isAllowed("login.evil.example"))
        BlockerState.disallow("EVIL.example")
        assertFalse(BlockerState.isAllowed("evil.example"))
        assertFalse(BlockerState.isAllowed("login.evil.example"))
    }
}
