package app.askargus.blocker

import java.nio.ByteBuffer

/**
 * Minimal DNS packet parsing — enough to read queries and build NXDOMAIN replies.
 *
 * Only parses the question section (which is all we need to extract the queried name
 * and build a reply). Ignores record data.
 */
object DnsPacket {

    /**
     * Parse the queried domain name from a DNS query packet.
     * Returns null if the packet is malformed.
     */
    fun parseName(packet: ByteArray): String? {
        if (packet.size < 12) return null // too short for a header
        val buf = ByteBuffer.wrap(packet)
        // Skip: ID(2) + flags(2) + QDCOUNT(2) + ANCOUNT(2) + NSCOUNT(2) + ARCOUNT(2) = 12
        buf.position(12)
        return readName(buf)
    }

    /**
     * Read a DNS name from the buffer at the current position.
     * Handles label sequences (not compression in queries — queries don't use it).
     */
    private fun readName(buf: ByteBuffer): String? {
        val parts = mutableListOf<String>()
        while (buf.hasRemaining()) {
            val len = buf.get().toInt() and 0xFF
            if (len == 0) break // end of name
            if (len >= 0xC0) return null // compression pointer — unexpected in a query
            if (buf.remaining() < len) return null
            val label = ByteArray(len)
            buf.get(label)
            parts.add(String(label, Charsets.US_ASCII))
        }
        return if (parts.isEmpty()) null else parts.joinToString(".").lowercase()
    }

    /**
     * Parse the query type (QTYPE) from a DNS query packet.
     * Returns the QTYPE value, or -1 if the packet is malformed.
     */
    fun parseType(packet: ByteArray): Int {
        if (packet.size < 12) return -1
        val buf = ByteBuffer.wrap(packet)
        buf.position(12)
        // Skip the name
        while (buf.hasRemaining()) {
            val len = buf.get().toInt() and 0xFF
            if (len == 0) break
            if (len >= 0xC0) return -1
            if (buf.remaining() < len) return -1
            buf.position(buf.position() + len)
        }
        if (buf.remaining() < 2) return -1
        return buf.short.toInt() and 0xFFFF
    }

    /**
     * Build an NXDOMAIN response for the given query.
     * Copies the question section and sets RCODE=3 (NXDOMAIN), QR=1, RA=1.
     */
    fun nxdomain(query: ByteArray): ByteArray {
        if (query.size < 12) return query
        val response = query.copyOf()
        val buf = ByteBuffer.wrap(response)
        // Set QR=1 (response, 0x8000), keep opcode and RD, set RA=1 (0x0080), set RCODE=3 (NXDOMAIN)
        val flags = buf.getShort(2).toInt() and 0xFFFF
        val newFlags = (flags or 0x8080) and 0xFFF0 or 0x0003
        buf.putShort(2, newFlags.toShort())
        // Zero out ANCOUNT, NSCOUNT, ARCOUNT
        buf.putShort(6, 0.toShort())
        buf.putShort(8, 0.toShort())
        buf.putShort(10, 0.toShort())
        return response
    }

    /**
     * Build a success response that forwards to the caller.
     * Used to pass through the response from the real DNS server.
     * Just wraps the raw response bytes — no transformation needed.
     */
    fun rewriteId(response: ByteArray, originalQuery: ByteArray): ByteArray {
        if (response.size < 2 || originalQuery.size < 2) return response
        val result = response.copyOf()
        // Copy the transaction ID from the original query
        result[0] = originalQuery[0]
        result[1] = originalQuery[1]
        return result
    }
}
