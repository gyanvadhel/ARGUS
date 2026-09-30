package app.askargus.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Signal(
    val source: String,
    val status: String,
    val score: Int,
    val weight: Double = 1.0,
    val summary: String,
    val authoritative: Boolean = false,
    val trust: Double = 0.0,
)

@Serializable
data class Verdict(
    val kind: String,
    val subject: String,
    val score: Int,
    val level: String,
    @SerialName("threat_type") val threatType: String,
    val signals: List<Signal> = emptyList(),
    val recommendation: String = "",
    @SerialName("scanned_at") val scannedAt: String = "",
    val verified: Boolean = false,
)

object Reasons {
    fun top(verdict: Verdict, count: Int = 3): List<String> = verdict.signals
        .filter { it.status == "malicious" || it.status == "suspicious" }
        .sortedByDescending { it.score * minOf(1.0, it.weight) }
        .take(count)
        .map { it.summary }

    fun answered(verdict: Verdict): Pair<Int, Int> =
        verdict.signals.count { it.status != "unavailable" && it.status != "error" } to verdict.signals.size

    /** The line under the level word, as on the website's verdict card. */
    fun subtitle(verdict: Verdict): String = when {
        verdict.threatType != "None" -> verdict.threatType
        verdict.verified -> "Positive evidence it's legitimate"
        else -> "Nothing suspicious found"
    }
}
