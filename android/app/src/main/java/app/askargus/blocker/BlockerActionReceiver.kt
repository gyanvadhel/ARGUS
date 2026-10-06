package app.askargus.blocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import app.askargus.ArgusApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BlockerActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ALLOW = "app.askargus.blocker.ACTION_ALLOW"
        const val EXTRA_HOST = "extra_host"
        const val EXTRA_NOTIF_ID = "extra_notif_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ALLOW) return
        val host = intent.getStringExtra(EXTRA_HOST) ?: return
        val notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1)

        BlockerState.allow(host)

        if (notifId >= 0) {
            NotificationManagerCompat.from(context).cancel(notifId)
        }

        val app = context.applicationContext as? ArgusApp
        app?.container?.let { container ->
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                container.prefs.allowSite(host)
            }
        }
    }
}
