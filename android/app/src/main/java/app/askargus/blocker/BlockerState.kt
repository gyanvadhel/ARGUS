package app.askargus.blocker

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * In-memory state for the scam-site blocker, shared between the VPN service and UI.
 *
 * - [hostIndex]: the current blocklist (replaced atomically on download)
 * - [allowedNames]: names the user chose to un-block (remembered on the phone)
 * - [todayBlocks]: count of blocks since midnight (for the Home card)
 */
object BlockerState {
    @Volatile
    var hostIndex: HostIndex = HostIndex.EMPTY

    /** Last successful download timestamp (epoch millis), or 0 if never. */
    @Volatile
    var lastDownloadAt: Long = 0

    private val allowedNames = ConcurrentHashMap.newKeySet<String>()
    private val todayBlocks = AtomicInteger(0)
    private val blockedToday = ConcurrentHashMap.newKeySet<String>()

    /** Number of distinct sites blocked today. */
    val blockedSitesToday: Int get() = blockedToday.size

    /** Total blocks today. */
    val blocksToday: Int get() = todayBlocks.get()

    private val lastReported = ConcurrentHashMap<String, Long>()

    fun resetDaily() {
        todayBlocks.set(0)
        blockedToday.clear()
        lastReported.clear()
    }

    /**
     * One visit to a blocked site makes several lookups (IPv4, IPv6, retries). Only the first in a minute counts, so the
     * person gets one notification and one Activity row per visit.
     */
    fun shouldReport(name: String, now: Long = System.currentTimeMillis()): Boolean {
        val key = name.lowercase().trimEnd('.')
        var report = false
        lastReported.compute(key) { _, last ->
            if (last == null || now - last >= REPORT_WINDOW_MS) { report = true; now } else last
        }
        return report
    }

    private const val REPORT_WINDOW_MS = 60_000L

    fun recordBlock(name: String) {
        todayBlocks.incrementAndGet()
        blockedToday.add(name)
    }

    fun allow(name: String) {
        allowedNames.add(name.lowercase().trimEnd('.'))
    }

    fun disallow(name: String) {
        allowedNames.remove(name.lowercase().trimEnd('.'))
    }

    fun setAllowed(names: Collection<String>) {
        allowedNames.clear()
        allowedNames.addAll(names.map { it.lowercase().trimEnd('.') })
    }

    fun isAllowed(name: String): Boolean {
        val lower = name.lowercase().trimEnd('.')
        if (allowedNames.contains(lower)) return true
        val parts = lower.split('.')
        for (i in 1 until parts.size - 1) {
            val parent = parts.subList(i, parts.size).joinToString(".")
            if (allowedNames.contains(parent)) return true
        }
        return false
    }
}
