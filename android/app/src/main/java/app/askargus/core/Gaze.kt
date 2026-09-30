package app.askargus.core

import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** The watching eye's geometry, as web/src/lib/gaze.ts. */
object Gaze {
    fun pupilOffset(cx: Float, cy: Float, tx: Float, ty: Float, maxOffset: Float, reach: Float = 240f): Pair<Float, Float> {
        val dx = tx - cx
        val dy = ty - cy
        val dist = sqrt(dx * dx + dy * dy)
        if (dist == 0f) return 0f to 0f
        val k = (min(1f, dist / reach) * maxOffset) / dist
        return dx * k to dy * k
    }

    fun blinkClosure(t: Float): Float = if (t <= 0f || t >= 1f) 0f else sin(PI * t).toFloat()
}
