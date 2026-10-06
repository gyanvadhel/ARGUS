package app.askargus.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
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

    /** Plain string storage for what the phone remembers about callers. */
    val store: KeyValueStore = object : KeyValueStore {
        override suspend fun get(key: String) = data.first()[stringPreferencesKey(key)]
        override suspend fun put(key: String, value: String) {
            context.argusPrefs.edit { it[stringPreferencesKey(key)] = value }
        }
    }
}
