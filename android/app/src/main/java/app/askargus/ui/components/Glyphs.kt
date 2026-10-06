package app.askargus.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

/** Small line drawings for Home's quick actions. Drawn here rather than pulling in the multi-megabyte icon set. */
enum class Glyph { QR, IMAGE, LINK, MESSAGE }

@Composable
fun GlyphIcon(glyph: Glyph, modifier: Modifier = Modifier, size: Dp = 26.dp, color: Color = ArgusColors.Foreground) {
    Canvas(modifier.size(size)) {
        val u = this.size.minDimension / 24f // draw on a 24-unit grid
        val line = Stroke(width = 1.8f * u, cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (glyph) {
            Glyph.QR -> qr(u, color, line)
            Glyph.IMAGE -> image(u, color, line)
            Glyph.LINK -> link(u, color, line)
            Glyph.MESSAGE -> message(u, color, line)
        }
    }
}

private fun DrawScope.box(x: Float, y: Float, w: Float, h: Float, r: Float, color: Color, style: Stroke) =
    drawRoundRect(color, Offset(x, y), Size(w, h), CornerRadius(r, r), style = style)

private fun DrawScope.qr(u: Float, c: Color, s: Stroke) {
    for ((x, y) in listOf(3f to 3f, 14f to 3f, 3f to 14f)) {
        box(x * u, y * u, 7 * u, 7 * u, 1.5f * u, c, s)
        drawRect(c, Offset((x + 2.6f) * u, (y + 2.6f) * u), Size(1.8f * u, 1.8f * u))
    }
    for ((x, y) in listOf(14f to 14f, 18.5f to 14f, 16.2f to 16.8f, 14f to 19.5f, 18.5f to 19.5f)) {
        drawRect(c, Offset(x * u, y * u), Size(2f * u, 2f * u))
    }
}

private fun DrawScope.image(u: Float, c: Color, s: Stroke) {
    box(3 * u, 4 * u, 18 * u, 16 * u, 3 * u, c, s)
    drawCircle(c, 1.8f * u, Offset(9 * u, 9.5f * u), style = s)
    val hill = Path().apply {
        moveTo(3.5f * u, 18f * u)
        lineTo(9.5f * u, 13f * u)
        lineTo(13f * u, 16f * u)
        lineTo(16f * u, 13.5f * u)
        lineTo(20.5f * u, 17.5f * u)
    }
    drawPath(hill, c, style = s)
}

private fun DrawScope.link(u: Float, c: Color, s: Stroke) {
    // Two rounded links at 45°, overlapping in the middle.
    rotate(-45f) {
        box(2.5f * u, 8.5f * u, 11 * u, 7 * u, 3.5f * u, c, s)
        box(10.5f * u, 8.5f * u, 11 * u, 7 * u, 3.5f * u, c, s)
    }
}

private fun DrawScope.message(u: Float, c: Color, s: Stroke) {
    val bubble = Path().apply {
        moveTo(6f * u, 4f * u)
        lineTo(18f * u, 4f * u)
        quadraticTo(21f * u, 4f * u, 21f * u, 7f * u)
        lineTo(21f * u, 14f * u)
        quadraticTo(21f * u, 17f * u, 18f * u, 17f * u)
        lineTo(10f * u, 17f * u)
        lineTo(5.5f * u, 20.5f * u)
        lineTo(6f * u, 17f * u)
        quadraticTo(3f * u, 17f * u, 3f * u, 14f * u)
        lineTo(3f * u, 7f * u)
        quadraticTo(3f * u, 4f * u, 6f * u, 4f * u)
        close()
    }
    drawPath(bubble, c, style = s)
    drawLine(c, Offset(7.5f * u, 9f * u), Offset(16.5f * u, 9f * u), s.width, StrokeCap.Round)
    drawLine(c, Offset(7.5f * u, 12.5f * u), Offset(13f * u, 12.5f * u), s.width, StrokeCap.Round)
}
