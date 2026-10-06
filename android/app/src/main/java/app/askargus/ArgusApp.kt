package app.askargus

import android.app.Application
import app.askargus.blocker.BlockerNotifications
import app.askargus.blocker.BlockerState
import app.askargus.blocker.BlocklistWorker
import app.askargus.calls.CallNotifications
import app.askargus.work.DeviceSyncWorker
import app.askargus.work.Notifications
import app.askargus.work.ScamListWorker
import app.askargus.work.UpdateCheckWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ArgusApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifications.createChannels(this)
        CallNotifications.createChannels(this)
        BlockerNotifications.createChannels(this)
        app.askargus.family.ArgusFirebaseMessagingService.createChannel(this)
        UpdateCheckWorker.schedule(this)
        ScamListWorker.schedule(this)
        BlocklistWorker.loadFromDisk(this)
        BlocklistWorker.schedule(this)
        DeviceSyncWorker.schedule(this)
        // The Activity timeline keeps 90 days.
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            val allowed = container.prefs.allowedSites.first()
            BlockerState.setAllowed(allowed)
            container.activity.deleteBefore(System.currentTimeMillis() - 90L * 24 * 60 * 60 * 1000)
        }
    }
}
