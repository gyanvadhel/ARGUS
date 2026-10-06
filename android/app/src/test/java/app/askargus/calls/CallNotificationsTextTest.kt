package app.askargus.calls

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallNotificationsTextTest {
    @Test fun knownHitShowsTheListLabel() {
        val w = CallOutcome.Warn(CallLevel.LIKELY_SCAM, 90, "+919876543210", "Reported as a scam by 5 Argus users", known = true)
        assertEquals("Reported as a scam by 5 Argus users", CallNotifications.body(w))
    }

    @Test fun rememberedNumberSaysSo() {
        val w = CallOutcome.Warn(CallLevel.SUSPICIOUS, 65, "+919876543210", "Argus checked this number recently")
        assertEquals("Argus checked this number recently", CallNotifications.body(w))
    }

    @Test fun lateWarningAsksForAReport() {
        val w = CallOutcome.Warn(CallLevel.LIKELY_SCAM, 85, "+919876543210", "Possible scam call", late = true)
        assertTrue(CallNotifications.body(w).endsWith("Tap Scam to report it."))
    }
}
