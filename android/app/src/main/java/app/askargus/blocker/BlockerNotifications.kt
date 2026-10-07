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
    // v2: Android won't raise the importance of an existing channel, so the pop-up version is a new one.
    const val CHANNEL_BLOCKS = "blocker_blocks_v2"
    private const val CHANNEL_BLOCKS_OLD = "blocker_blocks"
    const val SERVICE_ID = 2001
    private const val BLOCK_GROUP = "blocker_blocks_group"
    private const val SUMMARY_ID = 2999

    /** One stable id per site, so a repeat block or an Allow replaces the card instead of stacking another. */
    fun idFor(name: String): Int = 3000 + (name.lowercase().hashCode() and 0xFFFF)

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SERVICE, "Blocker running", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows while the scam-site blocker is active"
            },
        )
        nm.deleteNotificationChannel(CHANNEL_BLOCKS_OLD)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_BLOCKS, "Blocked sites", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "When Argus stops a known scam or phishing site from opening"
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

    private fun action(context: Context, action: String, name: String, id: Int, requestCode: Int): PendingIntent =
        PendingIntent.getBroadcast(
            context, requestCode,
            Intent(context, BlockerActionReceiver::class.java).apply {
                this.action = action
                putExtra(BlockerActionReceiver.EXTRA_HOST, name)
                putExtra(BlockerActionReceiver.EXTRA_NOTIF_ID, id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun openApp(context: Context): PendingIntent =
        PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)

    private fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Pops up when a site is blocked, with a way to let it through. The browser only shows its own error page, so this is where Argus speaks. */
    @SuppressLint("MissingPermission")
    fun blocked(context: Context, name: String) {
        if (!canPost(context)) return
        val nm = NotificationManagerCompat.from(context)
        val id = idFor(name)

        val n = NotificationCompat.Builder(context, CHANNEL_BLOCKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Argus blocked $name")
            .setContentText("Known scam site. It can't open on this phone.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openApp(context))
            .addAction(0, "Allow anyway", action(context, BlockerActionReceiver.ACTION_ALLOW, name, id, id))
            .setGroup(BLOCK_GROUP)
            .setAutoCancel(true)
            .setTimeoutAfter(30L * 60 * 1000)
            .build()
        nm.notify(id, n)

        val summary = NotificationCompat.Builder(context, CHANNEL_BLOCKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Scam sites blocked")
            .setContentText("${BlockerState.blocksToday} blocked today")
            .setContentIntent(openApp(context))
            .setGroup(BLOCK_GROUP)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .build()
        nm.notify(SUMMARY_ID, summary)
    }

    /** Replaces the blocked card once the person allows the site, with a way to take it back. */
    @SuppressLint("MissingPermission")
    fun allowed(context: Context, name: String) {
        if (!canPost(context)) return
        val id = idFor(name)
        val n = NotificationCompat.Builder(context, CHANNEL_BLOCKS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("$name allowed")
            .setContentText("Reload the page. It may take a minute to open.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp(context))
            .addAction(0, "Block again", action(context, BlockerActionReceiver.ACTION_BLOCK_AGAIN, name, id, id))
            .setGroup(BLOCK_GROUP)
            .setAutoCancel(true)
            .setTimeoutAfter(10L * 60 * 1000)
            .build()
        NotificationManagerCompat.from(context).notify(id, n)
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
