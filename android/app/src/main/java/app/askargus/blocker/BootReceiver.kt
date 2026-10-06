package app.askargus.blocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import androidx.core.content.ContextCompat
import app.askargus.ArgusApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Restarts the scam-site blocker on boot if it was previously enabled.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val app = context.applicationContext as? ArgusApp ?: return
        val container = app.container

        BlocklistWorker.schedule(context)

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val enabled = container.prefs.blockerEnabled.first()
            if (enabled && VpnService.prepare(context) == null) {
                BlocklistWorker.loadFromDisk(context)
                val vpnIntent = Intent(context, ArgusVpnService::class.java)
                ContextCompat.startForegroundService(context, vpnIntent)
            }
        }
    }
}
