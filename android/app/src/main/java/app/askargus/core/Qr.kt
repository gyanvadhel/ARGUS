package app.askargus.core

import java.net.URLDecoder

/** What a QR code holds, sorted by where it goes (a port of web/src/lib/qr.ts): UPI codes get their own warning,
 *  links a link check, numbers a phone check, anything else a text check. */
sealed interface QrPayload {
    data class Upi(val mandate: Boolean, val payee: String, val name: String?, val amount: String?, val note: String?) : QrPayload
    data class Url(val url: String) : QrPayload
    data class Phone(val number: String) : QrPayload
    data class Text(val text: String) : QrPayload
}

object Qr {
    private val UPI = Regex("""^upi://(pay|mandate)\b[^?]*\?(.*)$""", RegexOption.IGNORE_CASE)
    private val WWW = Regex("""^www\.\S+$""", RegexOption.IGNORE_CASE)
    private val TEL = Regex("""^tel:([+\d][\d\s()-]*)$""", RegexOption.IGNORE_CASE)
    private val SMS = Regex("""^smsto:([^:]*):([\s\S]*)$""", RegexOption.IGNORE_CASE)
    private val PHONE_JUNK = Regex("""[\s()-]""")

    fun parse(value: String): QrPayload {
        val raw = value.trim()
        upi(raw)?.let { return it }
        if (raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true)) return QrPayload.Url(raw)
        if (WWW.matches(raw)) return QrPayload.Url("https://$raw")
        TEL.find(raw)?.let { return QrPayload.Phone(it.groupValues[1].replace(PHONE_JUNK, "")) }
        SMS.find(raw)?.let { m ->
            return QrPayload.Text(listOf(m.groupValues[2].trim(), m.groupValues[1].trim()).filter { it.isNotEmpty() }.joinToString("\n"))
        }
        return QrPayload.Text(raw)
    }

    private fun upi(raw: String): QrPayload.Upi? {
        val m = UPI.find(raw) ?: return null
        val params = queryParams(m.groupValues[2])
        val payee = params["pa"]?.trim().orEmpty()
        if (payee.isEmpty()) return null
        fun field(key: String) = params[key]?.trim()?.ifEmpty { null }
        return QrPayload.Upi(m.groupValues[1].equals("mandate", ignoreCase = true), payee, field("pn"), field("am"), field("tn"))
    }

    /** Like URLSearchParams: "+" is a space, %XX is decoded (left as is when malformed), the first value wins. */
    private fun queryParams(query: String): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for (part in query.split('&')) {
            if (part.isEmpty()) continue
            val i = part.indexOf('=')
            val key = decode(if (i >= 0) part.substring(0, i) else part)
            if (key !in out) out[key] = decode(if (i >= 0) part.substring(i + 1) else "")
        }
        return out
    }

    private fun decode(s: String): String = try {
        URLDecoder.decode(s, "UTF-8")
    } catch (e: IllegalArgumentException) {
        s
    }
}
