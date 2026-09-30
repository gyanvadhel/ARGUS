package app.askargus.core

object UpdateDecision {
    data class Outcome(val available: String?, val notify: Boolean)

    /** Offer a newer version; notify about each version only once. */
    fun decide(latest: String?, current: String, notified: String?): Outcome {
        if (latest == null || !Versions.isNewer(latest, current)) return Outcome(null, false)
        return Outcome(latest, notified != latest)
    }
}
