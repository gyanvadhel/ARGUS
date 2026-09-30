package app.askargus.core

import java.text.NumberFormat
import java.util.Locale

object Money {
    /** "4999" becomes "₹4,999.00"; anything that isn't a number is shown as it is. */
    fun rupees(amount: String): String {
        val n = amount.trim().toBigDecimalOrNull() ?: return amount
        return NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(n)
    }
}
