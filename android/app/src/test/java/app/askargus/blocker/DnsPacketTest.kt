package app.askargus.blocker

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.nio.ByteBuffer

class DnsPacketTest {

    private fun buildSampleQuery(name: String, qtype: Int = 1, txId: Short = 0x1234.toShort()): ByteArray {
        val parts = name.split(".")
        val nameBytes = mutableListOf<Byte>()
        for (part in parts) {
            val b = part.toByteArray(Charsets.US_ASCII)
            nameBytes.add(b.size.toByte())
            for (byte in b) nameBytes.add(byte)
        }
        nameBytes.add(0.toByte()) // root null byte

        val totalLen = 12 + nameBytes.size + 4
        val buf = ByteBuffer.allocate(totalLen)
        buf.putShort(txId)
        buf.putShort(0x0100.toShort()) // RD = 1, standard query
        buf.putShort(1.toShort())      // QDCOUNT = 1
        buf.putShort(0.toShort())      // ANCOUNT = 0
        buf.putShort(0.toShort())      // NSCOUNT = 0
        buf.putShort(0.toShort())      // ARCOUNT = 0
        for (b in nameBytes) buf.put(b)
        buf.putShort(qtype.toShort())  // QTYPE
        buf.putShort(1.toShort())      // QCLASS = IN (1)
        return buf.array()
    }

    @Test
    fun parseNameExtractsDomain() {
        val query = buildSampleQuery("evil.example.com")
        val parsed = DnsPacket.parseName(query)
        assertEquals("evil.example.com", parsed)
    }

    @Test
    fun parseTypeExtractsQtype() {
        val queryA = buildSampleQuery("test.org", qtype = 1)
        assertEquals(1, DnsPacket.parseType(queryA))

        val queryAaaa = buildSampleQuery("test.org", qtype = 28)
        assertEquals(28, DnsPacket.parseType(queryAaaa))
    }

    @Test
    fun nxdomainBuildsValidNxdomainReply() {
        val query = buildSampleQuery("phish.evil.com", txId = 0x5678.toShort())
        val reply = DnsPacket.nxdomain(query)

        assertEquals(query.size, reply.size)
        val buf = ByteBuffer.wrap(reply)
        assertEquals(0x5678.toShort(), buf.short) // Transaction ID preserved

        val flags = buf.short.toInt() and 0xFFFF
        // Check QR flag (bit 15) is 1 (response)
        assertEquals(0x8000, flags and 0x8000)
        // Check RA flag (bit 7) is 1 (recursion available)
        assertEquals(0x0080, flags and 0x0080)
        // Check RCODE (lower 4 bits) is 3 (NXDOMAIN)
        assertEquals(3, flags and 0x000F)

        // QDCOUNT should be 1
        assertEquals(1.toShort(), buf.short)
        // ANCOUNT, NSCOUNT, ARCOUNT should be 0
        assertEquals(0.toShort(), buf.short)
        assertEquals(0.toShort(), buf.short)
        assertEquals(0.toShort(), buf.short)

        // Question section name should match original
        assertEquals("phish.evil.com", DnsPacket.parseName(reply))
    }

    @Test
    fun rewriteIdCopiesOriginalTxId() {
        val original = buildSampleQuery("example.com", txId = 0xABCD.toShort())
        val incomingReply = buildSampleQuery("example.com", txId = 0x1111.toShort())

        val rewritten = DnsPacket.rewriteId(incomingReply, original)
        val buf = ByteBuffer.wrap(rewritten)
        assertEquals(0xABCD.toShort(), buf.short)
    }

    @Test
    fun buildResponsePacketIpv4ComputesValidChecksumsAndSwapsEndpoints() {
        val queryDns = buildSampleQuery("google.com", txId = 0x1234.toShort())
        val totalUdpLen = 8 + queryDns.size
        val totalIpLen = 20 + totalUdpLen
        val reqPacket = ByteArray(totalIpLen)

        // Mock IPv4 header
        reqPacket[0] = 0x45.toByte()
        reqPacket[2] = ((totalIpLen shr 8) and 0xFF).toByte()
        reqPacket[3] = (totalIpLen and 0xFF).toByte()
        reqPacket[9] = 17 // UDP
        // Src IP: 10.111.222.1
        reqPacket[12] = 10; reqPacket[13] = 111.toByte(); reqPacket[14] = 222.toByte(); reqPacket[15] = 1
        // Dst IP: 10.111.222.53
        reqPacket[16] = 10; reqPacket[17] = 111.toByte(); reqPacket[18] = 222.toByte(); reqPacket[19] = 53

        // UDP header
        reqPacket[20] = (54321 shr 8).toByte(); reqPacket[21] = (54321 and 0xFF).toByte() // src port
        reqPacket[22] = 0; reqPacket[23] = 53 // dst port
        reqPacket[24] = ((totalUdpLen shr 8) and 0xFF).toByte()
        reqPacket[25] = (totalUdpLen and 0xFF).toByte()
        System.arraycopy(queryDns, 0, reqPacket, 28, queryDns.size)

        val replyDns = DnsPacket.nxdomain(queryDns)
        val respPacket = DnsPacket.buildResponsePacket(
            reqPacket, ipVersion = 4, ipHeaderLen = 20, transportHeaderLen = 8,
            srcPort = 54321, dnsPayload = replyDns,
        )

        // Verify IPs are swapped
        assertEquals(10.toByte(), respPacket[12])
        assertEquals(111.toByte(), respPacket[13])
        assertEquals(222.toByte(), respPacket[14])
        assertEquals(53.toByte(), respPacket[15]) // now src = 10.111.222.53

        assertEquals(10.toByte(), respPacket[16])
        assertEquals(111.toByte(), respPacket[17])
        assertEquals(222.toByte(), respPacket[18])
        assertEquals(1.toByte(), respPacket[19]) // now dst = 10.111.222.1

        // Verify ports are swapped
        val respSrcPort = ((respPacket[20].toInt() and 0xFF) shl 8) or (respPacket[21].toInt() and 0xFF)
        val respDstPort = ((respPacket[22].toInt() and 0xFF) shl 8) or (respPacket[23].toInt() and 0xFF)
        assertEquals(53, respSrcPort)
        assertEquals(54321, respDstPort)

        // Verify IPv4 header checksum is non-zero
        val ipCksum = ((respPacket[10].toInt() and 0xFF) shl 8) or (respPacket[11].toInt() and 0xFF)
        org.junit.Assert.assertNotEquals(0, ipCksum)

        // Verify UDP checksum is non-zero
        val udpCksum = ((respPacket[26].toInt() and 0xFF) shl 8) or (respPacket[27].toInt() and 0xFF)
        org.junit.Assert.assertNotEquals(0, udpCksum)
    }

