package app.askargus.net

import kotlinx.serialization.json.Json

val ArgusJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
