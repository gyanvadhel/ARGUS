package app.askargus.work

import android.content.Context
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
import app.askargus.calls.CallRole
import app.askargus.net.ApiException
import app.askargus.net.SignedOutException
import java.util.concurrent.TimeUnit

/** Once a day: fetch the numbers Argus users have reported as scams, so a known one is recognised the instant it
 *  rings, even offline. A failed fetch keeps yesterday's list. */
class ScamListWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as ArgusApp).container
        CallRole.reconcile(applicationContext, c)
        if (c.account.session.value == null) return Result.success()
        return try {
            c.callMemory.setKnown(c.api.scamNumbers().associate { it.number to it.label })
            Result.success()
        } catch (e: SignedOutException) {
            Result.success()
        } catch (e: ApiException) {
            Result.retry()
        }
    }

    companion object {
        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<ScamListWorker>(1, TimeUnit.DAYS)
                .setConstraints(online)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("scam-list", ExistingPeriodicWorkPolicy.KEEP, request)
        }

        /** Right after call warnings are turned on, so the list is there before the first call. */
        fun now(context: Context) {
            val request = OneTimeWorkRequestBuilder<ScamListWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork("scam-list-now", ExistingWorkPolicy.REPLACE, request)
        }
    }
}
