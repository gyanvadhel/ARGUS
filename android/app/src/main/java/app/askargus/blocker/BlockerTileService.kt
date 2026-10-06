package app.askargus.blocker

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.core.content.ContextCompat
import app.askargus.ArgusApp
import app.askargus.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Quick Settings tile to quickly toggle the scam-site blocker.
 */
class BlockerTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        val isActive = ArgusVpnService.running
        tile.state = if (isActive) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "Scam blocker"
        tile.updateTile()
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val app = applicationContext as? ArgusApp
        val container = app?.container

        if (ArgusVpnService.running) {
            val stopIntent = Intent(this, ArgusVpnService::class.java).apply {
                action = ArgusVpnService.ACTION_STOP
            }
            startService(stopIntent)
            container?.let { scope.launch { it.prefs.setBlockerEnabled(false) } }
            qsTile?.state = Tile.STATE_INACTIVE
            qsTile?.updateTile()
        } else {
            val prepareIntent = VpnService.prepare(this)
            if (prepareIntent == null) {
                // Already authorized
                val startIntent = Intent(this, ArgusVpnService::class.java)
                ContextCompat.startForegroundService(this, startIntent)
                container?.let { scope.launch { it.prefs.setBlockerEnabled(true) } }
                qsTile?.state = Tile.STATE_ACTIVE
                qsTile?.updateTile()
            } else {
                // Requires VPN authorization prompt in UI
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                if (Build.VERSION.SDK_INT >= 34) {
                    val pi = PendingIntent.getActivity(this, 0, mainIntent, PendingIntent.FLAG_IMMUTABLE)
                    startActivityAndCollapse(pi)
                } else {
                    @Suppress("DEPRECATION")
                    startActivityAndCollapse(mainIntent)
                }
            }
        }
    }
}
