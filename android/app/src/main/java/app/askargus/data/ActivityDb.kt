package app.askargus.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/** One line in the on-phone Activity timeline. It never leaves the phone. */
@Entity(tableName = "activity")
data class ActivityEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val at: Long,
    val type: String,
    val kind: String,
    val subject: String,
    val score: Int? = null,
    val level: String? = null,
    val verified: Boolean = false,
    val scanId: String? = null,
    val source: String? = null,
)

@Dao
interface ActivityDao {
    @Insert suspend fun add(event: ActivityEvent): Long

    @Query("SELECT * FROM activity ORDER BY at DESC LIMIT 300")
    fun recent(): Flow<List<ActivityEvent>>

    @Query("SELECT COUNT(*) FROM activity WHERE at >= :since")
    fun countSince(since: Long): Flow<Int>

    @Query("DELETE FROM activity WHERE at < :before")
    suspend fun deleteBefore(before: Long)
}

@Database(entities = [ActivityEvent::class], version = 1, exportSchema = false)
abstract class ActivityDb : RoomDatabase() {
    abstract fun dao(): ActivityDao

    companion object {
        @Volatile private var instance: ActivityDb? = null

        fun get(context: Context): ActivityDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, ActivityDb::class.java, "activity.db").build().also { instance = it }
        }
    }
}
