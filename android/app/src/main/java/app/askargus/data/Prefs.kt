package app.askargus.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.askargus.calls.KeyValueStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.argusPrefs by preferencesDataStore(name = "argus_prefs")

/** Small non-secret settings. */
class Prefs(private val context: Context) {
    private object K {
        val onboarded = booleanPreferencesKey("onboarded")
        val webSignedInFor = stringPreferencesKey("web_signed_in_for")
        val availableUpdate = stringPreferencesKey("available_update")
        val notifiedVersion = stringPreferencesKey("notified_version")
        val askedNotifications = booleanPreferencesKey("asked_notifications")
        val callWarnings = booleanPreferencesKey("call_warnings")
        val silenceCalls = booleanPreferencesKey("silence_calls")
        val blockerEnabled = booleanPreferencesKey("blocker_enabled")
        val allowedSites = stringSetPreferencesKey("allowed_sites")
        val deviceId = stringPreferencesKey("device_id")
        val fcmToken = stringPreferencesKey("fcm_token")
    }

    private val data get() = context.argusPrefs.data

    val onboarded: Flow<Boolean> = data.map { it[K.onboarded] ?: false }
    suspend fun setOnboarded() = context.argusPrefs.edit { it[K.onboarded] = true }

    suspend fun webSignedInFor(): String? = data.first()[K.webSignedInFor]
    suspend fun setWebSignedInFor(userId: String?) = context.argusPrefs.edit {
        if (userId == null) it.remove(K.webSignedInFor) else it[K.webSignedInFor] = userId
    }

    val availableUpdate: Flow<String?> = data.map { it[K.availableUpdate] }
    suspend fun setAvailableUpdate(version: String?) = context.argusPrefs.edit {
        if (version == null) it.remove(K.availableUpdate) else it[K.availableUpdate] = version
    }

    suspend fun notifiedVersion(): String? = data.first()[K.notifiedVersion]
    suspend fun setNotifiedVersion(version: String) = context.argusPrefs.edit { it[K.notifiedVersion] = version }

    suspend fun askedNotifications(): Boolean = data.first()[K.askedNotifications] ?: false
    suspend fun setAskedNotifications() = context.argusPrefs.edit { it[K.askedNotifications] = true }

    val callWarnings: Flow<Boolean> = data.map { it[K.callWarnings] ?: false }
    suspend fun setCallWarnings(on: Boolean) = context.argusPrefs.edit { it[K.callWarnings] = on }

    val silenceCalls: Flow<Boolean> = data.map { it[K.silenceCalls] ?: false }
    suspend fun setSilenceCalls(on: Boolean) = context.argusPrefs.edit { it[K.silenceCalls] = on }

    val blockerEnabled: Flow<Boolean> = data.map { it[K.blockerEnabled] ?: false }
    suspend fun setBlockerEnabled(on: Boolean) = context.argusPrefs.edit { it[K.blockerEnabled] = on }

    val allowedSites: Flow<Set<String>> = data.map { it[K.allowedSites] ?: emptySet() }
    suspend fun allowSite(domain: String) = context.argusPrefs.edit {
        val current = it[K.allowedSites] ?: emptySet()
        it[K.allowedSites] = current + domain.lowercase().trimEnd('.')
    }
    suspend fun removeAllowedSite(domain: String) = context.argusPrefs.edit {
        val current = it[K.allowedSites] ?: emptySet()
        it[K.allowedSites] = current - domain.lowercase().trimEnd('.')
    }

    suspend fun deviceId(): String {
        val current = data.first()[K.deviceId]
        if (current != null) return current
        val newId = java.util.UUID.randomUUID().toString()
        context.argusPrefs.edit { it[K.deviceId] = newId }
        return newId
    }

    /** A new identity for this phone, for the next account that signs in on it. */
    suspend fun resetDeviceId() = context.argusPrefs.edit { it.remove(K.deviceId) }

    val fcmToken: Flow<String?> = data.map { it[K.fcmToken] }
    suspend fun getFcmToken(): String? = data.first()[K.fcmToken]
    suspend fun setFcmToken(token: String?) = context.argusPrefs.edit {
        if (token == null) it.remove(K.fcmToken) else it[K.fcmToken] = token
    }

    /** Plain string storage for what the phone remembers about callers. */
    val store: KeyValueStore = object : KeyValueStore {
        override suspend fun get(key: String) = data.first()[stringPreferencesKey(key)]
        override suspend fun put(key: String, value: String) {
            context.argusPrefs.edit { it[stringPreferencesKey(key)] = value }
        }
        override suspend fun update(key: String, transform: (String?) -> String?): String? {
            var result: String? = null
            context.argusPrefs.edit { prefs ->
                val k = stringPreferencesKey(key)
                val updated = transform(prefs[k])
                result = updated
                if (updated == null) prefs.remove(k) else prefs[k] = updated
            }
            return result
        }
    }
}
