package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Test

class LevelsTest {
    @Test fun safeNeedsPositiveEvidence() {
        assertEquals(LevelInfo("Safe", Risk.SAFE), Levels.meta("SAFE", verified = true))
        assertEquals(LevelInfo("No red flags", Risk.CLEAR), Levels.meta("SAFE", verified = false))
    }

    @Test fun otherLevelsUseTheWebsitesWords() {
        assertEquals(LevelInfo("Low risk", Risk.LOW), Levels.meta("LOW/MODERATE", false))
        assertEquals(LevelInfo("Suspicious", Risk.SUSPICIOUS), Levels.meta("SUSPICIOUS", false))
        assertEquals(LevelInfo("High risk", Risk.HIGH), Levels.meta("HIGH RISK", true))
        assertEquals(LevelInfo("Unverified", Risk.UNKNOWN), Levels.meta("UNVERIFIED", false))
        assertEquals(LevelInfo("Unverified", Risk.UNKNOWN), Levels.meta("something new", false))
    }

    @Test fun scoresMapToTheWebsitesBands() {
        assertEquals("SAFE", Levels.levelFor(29))
        assertEquals("LOW/MODERATE", Levels.levelFor(30))
        assertEquals("SUSPICIOUS", Levels.levelFor(60))
        assertEquals("HIGH RISK", Levels.levelFor(80))
    }

    @Test fun kindsHavePlainNames() {
        assertEquals("Link", Kinds.label("url"))
        assertEquals("Message", Kinds.label("text"))
        assertEquals("Phone", Kinds.label("phone"))
        assertEquals("Email", Kinds.label("email"))
        assertEquals("UPI code", Kinds.label("upi"))
        assertEquals("Check", Kinds.label("unknown-kind"))
    }
}
