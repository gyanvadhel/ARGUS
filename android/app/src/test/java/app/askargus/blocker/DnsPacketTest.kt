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
}
