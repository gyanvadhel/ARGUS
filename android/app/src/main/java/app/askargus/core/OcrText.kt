package app.askargus.core

object OcrText {
    private val SPACES = Regex("[ \\t]+")
    private val BLANK_RUNS = Regex("\n{3,}")

    /** Drops the stray spacing and blank runs a screenshot reader leaves behind (as web/src/lib/image-read.ts). */
    fun tidy(text: String): String = text.split("\n")
        .joinToString("\n") { it.replace(SPACES, " ").trim() }
        .replace(BLANK_RUNS, "\n\n")
        .trim()
}
