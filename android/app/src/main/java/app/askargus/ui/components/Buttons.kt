package app.askargus.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun ArgusButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false) {
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled && !busy,
        colors = ButtonDefaults.buttonColors(containerColor = ArgusColors.Foreground, contentColor = ArgusColors.OnPrimary),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = ArgusColors.OnPrimary, strokeWidth = 2.dp)
        else Text(text)
    }
}

@Composable
fun ArgusOutlinedButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled,
        border = BorderStroke(1.dp, ArgusColors.Input),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = ArgusColors.Foreground),
    ) { Text(text) }
}
