package app.askargus.scan

import app.askargus.core.Qr
import app.askargus.core.QrPayload
import app.askargus.core.Verdict
import app.askargus.data.ActivityEvent
import app.askargus.net.ApiException
import app.askargus.net.Checker
import app.askargus.net.SignedOutException
import kotlin.coroutines.cancellation.CancellationException

sealed interface ScanState {
    data object Idle : ScanState
    data class Reading(val message: String) : ScanState
    data class Checking(val input: String) : ScanState
    data class Done(val input: String, val verdict: Verdict, val scanId: String?, val source: String) : ScanState
    data class Upi(val payment: QrPayload.Upi) : ScanState
    data class NeedsSignIn(val input: String, val source: String) : ScanState
    data class Failed(val message: String, val input: String? = null) : ScanState
}

/** What happens when something is checked: sign-in first, QR codes sorted, screenshots read, results recorded. */
class ScanFlow(
    private val checker: Checker,
    private val signedIn: suspend () -> Boolean,
    private val record: suspend (ActivityEvent) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun check(input: String, source: String): ScanState {
        val text = input.trim()
        if (text.isEmpty()) return ScanState.Failed("Paste something to check first.")
        if (!signedIn()) return ScanState.NeedsSignIn(text, source)
        return try {
            val res = checker.scan(text, "always")
            val v = res.verdict
            record(ActivityEvent(at = now(), type = "scan", kind = v.kind, subject = v.subject.take(200), score = v.score,
                level = v.level, verified = v.verified, scanId = res.id, source = source))
            ScanState.Done(text, v, res.id, source)
        } catch (e: SignedOutException) {
            ScanState.NeedsSignIn(text, source)
        } catch (e: ApiException) {
            ScanState.Failed(e.message ?: "The check couldn't finish. Try again.", text)
        }
    }

    suspend fun fromQr(raw: String, source: String): ScanState = when (val p = Qr.parse(raw)) {
        is QrPayload.Upi -> {
            record(ActivityEvent(at = now(), type = "upi", kind = "upi", subject = p.name ?: p.payee, source = source))
            ScanState.Upi(p)
        }
        is QrPayload.Url -> check(p.url, source)
        is QrPayload.Phone -> check(p.number, source)
        is QrPayload.Text -> check(p.text, source)
    }

    suspend fun fromImage(qr: suspend () -> String?, words: suspend () -> String, onStage: (ScanState) -> Unit = {}): ScanState {
        onStage(ScanState.Reading("Looking for a QR code…"))
        val code = try { qr() } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (!code.isNullOrBlank()) return fromQr(code, "qr-image")
        onStage(ScanState.Reading("Reading your screenshot on this phone…"))
        val text = try {
            words()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return ScanState.Failed("Couldn't read that image. Try a clearer screenshot, or paste the text.")
        }
        if (text.count { !it.isWhitespace() } < 4) return ScanState.Failed("No words or QR code found in that image.")
        onStage(ScanState.Checking(text))
        return check(text, "screenshot")
    }
}
