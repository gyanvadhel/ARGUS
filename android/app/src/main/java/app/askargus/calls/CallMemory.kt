package app.askargus.calls

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

interface KeyValueStore {
    suspend fun get(key: String): String?
    suspend fun put(key: String, value: String)
}

/** What this phone remembers about numbers: the daily scam list, its own recent verdicts (7 days), the numbers the
 *  person said are fine, and who it just warned about. All on the phone. */
class CallMemory(private val store: KeyValueStore, private val now: () -> Long = System::currentTimeMillis) {
    private val strings = MapSerializer(String.serializer(), String.serializer())
    private val longs = MapSerializer(String.serializer(), Long.serializer())

    private suspend fun stringsOf(key: String) = store.get(key)?.let { runCatching { Json.decodeFromString(strings, it) }.getOrNull() } ?: emptyMap()
    private suspend fun longsOf(key: String) = store.get(key)?.let { runCatching { Json.decodeFromString(longs, it) }.getOrNull() } ?: emptyMap()

    suspend fun setKnown(list: Map<String, String>) {
        store.put(KNOWN, Json.encodeToString(strings, list))
        store.put(KNOWN_AT, now().toString())
    }
    suspend fun knownScamLabel(number: String): String? = stringsOf(KNOWN)[number]
    suspend fun knownAt(): Long? = store.get(KNOWN_AT)?.toLongOrNull()

    suspend fun remember(number: String, score: Int) {
        val cutoff = now() - WEEK
        val kept = stringsOf(SEEN).filterValues { (it.substringBefore(':').toLongOrNull() ?: 0) >= cutoff }
        store.put(SEEN, Json.encodeToString(strings, kept + (number to "${now()}:$score")))
    }
    suspend fun recentScore(number: String): Int? {
        val (at, score) = stringsOf(SEEN)[number]?.split(':')?.takeIf { it.size == 2 } ?: return null
        return if (now() - (at.toLongOrNull() ?: return null) <= WEEK) score.toIntOrNull() else null
    }

    suspend fun markNotScam(number: String) {
        store.put(NOT_SCAM, Json.encodeToString(strings, stringsOf(NOT_SCAM) + (number to "1")))
    }
    suspend fun isNotScam(number: String) = number in stringsOf(NOT_SCAM)

    /** True the first time a number rings in two minutes; repeat rings don't warn or look up again. */
    suspend fun shouldWarn(number: String): Boolean {
        val recent = longsOf(WARNED).filterValues { now() - it < DEDUPE }
        if (number in recent) return false
        store.put(WARNED, Json.encodeToString(longs, recent + (number to now())))
        return true
    }

    private companion object {
        const val KNOWN = "calls.known"; const val KNOWN_AT = "calls.knownAt"; const val SEEN = "calls.seen"
        const val NOT_SCAM = "calls.notScam"; const val WARNED = "calls.warned"
        const val WEEK = 7L * 24 * 60 * 60 * 1000; const val DEDUPE = 2L * 60 * 1000
    }
}
