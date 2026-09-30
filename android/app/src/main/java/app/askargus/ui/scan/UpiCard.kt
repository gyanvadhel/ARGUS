package app.askargus.ui.scan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.core.Money
import app.askargus.core.QrPayload
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.theme.ArgusColors

@Composable
fun UpiCard(payment: QrPayload.Upi, onDismiss: () -> Unit) {
    ArgusCard {
        Text(if (payment.mandate) "UPI autopay code" else "UPI payment code", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        Spacer(Modifier.height(10.dp))
        Text(
            if (payment.mandate) "This code sets up automatic payments from your account." else "This code sends money. It never receives it.",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            "If someone sent you this for a refund, a prize, a job payment or to “receive” money, it's a scam. " +
                "Don't scan it in your UPI app. You never need your PIN to receive money.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.High,
            modifier = Modifier.fillMaxWidth()
                .background(ArgusColors.High.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                .border(1.dp, ArgusColors.High.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                .padding(14.dp),
        )
        Spacer(Modifier.height(14.dp))
        Row { Label("Pays"); Column { Text(payment.name ?: payment.payee); if (payment.name != null) Text(payment.payee, style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText) } }
        Spacer(Modifier.height(8.dp))
        Row { Label("Amount"); Text(payment.amount?.let(Money::rupees) ?: "Not set: you'd type it in") }
        payment.note?.let {
            Spacer(Modifier.height(8.dp))
            Row { Label("Note"); Text(it) }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            "Paying a shop or a friend? Go ahead, as long as the name your UPI app shows before you pay is the one you expect.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.MutedText,
        )
        TextButton(onClick = onDismiss) { Text("Close", color = ArgusColors.Foreground) }
    }
}

@Composable
private fun Label(text: String) {
    Text(text, color = ArgusColors.MutedText, modifier = Modifier.width(76.dp))
}
