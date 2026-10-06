package app.askargus.blocker

import android.content.Context
import android.util.Log
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
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Downloads the scam-site blocklist daily and stores it on disk.
 *
 * - Prefers Wi-Fi; falls back to any network if the list is older than 3 days.
 * - Keeps the old list on failure.
 * - After 7 days without an update, Settings marks it as out of date.
 */
class BlocklistWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "BlocklistWorker"
        private const val WORK_NAME = "blocklist-sync"
        private const val BLOCKLIST_FILE = "blocklist.txt"

        fun schedule(context: Context) {
            // Daily, Wi-Fi preferred
            val wifiRequest = PeriodicWorkRequestBuilder<BlocklistWorker>(1, TimeUnit.DAYS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.UNMETERED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, wifiRequest)
        }

        /** Immediate one-shot download (e.g. when turning the blocker on for the first time). */
        fun now(context: Context) {
            val request = OneTimeWorkRequestBuilder<BlocklistWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("blocklist-now", ExistingWorkPolicy.REPLACE, request)
        }

        fun blocklist(context: Context): File =
            File(context.filesDir, BLOCKLIST_FILE)

        /** Load blocklist from disk into BlockerState, if available. */
        fun loadFromDisk(context: Context) {
            val file = blocklist(context)
            if (file.exists()) {
                try {
                    val index = file.inputStream().use { HostIndex.fromStream(it) }
                    BlockerState.hostIndex = index
                    BlockerState.lastDownloadAt = file.lastModified()
                    Log.i(TAG, "Loaded blocklist from disk: ${index.size} entries")
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to load blocklist from disk", e)
                }
            }
        }
    }

    override suspend fun doWork(): Result {
        return try {
            val url = app.askargus.BuildConfig.APP_URL.trimEnd('/') + "/api/blocklist"
            val http = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build()
            val request = Request.Builder().url(url).build()
            val response = http.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.w(TAG, "Blocklist download failed: ${response.code}")
                return Result.retry()
            }
            val body = response.body?.string() ?: ""
            if (body.isBlank()) {
                Log.w(TAG, "Blocklist is empty")
                return Result.retry()
            }

            // Save to disk
            val file = blocklist(applicationContext)
            val tmp = File(file.parent, "${file.name}.tmp")
            tmp.writeText(body)
            tmp.renameTo(file)

            // Load into memory
            val index = file.inputStream().use { HostIndex.fromStream(it) }
            BlockerState.hostIndex = index
            BlockerState.lastDownloadAt = System.currentTimeMillis()

            Log.i(TAG, "Blocklist updated: ${index.size} entries")
            Result.success()
        } catch (e: Exception) {
            Log.w(TAG, "Blocklist download error", e)
            Result.retry()
        }
    }
}
