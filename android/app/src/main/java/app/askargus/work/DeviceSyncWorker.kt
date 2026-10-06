package app.askargus.work

import android.content.Context
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.askargus.ArgusApp
import app.askargus.BuildConfig
import app.askargus.net.DeviceReport
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

/**
 * Reports the phone's protections (call warnings, scam-site blocker), app version,
 * and FCM push token to Argus so family circle members can see protection status
 * and receive timely push alerts.
 * Runs once a day and immediately on any protection toggle or token refresh.
 */
class DeviceSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? ArgusApp ?: return Result.success()
        val c = app.container
        if (!c.account.signedIn()) return Result.success()

        val deviceId = c.prefs.deviceId()
        val model = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".trim()
        val appVersion = BuildConfig.VERSION_NAME
        val callWarningsOn = c.prefs.callWarnings.first()
        val blockerOn = c.prefs.blockerEnabled.first()
        val fcmToken = c.prefs.getFcmToken()

        val report = DeviceReport(
            deviceId = deviceId,
            name = model,
            appVersion = appVersion,
            protections = mapOf(
                "calls" to callWarningsOn,
                "blocker" to blockerOn,
            ),
            fcmToken = fcmToken,
        )

        val ok = c.api.reportDevice(report)
        return if (ok) Result.success() else Result.retry()
    }

    companion object {
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<DeviceSyncWorker>(1, TimeUnit.DAYS)
                .setConstraints(online)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "device-sync",
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun syncNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<DeviceSyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "device-sync-now",
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
