package app.askargus.calls

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import app.askargus.AppContainer
import kotlinx.coroutines.flow.first

/** Android 10's call-screening role: what Argus needs before it can warn about calls. */
object CallRole {
    enum class State { NEEDS_SIGN_IN, UNSUPPORTED, OFF, NEEDS_NOTIFICATIONS, ON }

    fun state(sdk: Int, signedIn: Boolean, switchOn: Boolean, holdsRole: Boolean, notificationsAllowed: Boolean = true) = when {
        sdk < 29 -> State.UNSUPPORTED
        !signedIn -> State.NEEDS_SIGN_IN
        switchOn && holdsRole && !notificationsAllowed -> State.NEEDS_NOTIFICATIONS
        switchOn && holdsRole -> State.ON
        else -> State.OFF
    }

    fun holds(context: Context): Boolean = Build.VERSION.SDK_INT >= 29 &&
        context.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_CALL_SCREENING)

    fun requestIntent(context: Context): Intent? = if (Build.VERSION.SDK_INT >= 29) {
        context.getSystemService(RoleManager::class.java).createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
    } else {
        null
    }

    /** The person can take the role away in Android's settings; when they have, the switch goes off and says why. */
    suspend fun reconcile(context: Context, c: AppContainer) {
        if (c.prefs.callWarnings.first() && !holds(context)) {
            c.prefs.setCallWarnings(false)
            CallNotifications.roleLost(context)
        }
    }
}
