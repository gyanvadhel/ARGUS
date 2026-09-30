package app.askargus.ui.theme

import androidx.compose.ui.graphics.Color
import app.askargus.core.Risk

/** The website's tokens (web/src/app/globals.css). */
object ArgusColors {
    val Background = Color(0xFF08080A)
    val Card = Color(0xFF0E0E11)
    val Muted = Color(0xFF131316)
    val Accent = Color(0xFF1B1B20)
    val Foreground = Color(0xFFECE6DC)
    val MutedText = Color(0xFF8F8B93)
    val Border = Color(0x1AECE6DC)
    val Input = Color(0x29ECE6DC)
    val OnPrimary = Color(0xFF0B0B0D)
    val Safe = Color(0xFF5ED3B0)
    val Clear = Color(0xFF9CB8B0)
    val Low = Color(0xFFF5C451)
    val Sus = Color(0xFFFF9F4D)
    val High = Color(0xFFFF5D6C)
    val Unknown = Color(0xFF8F8B93)
    val IrisA = Color(0xFF6D6BFF)
    val IrisB = Color(0xFFA66BFF)
    val IrisC = Color(0xFFFF8A7A)

    fun risk(risk: Risk): Color = when (risk) {
        Risk.SAFE -> Safe
        Risk.CLEAR -> Clear
        Risk.LOW -> Low
        Risk.SUSPICIOUS -> Sus
        Risk.HIGH -> High
        Risk.UNKNOWN -> Unknown
    }
}
