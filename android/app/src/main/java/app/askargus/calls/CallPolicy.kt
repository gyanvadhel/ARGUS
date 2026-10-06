package app.askargus.calls

enum class CallLevel { LIKELY_SCAM, SUSPICIOUS, NONE }

/** The rules for what a call result means for the person, with no Android in them. */
object CallPolicy {
    fun level(score: Int) = when {
        score >= 80 -> CallLevel.LIKELY_SCAM
        score >= 60 -> CallLevel.SUSPICIOUS
        else -> CallLevel.NONE
    }

    private val HIDDEN = setOf("", "-1", "-2", "-3", "unknown", "private number", "private", "withheld", "restricted")
    fun isHidden(raw: String?) = raw == null || raw.trim().lowercase() in HIDDEN

    fun title(level: CallLevel, late: Boolean, number: String): String = when {
        late && level == CallLevel.LIKELY_SCAM -> "That call from $number was likely a scam"
        late -> "That call from $number looked suspicious"
        level == CallLevel.LIKELY_SCAM -> "Likely scam call"
        else -> "Suspicious number calling"
    }

    /** Only numbers this phone already knows as scams are silenced: a fresh lookup never silences a ringing call. */
    fun silences(level: CallLevel, known: Boolean, silenceOn: Boolean) =
        silenceOn && known && level == CallLevel.LIKELY_SCAM
}
