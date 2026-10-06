package app.askargus.calls

import app.askargus.net.PhoneResponse
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.cancellation.CancellationException

interface PhoneLookup { suspend fun phone(number: String, country: String?, call: Boolean): PhoneResponse }

sealed interface CallOutcome {
    data object Skip : CallOutcome
    data class Quiet(val score: Int) : CallOutcome
    data class Warn(val level: CallLevel, val score: Int, val number: String, val summary: String, val late: Boolean = false, val known: Boolean = false) : CallOutcome
}

/** Decides what an incoming call deserves: the phone's own memory first, then one lookup within a short budget.
 *  A lookup that fails or runs out of time says nothing at all: never a made-up "safe". */
class CallChecker(private val memory: CallMemory, private val lookup: PhoneLookup, private val budgetMs: Long = 3_000) {
    suspend fun check(number: String, country: String?, callActive: () -> Boolean): CallOutcome {
        if (CallPolicy.isHidden(number)) return CallOutcome.Skip
        if (memory.isNotScam(number)) return CallOutcome.Skip
        memory.knownScamLabel(number)?.let { return CallOutcome.Warn(CallLevel.LIKELY_SCAM, 90, number, it, known = true) }
        memory.recentScore(number)?.let { return outcome(it, number, "Argus checked this number recently", late = false, known = it >= 80) }
        val answer = try {
            withTimeoutOrNull(budgetMs) { lookup.phone(number, country, call = true) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        } ?: return CallOutcome.Skip
        val score = answer.verdict.score
        memory.remember(number, score)
        val summary = answer.verdict.threatType.takeIf { it.isNotBlank() && it != "None" } ?: answer.verdict.level
        return outcome(score, number, summary, late = !callActive(), known = false)
    }

    private fun outcome(score: Int, number: String, summary: String, late: Boolean, known: Boolean): CallOutcome {
        val level = CallPolicy.level(score)
        return if (level == CallLevel.NONE) CallOutcome.Quiet(score) else CallOutcome.Warn(level, score, number, summary, late, known)
    }
}
