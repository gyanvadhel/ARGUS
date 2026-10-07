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
        const val ACTION_BLOCK_AGAIN = "app.askargus.blocker.ACTION_BLOCK_AGAIN"
        const val EXTRA_HOST = "extra_host"
        const val EXTRA_NOTIF_ID = "extra_notif_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val allow = when (intent.action) {
            ACTION_ALLOW -> true
            ACTION_BLOCK_AGAIN -> false
            else -> return
        }
        val host = intent.getStringExtra(EXTRA_HOST) ?: return
        val notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1)

        // The block is lifted or restored at once; the saved list catches up in the background.
        if (allow) BlockerState.allow(host) else BlockerState.disallow(host)

        if (allow) BlockerNotifications.allowed(context, host)
        else if (notifId >= 0) NotificationManagerCompat.from(context).cancel(notifId)

        val container = (context.applicationContext as? ArgusApp)?.container ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (allow) container.prefs.allowSite(host) else container.prefs.removeAllowedSite(host)
            } finally {
                pending.finish()
            }
        }
    }
}
