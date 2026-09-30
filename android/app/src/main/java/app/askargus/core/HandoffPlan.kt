package app.askargus.core

object HandoffPlan {
    /** A fresh website sign-in link is only needed when someone is signed in and the website isn't signed in as them yet. */
    fun needsHandoff(userId: String?, webSignedInFor: String?, force: Boolean = false): Boolean =
        userId != null && (force || webSignedInFor != userId)

    fun plainUrl(appUrl: String, path: String): String =
        appUrl.trimEnd('/') + if (path.startsWith("/")) path else "/$path"
}
