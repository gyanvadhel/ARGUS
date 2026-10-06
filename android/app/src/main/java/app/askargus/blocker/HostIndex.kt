package app.askargus.blocker

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader

/**
 * A compact, sorted array of 64-bit hashes for fast hostname lookup.
 *
 * Each hostname is hashed with a 64-bit FNV-1a; lookups use binary search.
 * A name is blocked if it or any parent domain is on the list.
 */
class HostIndex private constructor(private val hashes: LongArray) {

    val size: Int get() = hashes.size

    /** True if this exact name is in the index. */
    fun contains(name: String): Boolean =
        hashes.binarySearch(hash(name)) >= 0

    /**
     * True if [name] or any of its parent domains is on the list.
     * Example: if "evil.example" is listed, "a.b.evil.example" matches too;
     * "notevil.example" does not.
     */
    fun blocked(name: String): Boolean {
        val lower = name.lowercase().trimEnd('.')
        if (contains(lower)) return true
        val parts = lower.split('.')
        for (i in 1 until parts.size - 1) {
            val parent = parts.subList(i, parts.size).joinToString(".")
            if (contains(parent)) return true
        }
        return false
    }

    companion object {
        /** The empty index blocks nothing. */
        val EMPTY = HostIndex(LongArray(0))

        /** Build from a plain-text stream (one hostname per line, no comments). */
        fun fromStream(input: InputStream): HostIndex {
            val names = BufferedReader(InputStreamReader(input, Charsets.UTF_8))
                .lineSequence()
                .map { it.trim().lowercase().trimEnd('.') }
                .filter { it.isNotEmpty() }
                .toList()
            val sorted = LongArray(names.size) { hash(names[it]) }
            sorted.sort()
            return HostIndex(sorted)
        }

        /** FNV-1a 64-bit hash of a lowercase hostname. */
        fun hash(name: String): Long {
            val clean = name.lowercase().trimEnd('.')
            var h = -0x340d631b7bdddcdbL // 14695981039346656037 as signed
            for (b in clean.encodeToByteArray()) {
                h = h xor b.toLong()
                h *= 0x100000001b3L
            }
            return h
        }
    }
}
