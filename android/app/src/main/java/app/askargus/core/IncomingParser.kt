package app.askargus.core

/** What another app handed Argus: something shared to check, or a family invite link. */
sealed interface Incoming {
    data class Text(val text: String) : Incoming
    data class Image(val uri: String) : Incoming
    data class Join(val code: String) : Incoming
}

object IncomingParser {
    private val JOIN = Regex("""^https://askargus\.app/app/join/([A-Za-z0-9_-]{16,64})/?(?:[?#].*)?$""")

    fun parse(action: String?, type: String?, text: String?, subject: String?, stream: String?, data: String?): Incoming? =
        when (action) {
            "android.intent.action.SEND" ->
                if (type?.startsWith("image/") == true) stream?.let { Incoming.Image(it) }
                else ShareInput.combine(text, subject).takeIf { it.isNotEmpty() }?.let { Incoming.Text(it) }
            "android.intent.action.VIEW" -> data?.let { JOIN.find(it) }?.let { Incoming.Join(it.groupValues[1]) }
            else -> null
        }
}
