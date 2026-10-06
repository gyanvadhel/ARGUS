package app.askargus.calls

enum class CallLevel { LIKELY_SCAM, SUSPICIOUS, NONE }

/** The rules for what a call result means for the person, with no Android in them. */
object CallPolicy {
    // Countries whose national numbers the dialer may hand over without a "+": calling code and national length.
    // Kept the same as cleanNumber in web/src/lib/app-phone.ts, so the phone's lists and the server agree.
    private val COUNTRIES = mapOf("IN" to ("91" to 10), "US" to ("1" to 10), "CA" to ("1" to 10), "GB" to ("44" to 10))

    /** "+digits" for a number the dialer handed over, or null when it can't be sure which number it is. */
    fun e164(raw: String, country: String?): String? {
        val text = raw.trim()
        val digits = text.filter { it.isDigit() }
        val e164 = when {
            text.startsWith("+") -> "+$digits"
            digits.startsWith("00") -> "+${digits.drop(2)}"
            else -> {
                val (code, length) = COUNTRIES[country?.uppercase()] ?: return null
                val national = digits.trimStart('0')
                if (national.length == code.length + length && national.startsWith(code)) "+$national" else "+$code$national"
            }
        }
        return e164.takeIf { Regex("""^\+[1-9]\d{7,14}$""").matches(it) }
    }

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
