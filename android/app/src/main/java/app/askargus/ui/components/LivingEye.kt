package app.askargus.ui.components

import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import app.askargus.core.Gaze
import app.askargus.ui.theme.ArgusColors
import kotlin.math.sin
import kotlin.random.Random

enum class EyeMood { IDLE, WATCHING, SCANNING, SAFE, DANGER }

private class BlinkClock {
    private var start = -1L
    private var next = 0L

    fun closure(now: Long): Float {
        if (next == 0L) next = now + 1500
        if (start < 0 && now >= next) start = now
        if (start < 0) return 0f
        val t = (now - start) / 190f
        if (t >= 1f) {
            start = -1
            next = now + 2400 + Random.nextLong(7000)
        }
        return Gaze.blinkClosure(t)
    }
}

/** The Argus eye, drawn like the app icon: it blinks, looks where you last touched, and its mood shows state. */
@Composable
fun LivingEye(mood: EyeMood, modifier: Modifier = Modifier) {
    val touch = LocalTouch.current
    var origin by remember { mutableStateOf(Offset.Zero) }
    val time by produceState(0L) { while (true) withFrameMillis { value = it } }
    val blink = remember { BlinkClock() }
    val open by animateFloatAsState(if (mood == EyeMood.DANGER) 0.72f else 1f, tween(500), label = "open")
    val iris = when (mood) {
        EyeMood.SAFE -> listOf(ArgusColors.Safe, ArgusColors.Clear)
        EyeMood.DANGER -> listOf(ArgusColors.High, ArgusColors.Sus)
        else -> listOf(ArgusColors.IrisA, ArgusColors.IrisB, ArgusColors.IrisC)
    }

    Canvas(modifier.aspectRatio(2f).onGloballyPositioned { origin = it.positionInRoot() }) {
        val halfW = size.width * 0.46f
        val c = center
        val lift = 0.673f * halfW * open * (1f - blink.closure(time) * 0.94f)
        val almond = Path().apply {
            moveTo(c.x - halfW, c.y)
            cubicTo(c.x - 0.577f * halfW, c.y - lift, c.x + 0.577f * halfW, c.y - lift, c.x + halfW, c.y)
            cubicTo(c.x + 0.577f * halfW, c.y + lift, c.x - 0.577f * halfW, c.y + lift, c.x - halfW, c.y)
            close()
        }
        val irisR = halfW * 0.508f
        val maxShift = halfW * 0.24f
        val last = touch.position
        val fresh = last != null && SystemClock.uptimeMillis() - touch.at < 2500
        val shift = if (fresh) {
            val t = last!! - origin
            val (dx, dy) = Gaze.pupilOffset(c.x, c.y, t.x, t.y, maxShift, size.width * 1.5f)
            Offset(dx, dy * 0.7f)
        } else {
            val s = time / 1000f * if (mood == EyeMood.SCANNING) 3.2f else 0.35f
            Offset(sin(s) * maxShift * 0.8f, sin(s * 0.63f + 1f) * maxShift * 0.35f)
        }
        val ic = c + shift
        clipPath(almond) {
            drawCircle(Brush.linearGradient(iris, ic - Offset(irisR, irisR), ic + Offset(irisR, irisR)), irisR, ic)
            drawCircle(ArgusColors.Background, irisR * 0.41f, ic)
            drawCircle(Color.White.copy(alpha = 0.9f), irisR * 0.13f, ic + Offset(-irisR * 0.28f, -irisR * 0.31f))
        }
        drawPath(almond, ArgusColors.Foreground, style = Stroke(width = halfW * 0.085f, join = StrokeJoin.Round))
    }
}