    @Test
    fun buildResponsePacketIpv6ComputesNonZeroUdpChecksum() {
        val queryDns = buildSampleQuery("google.com", txId = 0x1234.toShort())
        val reqPacket = ByteArray(40 + 8 + queryDns.size)
        reqPacket[0] = 0x60.toByte() // IPv6
        reqPacket[6] = 17 // UDP

        // Src IPv6: fd00:a7:5::1
        reqPacket[8] = 0xfd.toByte(); reqPacket[23] = 1
        // Dst IPv6: fd00:a7:5::53
        reqPacket[24] = 0xfd.toByte(); reqPacket[39] = 53

        val replyDns = DnsPacket.nxdomain(queryDns)
        val respPacket = DnsPacket.buildResponsePacket(
            reqPacket, ipVersion = 6, ipHeaderLen = 40, transportHeaderLen = 8,
            srcPort = 44556, dnsPayload = replyDns,
        )

        // Verify IPv6 IPs are swapped
        assertEquals(53.toByte(), respPacket[23]) // src is now ::53
        assertEquals(1.toByte(), respPacket[39])  // dst is now ::1

        // Verify UDP checksum is NON-ZERO (mandatory for IPv6)
        val udpCksum = ((respPacket[46].toInt() and 0xFF) shl 8) or (respPacket[47].toInt() and 0xFF)
        org.junit.Assert.assertNotEquals(0, udpCksum)
    }

    @Test
    fun buildTcpRstIpv4RespondsToSynWithRstAck() {
        val synPacket = ByteArray(40)
        synPacket[0] = 0x45.toByte() // IPv4, IHL = 5
        synPacket[9] = 6 // TCP
        // Src IP: 10.111.222.1
        synPacket[12] = 10; synPacket[13] = 111.toByte(); synPacket[14] = 222.toByte(); synPacket[15] = 1
        // Dst IP: 10.111.222.53
        synPacket[16] = 10; synPacket[17] = 111.toByte(); synPacket[18] = 222.toByte(); synPacket[19] = 53

        // TCP header
        synPacket[20] = (60000 shr 8).toByte(); synPacket[21] = (60000 and 0xFF).toByte() // src port
        synPacket[22] = (853 shr 8).toByte(); synPacket[23] = (853 and 0xFF).toByte() // dst port 853 (DoT probe)
        synPacket[24] = 0; synPacket[25] = 0; synPacket[26] = 1; synPacket[27] = 0 // SEQ = 256
        synPacket[32] = 0x50.toByte() // Offset = 5
        synPacket[33] = 0x02.toByte() // SYN flag

        val rst = DnsPacket.buildTcpRst(synPacket, 4)
        assertNotNull(rst)
        assertEquals(40, rst!!.size)

        // Verify ports swapped
        val rstSrcPort = ((rst[20].toInt() and 0xFF) shl 8) or (rst[21].toInt() and 0xFF)
        val rstDstPort = ((rst[22].toInt() and 0xFF) shl 8) or (rst[23].toInt() and 0xFF)
        assertEquals(853, rstSrcPort)
        assertEquals(60000, rstDstPort)

        // Verify RST|ACK flags (0x14)
        assertEquals(0x14.toByte(), rst[33])

        // Verify ACK number is incoming SEQ + 1 = 257
        val ackNum = ((rst[28].toLong() and 0xFF) shl 24) or
                ((rst[29].toLong() and 0xFF) shl 16) or
                ((rst[30].toLong() and 0xFF) shl 8) or
                (rst[31].toLong() and 0xFF)
        assertEquals(257L, ackNum)
    }
}
