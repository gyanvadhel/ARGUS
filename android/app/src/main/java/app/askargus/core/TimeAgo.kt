package app.askargus.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object TimeAgo {
    fun format(now: Long, at: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val minutes = (now - at).coerceAtLeast(0) / 60_000
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "$minutes min ago"
            minutes < 24 * 60 -> "${minutes / 60} h ago"
            else -> SimpleDateFormat("d MMM", Locale.ENGLISH).apply { timeZone = zone }.format(Date(at))
        }
    }
}
