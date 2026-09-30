package app.askargus.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors
import kotlin.math.roundToInt

/** Risk out of 100 as a 270° dial that fills when a verdict arrives, like the website's. */
@Composable
fun ScoreDial(score: Int, color: Color, modifier: Modifier = Modifier) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(score) {
        progress.snapTo(0f)
        progress.animateTo(score / 100f, tween(900, easing = FastOutSlowInEasing))
    }
    Box(modifier.size(168.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 10.dp.toPx()
            val inset = Offset(stroke / 2, stroke / 2)
            val arc = Size(size.width - stroke, size.height - stroke)
            drawArc(ArgusColors.Accent, 135f, 270f, false, inset, arc, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(color, 135f, 270f * progress.value, false, inset, arc, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("${(progress.value * 100).roundToInt()}", style = MaterialTheme.typography.displayMedium, color = color)
            Text("risk out of 100", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        }
    }
}
