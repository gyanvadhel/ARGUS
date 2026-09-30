package app.askargus.core

object Links {
    private val LINK = Regex("""(?i)\b(?:https?://|www\.)[^\s<>"']+""")

    /** The first link in some copied text, without trailing sentence punctuation, or null. */
    fun first(text: String): String? = LINK.find(text)?.value?.trimEnd('.', ',', ')', ']', '!', '?', ';', ':', '"', '\'')
}
