package app.askargus.calls

import org.junit.Assert.assertEquals
import org.junit.Test

class CallRoleTest {
    @Test fun oldAndroidIsUnsupported() = assertEquals(CallRole.State.UNSUPPORTED, CallRole.state(28, true, true, false))
    @Test fun signedOutNeedsSignIn() = assertEquals(CallRole.State.NEEDS_SIGN_IN, CallRole.state(34, false, false, false))
    @Test fun switchOnButRoleLostIsOff() = assertEquals(CallRole.State.OFF, CallRole.state(34, true, true, false))
    @Test fun roleHeldButSwitchOffIsOff() = assertEquals(CallRole.State.OFF, CallRole.state(34, true, false, true))
    @Test fun blockedNotificationsNeedAllowing() =
        assertEquals(CallRole.State.NEEDS_NOTIFICATIONS, CallRole.state(34, true, true, true, notificationsAllowed = false))
    @Test fun switchOnWithRoleIsOn() = assertEquals(CallRole.State.ON, CallRole.state(34, true, true, true))
}
