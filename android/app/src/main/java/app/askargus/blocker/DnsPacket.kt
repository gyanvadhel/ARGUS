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
     * Rewrites the transaction ID to match the original query.
     */
    fun rewriteId(response: ByteArray, originalQuery: ByteArray): ByteArray {
        if (response.size < 2 || originalQuery.size < 2) return response
        val result = response.copyOf()
        result[0] = originalQuery[0]
        result[1] = originalQuery[1]
        return result
    }

    /**
     * Compute standard 16-bit one's complement Internet Checksum (RFC 1071).
     */
    fun ipv4Checksum(header: ByteArray, length: Int): Int {
        var sum = 0L
        for (i in 0 until length step 2) {
            val word = ((header[i].toInt() and 0xFF) shl 8) or
                    (if (i + 1 < length) header[i + 1].toInt() and 0xFF else 0)
            sum += word
        }
        while ((sum shr 16) != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        val cksum = sum.toInt().inv() and 0xFFFF
        return if (cksum == 0) 0xFFFF else cksum
    }

    /**
     * Compute transport layer (UDP / TCP) checksum over IPv4 or IPv6 pseudo-header.
     */
    fun transportChecksum(
        packet: ByteArray,
        ipVersion: Int,
        ipHeaderLen: Int,
        transportLen: Int,
        protocol: Int,
    ): Int {
        var sum = 0L
        if (ipVersion == 4) {
            // IPv4 pseudo-header:
            // src IP (4 bytes at 12..15), dst IP (4 bytes at 16..19)
            for (i in 12..18 step 2) {
                sum += ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
            }
            sum += protocol
            sum += transportLen
        } else {
            // IPv6 pseudo-header:
            // src IPv6 (16 bytes at 8..23), dst IPv6 (16 bytes at 24..39)
            for (i in 8..38 step 2) {
                sum += ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
            }
            sum += transportLen
            sum += protocol
        }

        // Transport header + payload (transportLen bytes starting at ipHeaderLen)
        val start = ipHeaderLen
        for (i in 0 until transportLen step 2) {
            val idx = start + i
            val word = if (i + 1 < transportLen) {
                ((packet[idx].toInt() and 0xFF) shl 8) or (packet[idx + 1].toInt() and 0xFF)
            } else {
                (packet[idx].toInt() and 0xFF) shl 8
            }
            sum += word
        }

        while ((sum shr 16) != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        val cksum = sum.toInt().inv() and 0xFFFF
        return if (cksum == 0) 0xFFFF else cksum
    }

    fun udpChecksum(packet: ByteArray, ipVersion: Int, ipHeaderLen: Int, udpLen: Int): Int =
        transportChecksum(packet, ipVersion, ipHeaderLen, udpLen, 17)

    fun tcpChecksum(packet: ByteArray, ipVersion: Int, ipHeaderLen: Int, tcpLen: Int): Int =
        transportChecksum(packet, ipVersion, ipHeaderLen, tcpLen, 6)

    /**
     * Build an IP/UDP response packet for the TUN interface.
     * Swaps src/dst IPs and ports, updates lengths, and computes valid IP and UDP checksums.
     */
    fun buildResponsePacket(
        originalPacket: ByteArray,
        ipVersion: Int,
        ipHeaderLen: Int,
        transportHeaderLen: Int,
        srcPort: Int,
        dnsPayload: ByteArray,
    ): ByteArray {
        val udpLen = transportHeaderLen + dnsPayload.size
        val totalLen = ipHeaderLen + udpLen
        val result = ByteArray(totalLen)

        // Copy IP header
        System.arraycopy(originalPacket, 0, result, 0, ipHeaderLen)

        if (ipVersion == 4) {
            // Swap src/dst IP addresses (offsets 12-15 and 16-19)
            System.arraycopy(originalPacket, 12, result, 16, 4)
            System.arraycopy(originalPacket, 16, result, 12, 4)
            // Update total length
            result[2] = ((totalLen shr 8) and 0xFF).toByte()
            result[3] = (totalLen and 0xFF).toByte()
            // Clear checksum, recalculate
            result[10] = 0; result[11] = 0
            val cksum = ipv4Checksum(result, ipHeaderLen)
            result[10] = ((cksum shr 8) and 0xFF).toByte()
            result[11] = (cksum and 0xFF).toByte()
        } else {
            // IPv6: swap src/dst (offsets 8-23 and 24-39)
            System.arraycopy(originalPacket, 8, result, 24, 16)
            System.arraycopy(originalPacket, 24, result, 8, 16)
            // Update payload length (UDP header + DNS payload)
            result[4] = ((udpLen shr 8) and 0xFF).toByte()
            result[5] = (udpLen and 0xFF).toByte()
        }

        // Build UDP header: swap ports
        val udpStart = ipHeaderLen
        result[udpStart] = 0; result[udpStart + 1] = 53 // src = 53
        result[udpStart + 2] = ((srcPort shr 8) and 0xFF).toByte()
        result[udpStart + 3] = (srcPort and 0xFF).toByte()
        result[udpStart + 4] = ((udpLen shr 8) and 0xFF).toByte()
        result[udpStart + 5] = (udpLen and 0xFF).toByte()
        result[udpStart + 6] = 0; result[udpStart + 7] = 0 // checksum placeholder

        // Copy DNS payload
        System.arraycopy(dnsPayload, 0, result, udpStart + 8, dnsPayload.size)

        // Compute UDP checksum (required for IPv6 by RFC 8200, and ensures valid checksum for IPv4)
        val udpCk = udpChecksum(result, ipVersion, ipHeaderLen, udpLen)
        result[udpStart + 6] = ((udpCk shr 8) and 0xFF).toByte()
        result[udpStart + 7] = (udpCk and 0xFF).toByte()

        return result
    }

    /**
     * Build a TCP RST packet in response to TCP connection attempts (e.g. port 53 or port 853 DoT).
     * Prevents Android resolver from stalling on Opportunistic Private DNS probes.
     */
    fun buildTcpRst(ipPacket: ByteArray, ipVersion: Int): ByteArray? {
        if (ipVersion == 4) {
            if (ipPacket.size < 40) return null
            val ihl = (ipPacket[0].toInt() and 0x0F) * 4
            val proto = ipPacket[9].toInt() and 0xFF
            if (proto != 6) return null // not TCP
            if (ipPacket.size < ihl + 20) return null

            val srcPort = ((ipPacket[ihl].toInt() and 0xFF) shl 8) or (ipPacket[ihl + 1].toInt() and 0xFF)
            val dstPort = ((ipPacket[ihl + 2].toInt() and 0xFF) shl 8) or (ipPacket[ihl + 3].toInt() and 0xFF)
            if (dstPort != 53 && dstPort != 853) return null

            val seqNum = ((ipPacket[ihl + 4].toLong() and 0xFF) shl 24) or
                    ((ipPacket[ihl + 5].toLong() and 0xFF) shl 16) or
                    ((ipPacket[ihl + 6].toLong() and 0xFF) shl 8) or
                    (ipPacket[ihl + 7].toLong() and 0xFF)
            val flags = ipPacket[ihl + 13].toInt() and 0xFF
            val isAck = (flags and 0x10) != 0

            val rstPacket = ByteArray(40)
            // IPv4 header
            rstPacket[0] = 0x45.toByte()
            rstPacket[1] = 0x00
            rstPacket[2] = 0x00; rstPacket[3] = 40
            rstPacket[4] = 0x00; rstPacket[5] = 0x00
            rstPacket[6] = 0x40; rstPacket[7] = 0x00
            rstPacket[8] = 64
            rstPacket[9] = 6
            // Swap IP
            System.arraycopy(ipPacket, 16, rstPacket, 12, 4)
            System.arraycopy(ipPacket, 12, rstPacket, 16, 4)
            val ipCk = ipv4Checksum(rstPacket, 20)
            rstPacket[10] = ((ipCk shr 8) and 0xFF).toByte()
            rstPacket[11] = (ipCk and 0xFF).toByte()

            // TCP header
            rstPacket[20] = ((dstPort shr 8) and 0xFF).toByte()
            rstPacket[21] = (dstPort and 0xFF).toByte()
            rstPacket[22] = ((srcPort shr 8) and 0xFF).toByte()
            rstPacket[23] = (srcPort and 0xFF).toByte()

            if (isAck) {
                val ackNum = ((ipPacket[ihl + 8].toLong() and 0xFF) shl 24) or
                        ((ipPacket[ihl + 9].toLong() and 0xFF) shl 16) or
                        ((ipPacket[ihl + 10].toLong() and 0xFF) shl 8) or
                        (ipPacket[ihl + 11].toLong() and 0xFF)
                rstPacket[24] = ((ackNum shr 24) and 0xFF).toByte()
                rstPacket[25] = ((ackNum shr 16) and 0xFF).toByte()
                rstPacket[26] = ((ackNum shr 8) and 0xFF).toByte()
                rstPacket[27] = (ackNum and 0xFF).toByte()
                rstPacket[33] = 0x04.toByte() // RST
            } else {
                val nextAck = (seqNum + 1) and 0xFFFFFFFFL
                rstPacket[28] = ((nextAck shr 24) and 0xFF).toByte()
                rstPacket[29] = ((nextAck shr 16) and 0xFF).toByte()
                rstPacket[30] = ((nextAck shr 8) and 0xFF).toByte()
                rstPacket[31] = (nextAck and 0xFF).toByte()
                rstPacket[33] = 0x14.toByte() // RST | ACK
            }
            rstPacket[32] = 0x50.toByte()
            val tcpCk = tcpChecksum(rstPacket, 4, 20, 20)
            rstPacket[36] = ((tcpCk shr 8) and 0xFF).toByte()
            rstPacket[37] = (tcpCk and 0xFF).toByte()
            return rstPacket
        } else if (ipVersion == 6) {
            if (ipPacket.size < 60) return null
            val proto = ipPacket[6].toInt() and 0xFF
            if (proto != 6) return null
            val srcPort = ((ipPacket[40].toInt() and 0xFF) shl 8) or (ipPacket[41].toInt() and 0xFF)
            val dstPort = ((ipPacket[42].toInt() and 0xFF) shl 8) or (ipPacket[43].toInt() and 0xFF)
            if (dstPort != 53 && dstPort != 853) return null

            val seqNum = ((ipPacket[44].toLong() and 0xFF) shl 24) or
                    ((ipPacket[45].toLong() and 0xFF) shl 16) or
                    ((ipPacket[46].toLong() and 0xFF) shl 8) or
                    (ipPacket[47].toLong() and 0xFF)
            val flags = ipPacket[53].toInt() and 0xFF
            val isAck = (flags and 0x10) != 0

            val rstPacket = ByteArray(60)
            rstPacket[0] = 0x60.toByte()
            rstPacket[4] = 0x00; rstPacket[5] = 20
            rstPacket[6] = 6
            rstPacket[7] = 64
            // Swap IPv6
            System.arraycopy(ipPacket, 24, rstPacket, 8, 16)
            System.arraycopy(ipPacket, 8, rstPacket, 24, 16)

            // TCP header at offset 40
            rstPacket[40] = ((dstPort shr 8) and 0xFF).toByte()
            rstPacket[41] = (dstPort and 0xFF).toByte()
            rstPacket[42] = ((srcPort shr 8) and 0xFF).toByte()
            rstPacket[43] = (srcPort and 0xFF).toByte()

            if (isAck) {
                val ackNum = ((ipPacket[48].toLong() and 0xFF) shl 24) or
                        ((ipPacket[49].toLong() and 0xFF) shl 16) or
                        ((ipPacket[50].toLong() and 0xFF) shl 8) or
                        (ipPacket[51].toLong() and 0xFF)
                rstPacket[44] = ((ackNum shr 24) and 0xFF).toByte()
                rstPacket[45] = ((ackNum shr 16) and 0xFF).toByte()
                rstPacket[46] = ((ackNum shr 8) and 0xFF).toByte()
                rstPacket[47] = (ackNum and 0xFF).toByte()
                rstPacket[53] = 0x04.toByte()
            } else {
                val nextAck = (seqNum + 1) and 0xFFFFFFFFL
                rstPacket[48] = ((nextAck shr 24) and 0xFF).toByte()
                rstPacket[49] = ((nextAck shr 16) and 0xFF).toByte()
                rstPacket[50] = ((nextAck shr 8) and 0xFF).toByte()
                rstPacket[51] = (nextAck and 0xFF).toByte()
                rstPacket[53] = 0x14.toByte()
            }
            rstPacket[52] = 0x50.toByte()
            val tcpCk = tcpChecksum(rstPacket, 6, 40, 20)
            rstPacket[56] = ((tcpCk shr 8) and 0xFF).toByte()
            rstPacket[57] = (tcpCk and 0xFF).toByte()
            return rstPacket
        }
        return null
    }
}
