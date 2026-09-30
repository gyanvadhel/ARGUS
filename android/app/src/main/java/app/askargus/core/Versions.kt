package app.askargus.core

object Versions {
    /** True when `candidate` ("0.2.0" or a tag like "android-v0.2.0") is newer than `current`. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = parts(candidate)
        val b = parts(current)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun parts(version: String) =
        version.substringAfterLast('v').split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
}
