package app.askargus.calls

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telephony.TelephonyManager
import androidx.annotation.RequiresApi
import app.askargus.AppContainer
import app.askargus.ArgusApp
import app.askargus.core.Levels
import app.askargus.data.ActivityEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/** Android asks this service about every incoming call. It answers at once (never blocking a call; silencing only
 *  numbers already on this phone's scam list when the person turned that on), then checks the number in the
 *  background and warns with a notification. */
@RequiresApi(Build.VERSION_CODES.Q)
class ArgusCallScreeningService : CallScreeningService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onScreenCall(details: Call.Details) {
        val container = (applicationContext as ArgusApp).container
        val number = details.handle?.schemeSpecificPart
        val incoming = details.callDirection == Call.Details.DIRECTION_INCOMING
        // Reads only the phone's own list, so it's instant.
        val silenceNow = incoming && runBlocking { silenceKnown(container, number) }
        respondToCall(details, CallResponse.Builder().setDisallowCall(false).setRejectCall(false).setSilenceCall(silenceNow).build())
        if (!incoming || number == null || CallPolicy.isHidden(number)) return
        scope.launch { runCatching { check(container, number) } }
    }

    private suspend fun silenceKnown(c: AppContainer, number: String?): Boolean {
        if (number == null || CallPolicy.isHidden(number)) return false
        if (!c.prefs.callWarnings.first() || c.account.session.value == null) return false
        val known = c.callMemory.knownScamLabel(number) != null && !c.callMemory.isNotScam(number)
        return CallPolicy.silences(CallLevel.LIKELY_SCAM, known, c.prefs.silenceCalls.first())
    }

    private suspend fun check(c: AppContainer, number: String) {
        if (!c.prefs.callWarnings.first() || c.account.session.value == null) return
        if (!c.callMemory.shouldWarn(number)) return
        val country = getSystemService(TelephonyManager::class.java)?.simCountryIso?.uppercase()?.ifBlank { null }
        val started = System.currentTimeMillis()
        // The service can't see the hang-up, so an answer that comes more than 20 s after the ring is worded in the
        // past tense.
        when (val outcome = c.callChecker.check(number, country) { System.currentTimeMillis() - started < 20_000 }) {
            is CallOutcome.Warn -> {
                CallNotifications.show(this, outcome, country)
                log(c, number, outcome.score)
            }
            is CallOutcome.Quiet -> log(c, number, outcome.score)
            CallOutcome.Skip -> Unit
        }
    }

    private suspend fun log(c: AppContainer, number: String, score: Int) {
        c.activity.add(
            ActivityEvent(
                at = System.currentTimeMillis(), type = "call", kind = "call", subject = number,
                score = score, level = Levels.levelFor(score), source = "call",
            ),
        )
    }
}
