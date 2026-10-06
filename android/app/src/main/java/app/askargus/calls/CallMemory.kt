package app.askargus.calls

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

interface KeyValueStore {
    suspend fun get(key: String): String?
    suspend fun put(key: String, value: String)
    suspend fun update(key: String, transform: (String?) -> String?): String? {
        val old = get(key)
        val new = transform(old)
        if (new != null) put(key, new)
        return new
    }
}

/** What this phone remembers about numbers: the daily scam list, its own recent verdicts (7 days), the numbers the
 *  person said are fine, and who it just warned about. All on the phone. */
class CallMemory(private val store: KeyValueStore, private val now: () -> Long = System::currentTimeMillis) {
    private val strings = MapSerializer(String.serializer(), String.serializer())
    private val longs = MapSerializer(String.serializer(), Long.serializer())

    @Volatile private var cachedKnownRaw: String? = null
    @Volatile private var cachedKnownMap: Map<String, String>? = null

    private suspend fun stringsOf(key: String): Map<String, String> {
        val raw = store.get(key) ?: return emptyMap()
        if (key == KNOWN) {
            val cachedRaw = cachedKnownRaw
            val cachedMap = cachedKnownMap
            if (cachedRaw != null && cachedMap != null && cachedRaw == raw) {
                return cachedMap
            }
            val parsed = runCatching { Json.decodeFromString(strings, raw) }.getOrNull() ?: emptyMap()
            cachedKnownRaw = raw
            cachedKnownMap = parsed
            return parsed
        }
        return runCatching { Json.decodeFromString(strings, raw) }.getOrNull() ?: emptyMap()
    }
    private suspend fun longsOf(key: String) = store.get(key)?.let { runCatching { Json.decodeFromString(longs, it) }.getOrNull() } ?: emptyMap()

    suspend fun setKnown(list: Map<String, String>) {
        val raw = Json.encodeToString(strings, list)
        cachedKnownRaw = raw
        cachedKnownMap = list
        store.put(KNOWN, raw)
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
    suspend fun unmarkNotScam(number: String) {
        val current = stringsOf(NOT_SCAM)
        if (number in current) {
            store.put(NOT_SCAM, Json.encodeToString(strings, current - number))
        }
    }
    suspend fun isNotScam(number: String) = number in stringsOf(NOT_SCAM)

    /** True the first time a number rings in two minutes; repeat rings don't warn or look up again.
     *  Uses an atomic update to avoid race conditions when multiple rings happen at once. */
    suspend fun shouldWarn(number: String): Boolean {
        var warned = false
        store.update(WARNED) { raw ->
            val existing = raw?.let { runCatching { Json.decodeFromString(longs, it) }.getOrNull() } ?: emptyMap()
            val recent = existing.filterValues { now() - it < DEDUPE }
            if (number in recent) {
                warned = false
                raw
            } else {
                warned = true
                Json.encodeToString(longs, recent + (number to now()))
            }
        }
        return warned
    }

    private companion object {
        const val KNOWN = "calls.known"; const val KNOWN_AT = "calls.knownAt"; const val SEEN = "calls.seen"
        const val NOT_SCAM = "calls.notScam"; const val WARNED = "calls.warned"
        const val WEEK = 7L * 24 * 60 * 60 * 1000; const val DEDUPE = 2L * 60 * 1000
    }
}
