package app.askargus.net

import android.content.Context
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.sessionData by preferencesDataStore(name = "argus_session")
private val SESSION = stringPreferencesKey("session")

/** The sign-in session, encrypted with a Keystore key. If it can't be read (e.g. restored to another phone), the
 *  person is simply signed out. */
class EncryptedSessionStore(private val context: Context, private val cipher: KeystoreCipher = KeystoreCipher()) : SessionStore {
    override suspend fun load(): Session? = runCatching {
        val stored = context.sessionData.data.first()[SESSION] ?: return null
        val json = String(cipher.decrypt(Base64.decode(stored, Base64.NO_WRAP)))
        ArgusJson.decodeFromString(Session.serializer(), json)
    }.getOrNull()

    override suspend fun save(session: Session?) {
        context.sessionData.edit { prefs ->
            if (session == null) prefs.remove(SESSION)
            else prefs[SESSION] = Base64.encodeToString(
                cipher.encrypt(ArgusJson.encodeToString(Session.serializer(), session).toByteArray()), Base64.NO_WRAP,
            )
        }
    }
}
