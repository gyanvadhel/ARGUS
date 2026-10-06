package app.askargus.blocker

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.askargus.MainActivity
import app.askargus.R

/**
 * Notification channels and helpers for the scam-site blocker.
 */
object BlockerNotifications {
    const val CHANNEL_SERVICE = "blocker_service"
    const val CHANNEL_BLOCKS = "blocker_blocks"
    const val SERVICE_ID = 2001
    private const val BLOCK_GROUP = "blocker_blocks_group"
    private var blockNotifId = 3000

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "Blocker running", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows while the scam-site blocker is active"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_BLOCKS, "Blocked sites", NotificationManager.IMPORTANCE_LOW).apply {
                description = "When Argus blocks a known scam or phishing site"
            },
        )
    }

    /** The ongoing foreground notification for the VPN service. */
    fun serviceNotification(context: Context): Notification {
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            context, 1,
            Intent(context, ArgusVpnService::class.java).apply { action = ArgusVpnService.ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Blocker running")
            .setContentText("Argus is blocking known scam sites.")
            .setContentIntent(open)
            .addAction(0, "Turn off", stop)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    /** Quiet grouped notification when a site is blocked. */
    @SuppressLint("MissingPermission")
    fun blocked(context: Context, name: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val nm = NotificationManagerCompat.from(context)
        val id = blockNotifId++

        // Individual notification
        val allowIntent = Intent(context, BlockerActionReceiver::class.java).apply {
            action = BlockerActionReceiver.ACTION_ALLOW
            putExtra(BlockerActionReceiver.EXTRA_HOST, name)
            putExtra(BlockerActionReceiver.EXTRA_NOTIF_ID, id)
        }
        val allowPendingIntent = PendingIntent.getBroadcast(
            context, id,
            allowIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val n = NotificationCompat.Builder(context, CHANNEL_BLOCKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Argus blocked $name")
            .setContentText("Known phishing site")
            .addAction(0, "Allow", allowPendingIntent)
            .setGroup(BLOCK_GROUP)
            .setAutoCancel(true)
            .build()
        nm.notify(id, n)

        // Summary notification
        val summary = NotificationCompat.Builder(context, CHANNEL_BLOCKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Scam sites blocked")
            .setContentText("${BlockerState.blocksToday} blocked today")
            .setGroup(BLOCK_GROUP)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .build()
        nm.notify(2999, summary)
    }

    /** Notification when the VPN is revoked (another VPN started). */
    @SuppressLint("MissingPermission")
    fun revoked(context: Context) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val n = NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Blocker turned off")
            .setContentText("Another VPN app started, so the blocker had to stop.")
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(2998, n)
    }
}
