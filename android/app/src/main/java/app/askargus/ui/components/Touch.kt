package app.askargus.ui.components

import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput

/** The last place someone touched the screen, so the eyes can look there. Touches are observed, never consumed. */
class TouchState {
    var position by mutableStateOf<Offset?>(null)
    var at by mutableLongStateOf(0L)
}

val LocalTouch = staticCompositionLocalOf { TouchState() }

fun Modifier.trackTouches(state: TouchState): Modifier = pointerInput(state) {
    awaitPointerEventScope {
        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            event.changes.firstOrNull()?.let {
                state.position = it.position
                state.at = SystemClock.uptimeMillis()
            }
        }
    }
}
