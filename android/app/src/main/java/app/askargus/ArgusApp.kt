package app.askargus

import android.app.Application
import app.askargus.work.Notifications
import app.askargus.work.UpdateCheckWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ArgusApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifications.createChannels(this)
        UpdateCheckWorker.schedule(this)
        // The Activity timeline keeps 90 days.
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            container.activity.deleteBefore(System.currentTimeMillis() - 90L * 24 * 60 * 60 * 1000)
        }
    }
}
