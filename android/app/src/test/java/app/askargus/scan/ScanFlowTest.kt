package app.askargus.scan

import app.askargus.core.QrPayload
import app.askargus.core.Verdict
import app.askargus.data.ActivityEvent
import app.askargus.net.ApiException
import app.askargus.net.Checker
import app.askargus.net.ScanResponse
import app.askargus.net.SignedOutException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanFlowTest {
    private val verdict = Verdict("text", "Pay now", 91, "HIGH RISK", "Scam or spam message")
    private val calls = mutableListOf<Pair<String, String>>()
    private val recorded = mutableListOf<ActivityEvent>()
    private var answer: () -> ScanResponse = { ScanResponse("s1", verdict) }
    private val checker = object : Checker {
        override suspend fun scan(input: String, save: String): ScanResponse {
            calls += input to save
            return answer()
        }
    }

    private fun flow(signedIn: Boolean = true) = ScanFlow(checker, { signedIn }, { recorded += it }, now = { 1000L })

    @Test fun emptyInputAsksForSomething() = runTest {
        assertEquals(ScanState.Failed("Paste something to check first."), flow().check("   ", "paste"))
        assertTrue(calls.isEmpty())
    }

    @Test fun signedOutKeepsTheInputForAfterSignIn() = runTest {
        assertEquals(ScanState.NeedsSignIn("Pay now", "share"), flow(signedIn = false).check(" Pay now ", "share"))
        assertTrue(calls.isEmpty())
    }

    @Test fun aCheckIsSavedAndRecordedOnThePhone() = runTest {
        assertEquals(ScanState.Done("Pay now", verdict, "s1", "paste"), flow().check("Pay now", "paste"))
        assertEquals("Pay now" to "always", calls.single())
        val e = recorded.single()
        assertEquals(listOf("scan", "text", "s1", "paste"), listOf(e.type, e.kind, e.scanId, e.source))
        assertEquals(91, e.score)
    }

    @Test fun failureKeepsInputForRetry() = runTest {
        answer = { throw ApiException("Argus's checker is waking up. Try again in a moment.", 504) }
        assertEquals(ScanState.Failed("Argus's checker is waking up. Try again in a moment.", "Pay now"), flow().check("Pay now", "paste"))
        assertTrue(recorded.isEmpty())
    }

    @Test fun anEndedSessionAsksToSignIn() = runTest {
        answer = { throw SignedOutException() }
        assertEquals(ScanState.NeedsSignIn("Pay now", "paste"), flow().check("Pay now", "paste"))
    }

    @Test fun upiCodesAreExplainedNotChecked() = runTest {
        val s = flow().fromQr("upi://pay?pa=refund.desk@ybl&am=4999", "qr")
        assertEquals(ScanState.Upi(QrPayload.Upi(false, "refund.desk@ybl", null, "4999", null)), s)
        assertTrue(calls.isEmpty())
        assertEquals("upi", recorded.single().type)
    }

    @Test fun linkCodesAreChecked() = runTest {
        flow().fromQr("https://prize.example/claim", "qr")
        assertEquals("https://prize.example/claim", calls.single().first)
    }

    @Test fun imageWithNothingInIt() = runTest {
        assertEquals(ScanState.Failed("No words or QR code found in that image."), flow().fromImage({ null }, { " \n " }))
    }

    @Test fun unreadableImage() = runTest {
        val s = flow().fromImage({ null }, { throw java.io.IOException("bad file") })
        assertEquals(ScanState.Failed("Couldn't read that image. Try a clearer screenshot, or paste the text."), s)
    }

    @Test fun aQrCodeInAnImageWinsOverItsWords() = runTest {
        assertTrue(flow().fromImage({ "upi://pay?pa=a@b" }, { error("not read") }) is ScanState.Upi)
    }

    @Test fun screenshotWordsAreCheckedAndEachStageIsShown() = runTest {
        val stages = mutableListOf<ScanState>()
        val s = flow().fromImage({ null }, { "Your KYC expires today" }) { stages += it }
        assertEquals(
            listOf(
                ScanState.Reading("Looking for a QR code…"),
                ScanState.Reading("Reading your screenshot on this phone…"),
                ScanState.Checking("Your KYC expires today"),
            ),
            stages,
        )
        assertEquals("screenshot", (s as ScanState.Done).source)
    }
}
