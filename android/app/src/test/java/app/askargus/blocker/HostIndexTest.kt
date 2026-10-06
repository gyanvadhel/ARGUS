package app.askargus.blocker

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

class HostIndexTest {

    @Test
    fun emptyIndexBlocksNothing() {
        assertFalse(HostIndex.EMPTY.blocked("evil.example"))
        assertFalse(HostIndex.EMPTY.contains("evil.example"))
    }

    @Test
    fun exactMatchIsBlocked() {
        val stream = "evil.example\nphish.net\n".byteInputStream()
        val index = HostIndex.fromStream(stream)

        assertTrue(index.contains("evil.example"))
        assertTrue(index.blocked("evil.example"))
        assertTrue(index.contains("phish.net"))
        assertTrue(index.blocked("phish.net"))
        assertFalse(index.blocked("safe.org"))
    }

    @Test
    fun subdomainsAreBlockedByParent() {
        val stream = "evil.example\n".byteInputStream()
        val index = HostIndex.fromStream(stream)

        assertTrue(index.blocked("evil.example"))
        assertTrue(index.blocked("sub.evil.example"))
        assertTrue(index.blocked("deep.nested.sub.evil.example"))
    }

    @Test
    fun siblingOrPrefixDomainsAreNotBlocked() {
        val stream = "evil.example\n".byteInputStream()
        val index = HostIndex.fromStream(stream)

        assertFalse(index.blocked("notevil.example"))
        assertFalse(index.blocked("evil.example.org"))
        assertFalse(index.blocked("example"))
    }

    @Test
    fun caseInsensitiveMatching() {
        val stream = "Evil.Example\n".byteInputStream()
        val index = HostIndex.fromStream(stream)

        assertTrue(index.contains("evil.example"))
        assertTrue(index.contains("EVIL.EXAMPLE"))
        assertTrue(index.blocked("SUB.EVIL.EXAMPLE"))
    }

    @Test
    fun trailingDotsAreHandled() {
        val stream = "evil.example.\n".byteInputStream()
        val index = HostIndex.fromStream(stream)

        assertTrue(index.contains("evil.example"))
        assertTrue(index.blocked("evil.example."))
        assertTrue(index.blocked("sub.evil.example."))
    }
}
