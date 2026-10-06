package app.askargus.blocker

import app.askargus.data.Prefs

/** Sites the person chose to let through. The blocker reads [BlockerState] at once; [Prefs] keeps the choice. */
object AllowList {
    suspend fun allow(prefs: Prefs, name: String) {
        BlockerState.allow(name)
        prefs.allowSite(name)
    }

    suspend fun blockAgain(prefs: Prefs, name: String) {
        BlockerState.disallow(name)
        prefs.removeAllowedSite(name)
    }
}
