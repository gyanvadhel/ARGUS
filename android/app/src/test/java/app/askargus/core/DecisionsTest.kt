package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DecisionsTest {
    private val send = "android.intent.action.SEND"
    private val view = "android.intent.action.VIEW"

    @Test fun sharedTextBecomesAThingToCheck() {
        assertEquals(Incoming.Text("Pay Rs 25 now"), IncomingParser.parse(send, "text/plain", "Pay Rs 25 now", null, null, null))
        assertEquals(Incoming.Text("Title only"), IncomingParser.parse(send, "text/plain", null, "Title only", null, null))
        assertNull(IncomingParser.parse(send, "text/plain", "  ", null, null, null))
    }

    @Test fun sharedImagesNeedTheirFile() {
        assertEquals(Incoming.Image("content://media/1"), IncomingParser.parse(send, "image/png", null, null, "content://media/1", null))
        assertNull(IncomingParser.parse(send, "image/jpeg", null, null, null, null))
    }

    @Test fun familyInviteLinksOpenTheJoinScreen() {
        val code = "AbCdEfGhIjKlMnOpQrStUvWx"
        assertEquals(Incoming.Join(code), IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/$code"))
        assertEquals(Incoming.Join(code), IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/$code/"))
        assertNull(IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/short"))
        assertNull(IncomingParser.parse(view, null, null, null, null, "https://evil.example/app/join/$code"))
        assertNull(IncomingParser.parse("android.intent.action.MAIN", null, null, null, null, null))
    }

    @Test fun websiteSignInIsOnlyHandedOverWhenNeeded() {
        assertTrue(HandoffPlan.needsHandoff("u1", null))
        assertTrue(HandoffPlan.needsHandoff("u1", "u2"))
        assertFalse(HandoffPlan.needsHandoff("u1", "u1"))
        assertTrue(HandoffPlan.needsHandoff("u1", "u1", force = true))
        assertFalse(HandoffPlan.needsHandoff(null, null, force = true))
        assertEquals("https://askargus.app/history", HandoffPlan.plainUrl("https://askargus.app/", "history"))
        assertEquals("https://askargus.app/scan/abc", HandoffPlan.plainUrl("https://askargus.app", "/scan/abc"))
    }

    @Test fun updatesAreOfferedOnceAndNotifiedOnce() {
        assertEquals(UpdateDecision.Outcome(null, false), UpdateDecision.decide(null, "0.1.0", null))
        assertEquals(UpdateDecision.Outcome(null, false), UpdateDecision.decide("0.1.0", "0.1.0", null))
        assertEquals(UpdateDecision.Outcome("0.2.0", true), UpdateDecision.decide("0.2.0", "0.1.0", null))
        assertEquals(UpdateDecision.Outcome("0.2.0", false), UpdateDecision.decide("0.2.0", "0.1.0", "0.2.0"))
    }
}
