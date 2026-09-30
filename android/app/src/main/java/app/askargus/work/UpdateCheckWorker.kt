package app.askargus.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.askargus.ArgusApp
import app.askargus.BuildConfig
import app.askargus.core.UpdateDecision
import app.askargus.net.ApiException
import java.util.concurrent.TimeUnit

/** Once a day: is there a newer Argus on the download page? Tells the person once per version. */
class UpdateCheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as ArgusApp).container
        val latest = try {
            container.api.latest()
        } catch (e: ApiException) {
            return Result.retry()
        }
        val outcome = UpdateDecision.decide(latest?.version, BuildConfig.VERSION_NAME, container.prefs.notifiedVersion())
        container.prefs.setAvailableUpdate(outcome.available)
        if (outcome.notify && outcome.available != null) {
            Notifications.updateReady(applicationContext, outcome.available)
            container.prefs.setNotifiedVersion(outcome.available)
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(1, TimeUnit.DAYS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("update-check", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
