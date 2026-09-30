package app.askargus.core

enum class Risk { SAFE, CLEAR, LOW, SUSPICIOUS, HIGH, UNKNOWN }

data class LevelInfo(val label: String, val risk: Risk)

/** The website's words for a verdict (web/src/lib/format.ts): "Safe" only with positive evidence. */
object Levels {
    fun meta(level: String, verified: Boolean): LevelInfo = when (level) {
        "SAFE" -> if (verified) LevelInfo("Safe", Risk.SAFE) else LevelInfo("No red flags", Risk.CLEAR)
        "LOW/MODERATE" -> LevelInfo("Low risk", Risk.LOW)
        "SUSPICIOUS" -> LevelInfo("Suspicious", Risk.SUSPICIOUS)
        "HIGH RISK" -> LevelInfo("High risk", Risk.HIGH)
        else -> LevelInfo("Unverified", Risk.UNKNOWN)
    }

    fun levelFor(score: Int): String = when {
        score >= 80 -> "HIGH RISK"
        score >= 60 -> "SUSPICIOUS"
        score >= 30 -> "LOW/MODERATE"
        else -> "SAFE"
    }
}

object Kinds {
    fun label(kind: String): String = when (kind) {
        "url" -> "Link"
        "text" -> "Message"
        "phone" -> "Phone"
        "email" -> "Email"
        "file" -> "File"
        "call" -> "Call"
        "upi" -> "UPI code"
        else -> "Check"
    }
}
