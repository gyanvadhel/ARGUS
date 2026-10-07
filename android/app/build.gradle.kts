import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// Public settings (the same values every visitor's browser gets from askargus.app).
val config = Properties().apply { rootProject.file("config.properties").inputStream().use { load(it) } }

// The release signing key lives outside the repo (see android/README.md). Without it only debug builds work.
val keystore = Properties().apply {
    val file = File(System.getProperty("user.home"), ".argus/keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun quoted(name: String) = "\"" + config.getProperty(name) + "\""

android {
    namespace = "app.askargus"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.askargus"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.2.3"
        buildConfigField("String", "APP_URL", quoted("appUrl"))
        buildConfigField("String", "SUPABASE_URL", quoted("supabaseUrl"))
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", quoted("supabasePublishableKey"))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", quoted("googleWebClientId"))
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    signingConfigs {
        if (keystore.isNotEmpty()) {
            create("release") {
                storeFile = file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode)
    implementation(libs.mlkit.text.devanagari)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    implementation(libs.androidbrowserhelper)
    implementation(libs.firebase.messaging)
    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
