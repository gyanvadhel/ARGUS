package app.askargus.calls

import android.Manifest
import android.annotation.SuppressLint
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
import app.askargus.R

/** The call warning: a heads-up while a likely scam rings, a quieter note for a suspicious one, each with
 *  Scam and Not scam buttons. */
object CallNotifications {
    const val HIGH = "calls_high"
    const val QUIET = "calls_quiet"
    const val EXTRA_NUMBER = "number"
    const val EXTRA_COUNTRY = "country"
    const val EXTRA_ID = "id"
    const val ACTION_SCAM = "app.askargus.action.CALL_SCAM"
    const val ACTION_NOT_SCAM = "app.askargus.action.CALL_NOT_SCAM"

    fun createChannels(context: Context) {
        val m = context.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(
            NotificationChannel(HIGH, "Scam call warnings", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shown while a likely scam call is ringing"
            },
        )
        m.createNotificationChannel(
            NotificationChannel(QUIET, "Suspicious call notes", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Calls from numbers that look suspicious"
            },
        )
    }

    @SuppressLint("MissingPermission") // checked just below
    fun roleLost(context: Context) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val n = NotificationCompat.Builder(context, QUIET)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Call warnings turned off")
            .setContentText("Argus no longer has the call-screening role.")
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(ROLE_LOST_ID, n)
    }

    private const val ROLE_LOST_ID = 1002

    fun body(w: CallOutcome.Warn): String =
        if (w.late) "${w.summary}. Tap Scam to report it." else w.summary

    @SuppressLint("MissingPermission") // checked just below
    fun show(context: Context, w: CallOutcome.Warn, country: String? = null) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val id = w.number.hashCode()
        fun action(name: String, label: String, req: Int) = NotificationCompat.Action.Builder(
            0,
            label,
            PendingIntent.getBroadcast(
                context,
                id + req,
                Intent(name).setPackage(context.packageName)
                    .putExtra(EXTRA_NUMBER, w.number)
                    .putExtra(EXTRA_COUNTRY, country)
                    .putExtra(EXTRA_ID, id),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        ).build()
        val high = w.level == CallLevel.LIKELY_SCAM
        val n = NotificationCompat.Builder(context, if (high) HIGH else QUIET)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(CallPolicy.title(w.level, w.late, w.number))
            .setContentText(body(w))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body(w)))
            .setPriority(if (high) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .addAction(action(ACTION_SCAM, "Scam", 1))
            .addAction(action(ACTION_NOT_SCAM, "Not scam", 2))
            .build()
        NotificationManagerCompat.from(context).notify(id, n)
    }
}
