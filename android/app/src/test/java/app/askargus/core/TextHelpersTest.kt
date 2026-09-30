package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class TextHelpersTest {
    @Test fun findsTheFirstLinkAndDropsSentencePunctuation() {
        assertEquals("https://evil.example/login", Links.first("Check this: https://evil.example/login."))
        assertEquals("www.site.com", Links.first("go to www.site.com, now"))
        assertNull(Links.first("no link here"))
    }

    @Test fun comparesVersions() {
        assertTrue(Versions.isNewer("0.2.0", "0.1.0"))
        assertTrue(Versions.isNewer("android-v0.10.0", "0.9.9"))
        assertTrue(Versions.isNewer("1.0", "0.9.9"))
        assertFalse(Versions.isNewer("0.1.0", "0.1.0"))
        assertFalse(Versions.isNewer("0.1.0", "0.2.0"))
    }

    @Test fun sharedTextWins_subjectIsTheFallback() {
        assertEquals("Your parcel is held", ShareInput.combine("  Your parcel is held ", "Messages"))
        assertEquals("Only a title", ShareInput.combine(null, "Only a title"))
        assertEquals("", ShareInput.combine("  ", null))
    }

    @Test fun capsLength() {
        assertEquals(20_000, ShareInput.combine("x".repeat(50_000), null).length)
    }

    @Test fun noncesAreRandomAndHashedLikeGoogleExpects() {
        val a = Nonce.raw()
        assertEquals(32, a.length)
        assertTrue(a.matches(Regex("[A-Za-z0-9_-]+")))
        assertNotEquals(a, Nonce.raw())
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Nonce.sha256Hex("abc"))
    }

    @Test fun tidiesScreenshotText() {
        assertEquals(
            "Dear customer,\n\nyour KYC expires today\n\nCall 98765 43210",
            OcrText.tidy("  Dear  customer,\n\n\n\nyour KYC   expires today \n  \n Call 98765 43210 \n"),
        )
    }

    @Test fun formatsRupees() {
        assertEquals("₹4,999.00", Money.rupees("4999"))
        assertEquals("abc", Money.rupees("abc"))
    }

    @Test fun saysHowLongAgo() {
        val now = 1_790_000_000_000L
        assertEquals("just now", TimeAgo.format(now, now - 20_000))
        assertEquals("5 min ago", TimeAgo.format(now, now - 5 * 60_000))
        assertEquals("3 h ago", TimeAgo.format(now, now - 3 * 3_600_000))
        val sep28 = 1_790_589_600_000L // 2026-09-28T10:00:00Z
        assertEquals("28 Sep", TimeAgo.format(sep28 + 3 * 86_400_000L, sep28, TimeZone.getTimeZone("UTC")))
    }

    @Test fun pupilSlidesTowardTheTouchAndStopsAtItsLimit() {
        assertEquals(0f to 0f, Gaze.pupilOffset(10f, 10f, 10f, 10f, 4f))
        val (fx, fy) = Gaze.pupilOffset(0f, 0f, 1000f, 0f, 4f, reach = 240f)
        assertEquals(4f, fx, 0.001f); assertEquals(0f, fy, 0.001f)
        val (nx, _) = Gaze.pupilOffset(0f, 0f, 120f, 0f, 4f, reach = 240f)
        assertEquals(2f, nx, 0.001f)
    }

    @Test fun blinksCloseInTheMiddle() {
        assertEquals(0f, Gaze.blinkClosure(0f), 0f)
        assertEquals(0f, Gaze.blinkClosure(1f), 0f)
        assertEquals(1f, Gaze.blinkClosure(0.5f), 0.0001f)
    }
}
