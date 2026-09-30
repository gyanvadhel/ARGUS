package app.askargus.net

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable

@Serializable
data class Session(
    val accessToken: String,
    val refreshToken: String,
    /** Epoch seconds when the access token stops working. */
    val expiresAt: Long,
    val userId: String,
    val email: String? = null,
    val name: String? = null,
)

interface SessionStore {
    suspend fun load(): Session?
    suspend fun save(session: Session?)
}

class MemorySessionStore(private var session: Session? = null) : SessionStore {
    override suspend fun load(): Session? = session
    override suspend fun save(session: Session?) {
        this.session = session
    }
}

/** Keeps the saved session in memory and tells the UI whenever it changes: signed in, refreshed or signed out. */
class ObservableSessionStore(private val inner: SessionStore) : SessionStore {
    private val _state = MutableStateFlow<Session?>(null)
    val state: StateFlow<Session?> = _state.asStateFlow()
    private val lock = Mutex()
    private var loaded = false

    override suspend fun load(): Session? = lock.withLock {
        if (!loaded) {
            _state.value = inner.load()
            loaded = true
        }
        _state.value
    }

    override suspend fun save(session: Session?) = lock.withLock {
        inner.save(session)
        _state.value = session
        loaded = true
    }
}
