package app.askargus.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import app.askargus.ArgusApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** The Scam and Not scam buttons on a call warning. Not scam stays on this phone; Scam also reports the number. */
class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val number = intent.getStringExtra(CallNotifications.EXTRA_NUMBER) ?: return
        val country = intent.getStringExtra(CallNotifications.EXTRA_COUNTRY)
        val id = intent.getIntExtra(CallNotifications.EXTRA_ID, 0)
        val container = (context.applicationContext as ArgusApp).container
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    CallNotifications.ACTION_NOT_SCAM -> container.callMemory.markNotScam(number)
                    CallNotifications.ACTION_SCAM -> {
                        container.callMemory.unmarkNotScam(number)
                        container.callMemory.remember(number, 100)
                        runCatching { container.api.report(number, country) }
                    }
                }
            } finally {
                NotificationManagerCompat.from(context).cancel(id)
                pending.finish()
            }
        }
    }
}
