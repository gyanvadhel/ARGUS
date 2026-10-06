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

    fun resetDaily() {
        todayBlocks.set(0)
        blockedToday.clear()
    }

    fun recordBlock(name: String) {
        todayBlocks.incrementAndGet()
        blockedToday.add(name)
    }

    fun allow(name: String) {
        allowedNames.add(name.lowercase().trimEnd('.'))
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
