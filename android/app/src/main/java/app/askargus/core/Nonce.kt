package app.askargus.core

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Google sign-in nonces: Google gets the SHA-256 hex, Supabase gets the raw value. */
object Nonce {
    private val random = SecureRandom()

    fun raw(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun sha256Hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
