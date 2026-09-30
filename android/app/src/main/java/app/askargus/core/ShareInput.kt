package app.askargus.core

object ShareInput {
    const val MAX_LENGTH = 20_000

    /** What another app shared, as one thing to check: its text, or the subject when there's no text. */
    fun combine(text: String?, subject: String?): String =
        (text?.trim().orEmpty().ifEmpty { subject?.trim().orEmpty() }).take(MAX_LENGTH)
}
