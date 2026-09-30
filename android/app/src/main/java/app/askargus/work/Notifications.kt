package app.askargus.work

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.askargus.BuildConfig
import app.askargus.R

object Notifications {
    const val UPDATES = "updates"
    private const val UPDATE_ID = 1001

    fun createChannels(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(UPDATES, "Updates", NotificationManager.IMPORTANCE_LOW).apply {
                description = "When a new version of Argus is ready"
            },
        )
    }

    @SuppressLint("MissingPermission") // checked just below
    fun updateReady(context: Context, version: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_URL}/app")), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, UPDATES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Argus $version is ready")
            .setContentText("Tap to download the update.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(UPDATE_ID, notification)
    }
}
