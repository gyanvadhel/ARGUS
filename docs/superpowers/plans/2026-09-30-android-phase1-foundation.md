# Argus for Android — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first installable Argus Android app: sign-in, a scanner for text/links/QR codes/screenshots with honest results, Share to Argus, an on-phone Activity timeline, website pages opened signed in, "Invite family", an update check, and the website pieces it needs (app API, family links, download page).

**Architecture:** A native Kotlin + Jetpack Compose app (`android/app`, package `app.askargus`) talks to new Next.js route handlers under `askargus.app/api/app/*` with the user's Supabase access token, so row-level security works exactly as on the website. QR codes and screenshot text are read on the phone with bundled ML Kit. Website pages open in a Trusted Web Activity after a one-time magic-link "handoff".

**Tech Stack:** Kotlin 2.1, AGP 8.7, Compose (BOM 2024.12.01, Material 3), Room, WorkManager, DataStore + Android Keystore, OkHttp 4, kotlinx.serialization, CameraX 1.4, ML Kit (barcode + Devanagari text, bundled), Credential Manager + Google ID, android-browser-helper (TWA); Next.js 16 route handlers, Supabase (Postgres + RLS + security-definer functions), Vitest; JUnit 4 + MockWebServer.

**Spec:** `docs/superpowers/specs/2026-09-30-android-app-design.md`

## Global Constraints

- **Never fake anything:** "Safe" only when `verified` is true, otherwise "No red flags"; a failed check says it couldn't check; features not built yet are labelled "Coming soon".
- **Free:** no paid services or libraries.
- **Package** `app.askargus`; **minSdk 26**; compileSdk/targetSdk **35** for this phase (the known-good toolchain below; the spec's "newest API level" is a later bump once this builds).
- **Website address** `https://askargus.app` (`APP_URL`).
- **Look:** dark only. Background `#08080a`, card `#0e0e11`, muted `#131316`, accent `#1b1b20`, foreground `#ece6dc`, muted text `#8f8b93`, border `#ece6dc` at 10 %. Risk colours: safe `#5ed3b0`, clear `#9cb8b0`, low `#f5c451`, suspicious `#ff9f4d`, high `#ff5d6c`, unknown `#8f8b93`. Iris gradient `#6d6bff` → `#a66bff` → `#ff8a7a`. Archivo font (OFL, bundled). English only.
- **Level words** exactly as the website's `levelMeta`: SAFE+verified "Safe", SAFE "No red flags", LOW/MODERATE "Low risk", SUSPICIOUS "Suspicious", HIGH RISK "High risk", anything else "Unverified".
- **Secrets:** never commit or print them. The signing key and its passwords live in `%USERPROFILE%\.argus\` (outside the repo). `SUPABASE_SECRET_KEY` is set by the user on Vercel only. The Supabase URL, publishable key and Google web client ID are public (every visitor's browser gets them) and may be committed in `android/config.properties`.
- **No contacts access, no SMS permission** in the main app.
- **Phase 1 onboarding is Welcome → Sign in (or skip).** The spec's "Choose your protection" switches and the battery step arrive with the first background protection (Phase 2): showing switches for protections that don't exist yet would break the honesty rule. Home lists them under "Coming to Argus".
- **Git:** work on `main` (the user's choice); **every push and every GitHub release needs the user's go-ahead**. New files use LF line endings; files already using CRLF (e.g. `web/src/proxy.ts`) keep CRLF — edit them with the Edit tool, not `sed`.
- **Windows:** build tools run in PowerShell (`gradlew.bat`, `sdkmanager.bat`); tools live in `%USERPROFILE%\.argus-tools\`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **The free engine is asleep** (Render): the first check returns 502 or times out → the app shows "Argus's checker is waking up. Try again in a moment." with Try again, never a verdict. *Test: `ArgusApiTest.wakingEngineMessage` (Task 4) and `ScanFlowTest.failureKeepsInputForRetry` (Task 12).*
2. **No internet:** requests throw → "Couldn't reach Argus. Check your connection." *Test: `ArgusApiTest.offlineMessage` (Task 4).*
3. **Session revoked elsewhere** (refresh token rejected): the app signs out cleanly, the UI shows signed-out state and asks to sign in; nothing crashes. *Test: `ArgusApiTest.rejectedRefreshSignsOut` (Task 4).*
4. **Invite misuse:** the inviter opening their own link, an expired or already-used code, or a garbage code → a clear message and no family link. *Tests: SQL checks in Task 7 and `family-invite.test.ts` (`isInviteCode`).*
5. **Odd input:** an empty share, a 50,000-character share, an image with no words and no QR code → clear messages, no crash. *Tests: `ShareInputTest.capsLength` (Task 3), `ScanFlowTest.imageWithNothingInIt` (Task 12), `app-scan.test.ts` (`parseScanBody`, Task 5).*

---

## File Structure

**Android (`android/`)**

| File | Responsibility |
|---|---|
| `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradle/libs.versions.toml` | Gradle setup and pinned versions |
| `config.properties` | Public config: app URL, Supabase URL + publishable key, Google web client ID |
| `tools/env.ps1` | Sets `JAVA_HOME`/`ANDROID_HOME` for builds |
| `README.md` | How to build, sign, and back up the key |
| `app/build.gradle.kts` | App module: SDK levels, BuildConfig, signing from `%USERPROFILE%\.argus\keystore.properties`, dependencies |
| `app/src/main/AndroidManifest.xml` | Activity, permissions, share and App Link filters |
| `app/src/main/java/app/askargus/core/*` | Pure logic (unit-tested): `Levels`, `Kinds`, `Qr`, `Links`, `Versions`, `ShareInput`, `Nonce`, `OcrText`, `Money`, `TimeAgo`, `Gaze`, `Verdict` models, `IncomingParser`, `HandoffPlan`, `UpdateDecision` |
| `app/src/main/java/app/askargus/net/*` | `ArgusJson`, `Session`/stores, `SupabaseAuth`, `Account`, `ArgusApi` + models, `EncryptedSessionStore`, `KeystoreCipher` |
| `app/src/main/java/app/askargus/data/*` | `ActivityDb` (Room), `Prefs` (DataStore) |
| `app/src/main/java/app/askargus/scan/*` | `ScanFlow` (pure), `ScanState`, `Checker` |
| `app/src/main/java/app/askargus/read/*` | `ImageReader` (ML Kit), `QrAnalyzer` (camera frames) |
| `app/src/main/java/app/askargus/web/WebPages.kt` | Handoff + Trusted Web Activity |
| `app/src/main/java/app/askargus/work/*` | `Notifications`, `UpdateCheckWorker` |
| `app/src/main/java/app/askargus/ui/**` | Theme, components (eye, dial, pills, cards), screens, navigation, view models |
| `app/src/main/java/app/askargus/{ArgusApp,AppContainer,MainActivity,Host}.kt` | App wiring |
| `app/src/test/java/app/askargus/**` | JVM unit tests |

**Website (`web/src/`)**

| File | Responsibility |
|---|---|
| `lib/app-auth.ts` | Bearer-token Supabase client for app requests |
| `lib/app-caps.ts`, `lib/rate-limit.ts` (+`appLimitKey`) | Per-account daily caps |
| `lib/scan-core.ts` | The scan pipeline shared by the Scan page and the app |
| `lib/app-scan.ts` | Validating the app's scan request body |
| `lib/handoff.ts` | Building the one-time sign-in URL |
| `lib/family-invite.ts` | Invite codes: create, hash, validate, link |
| `lib/app-release.ts` | Picking the newest Android release from GitHub |
| `app/api/app/{scan,handoff,latest}/route.ts`, `app/api/app/family/**` | App endpoints |
| `app/app/page.tsx`, `app/app/join/[code]/{page,actions}.tsx|ts` | Download page, join page |
| `public/.well-known/assetlinks.json` | Proves the app belongs to askargus.app |
| `supabase/migrations/20260930120000_family_links.sql` | Family invites and links |

---

### Task 1: Install the Android build toolchain (no admin)

**Files:** none in the repo (tools go to `%USERPROFILE%\.argus-tools\`).

- [ ] **Step 1: Download and unpack JDK 17 (Temurin)**

Run (PowerShell):
```powershell
$ProgressPreference = 'SilentlyContinue'
$tools = "$env:USERPROFILE\.argus-tools"; New-Item -ItemType Directory -Force $tools | Out-Null
Invoke-WebRequest "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk" -OutFile "$tools\jdk17.zip"
Expand-Archive "$tools\jdk17.zip" -DestinationPath "$tools\jdk-tmp" -Force
Move-Item (Get-ChildItem "$tools\jdk-tmp" -Directory | Select-Object -First 1).FullName "$tools\jdk-17"
Remove-Item "$tools\jdk17.zip", "$tools\jdk-tmp" -Recurse -Force
& "$tools\jdk-17\bin\java.exe" -version
```
Expected: `openjdk version "17.0.` …

- [ ] **Step 2: Download the Android command-line tools**

```powershell
$ProgressPreference = 'SilentlyContinue'
$tools = "$env:USERPROFILE\.argus-tools"
$page = (Invoke-WebRequest "https://developer.android.com/studio" -UseBasicParsing).Content
$url = [regex]::Match($page, 'https://dl\.google\.com/android/repository/commandlinetools-win-\d+_latest\.zip').Value
$url
Invoke-WebRequest $url -OutFile "$tools\cmdline.zip"
Expand-Archive "$tools\cmdline.zip" -DestinationPath "$tools\cmdline-tmp" -Force
New-Item -ItemType Directory -Force "$tools\android-sdk\cmdline-tools" | Out-Null
Move-Item "$tools\cmdline-tmp\cmdline-tools" "$tools\android-sdk\cmdline-tools\latest"
Remove-Item "$tools\cmdline.zip", "$tools\cmdline-tmp" -Recurse -Force
```
Expected: a `https://dl.google.com/android/repository/commandlinetools-win-…_latest.zip` URL is printed and `$tools\android-sdk\cmdline-tools\latest\bin\sdkmanager.bat` exists.

- [ ] **Step 3: Install the SDK packages and accept licences**

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.argus-tools\jdk-17"
$env:ANDROID_HOME = "$env:USERPROFILE\.argus-tools\android-sdk"
$sdk = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
(1..30 | ForEach-Object { "y" }) | & $sdk --licenses | Out-Null
& $sdk "platform-tools" "platforms;android-35" "build-tools;35.0.0"
& $sdk --list_installed
```
Expected: the list shows `build-tools;35.0.0`, `platform-tools`, `platforms;android-35`.

- [ ] **Step 4: Download Gradle 8.11.1 (only used once, to create the wrapper)**

```powershell
$ProgressPreference = 'SilentlyContinue'
$tools = "$env:USERPROFILE\.argus-tools"
Invoke-WebRequest "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" -OutFile "$tools\gradle.zip"
Expand-Archive "$tools\gradle.zip" -DestinationPath $tools -Force
Remove-Item "$tools\gradle.zip"
$env:JAVA_HOME = "$tools\jdk-17"; & "$tools\gradle-8.11.1\bin\gradle.bat" --version
```
Expected: `Gradle 8.11.1`.

No commit (nothing in the repo changed).

---

### Task 2: Android project skeleton, signing key, and the first tested logic

**Files:**
- Create: `android/.gitignore`, `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/libs.versions.toml`, `android/config.properties`, `android/tools/env.ps1`, `android/app/build.gradle.kts`, `android/app/proguard-rules.pro`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/values/strings.xml`, `android/app/src/main/java/app/askargus/MainActivity.kt`, `android/app/src/main/java/app/askargus/core/Levels.kt`
- Generated: `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.{jar,properties}`
- Test: `android/app/src/test/java/app/askargus/core/LevelsTest.kt`
- Outside the repo: `%USERPROFILE%\.argus\argus-release.jks`, `%USERPROFILE%\.argus\keystore.properties`

**Interfaces:**
- Produces: `Risk` enum `{SAFE, CLEAR, LOW, SUSPICIOUS, HIGH, UNKNOWN}`; `data class LevelInfo(label: String, risk: Risk)`; `Levels.meta(level: String, verified: Boolean): LevelInfo`; `Levels.levelFor(score: Int): String`; `Kinds.label(kind: String): String`; BuildConfig fields `APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_WEB_CLIENT_ID`; the release key's SHA-1 and SHA-256 fingerprints (used by Tasks 8 and 17).

- [ ] **Step 1: Create the Gradle settings and generate the wrapper**

`android/.gitignore`:
```
local.properties
.gradle/
build/
*.jks
*.keystore
.idea/
captures/
```

`android/settings.gradle.kts`:
```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "argus-android"
include(":app")
```

Generate the wrapper before the app module exists, so configuring the build needs nothing else: write the file
above **without** its last line (`include(":app")`) first, then run:
```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"
$env:JAVA_HOME = "$env:USERPROFILE\.argus-tools\jdk-17"
& "$env:USERPROFILE\.argus-tools\gradle-8.11.1\bin\gradle.bat" wrapper --gradle-version 8.11.1 --distribution-type bin
Get-ChildItem gradlew*, gradle\wrapper
```
Expected: `gradlew`, `gradlew.bat`, `gradle\wrapper\gradle-wrapper.jar` and `gradle-wrapper.properties` exist. Then add
`include(":app")` back as the last line of `settings.gradle.kts` with the Edit tool.

- [ ] **Step 2: Add the build files**

`android/build.gradle.kts`:
```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
```

`android/gradle.properties`:
```
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

`android/gradle/libs.versions.toml`:
```toml
[versions]
agp = "8.7.3"
kotlin = "2.1.0"
ksp = "2.1.0-1.0.29"
coreKtx = "1.15.0"
activityCompose = "1.9.3"
lifecycle = "2.8.7"
navigationCompose = "2.8.5"
composeBom = "2024.12.01"
room = "2.6.1"
work = "2.10.0"
datastore = "1.1.1"
okhttp = "4.12.0"
serialization = "1.7.3"
coroutines = "1.9.0"
camerax = "1.4.1"
mlkitBarcode = "17.3.0"
mlkitDevanagari = "16.0.1"
credentials = "1.3.0"
googleid = "1.1.1"
browserHelper = "2.5.0"
junit = "4.13.2"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-compose = { group = "androidx.lifecycle", name = "lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-material-icons-core = { group = "androidx.compose.material", name = "material-icons-core" }
androidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
androidx-room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
androidx-room-compiler = { group = "androidx.room", name = "room-compiler", version.ref = "room" }
androidx-work-runtime-ktx = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
okhttp-mockwebserver = { group = "com.squareup.okhttp3", name = "mockwebserver", version.ref = "okhttp" }
kotlinx-serialization-json = { group = "org.jetbrains.kotlinx", name = "kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-coroutines-play-services = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-play-services", version.ref = "coroutines" }
kotlinx-coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }
androidx-camera-camera2 = { group = "androidx.camera", name = "camera-camera2", version.ref = "camerax" }
androidx-camera-lifecycle = { group = "androidx.camera", name = "camera-lifecycle", version.ref = "camerax" }
androidx-camera-view = { group = "androidx.camera", name = "camera-view", version.ref = "camerax" }
mlkit-barcode = { group = "com.google.mlkit", name = "barcode-scanning", version.ref = "mlkitBarcode" }
mlkit-text-devanagari = { group = "com.google.mlkit", name = "text-recognition-devanagari", version.ref = "mlkitDevanagari" }
androidx-credentials = { group = "androidx.credentials", name = "credentials", version.ref = "credentials" }
androidx-credentials-play-services = { group = "androidx.credentials", name = "credentials-play-services-auth", version.ref = "credentials" }
googleid = { group = "com.google.android.libraries.identity.googleid", name = "googleid", version.ref = "googleid" }
androidbrowserhelper = { group = "com.google.androidbrowserhelper", name = "androidbrowserhelper", version.ref = "browserHelper" }
junit = { group = "junit", name = "junit", version.ref = "junit" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
```

`android/tools/env.ps1`:
```powershell
# Dot-source before building: . .\tools\env.ps1  (tools installed by the Phase 1 plan, Task 1)
$env:JAVA_HOME = "$env:USERPROFILE\.argus-tools\jdk-17"
$env:ANDROID_HOME = "$env:USERPROFILE\.argus-tools\android-sdk"
$sdkDir = $env:ANDROID_HOME -replace '\\', '\\'
"sdk.dir=$sdkDir" | Set-Content -Encoding ascii "$PSScriptRoot\..\local.properties"
```

Create `android/config.properties` from the website's public values (never from secrets):
```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main"
$env_ = Get-Content web\.env.local
$url = ($env_ | Select-String '^NEXT_PUBLIC_SUPABASE_URL=(.*)$').Matches[0].Groups[1].Value.Trim()
$key = ($env_ | Select-String '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)$').Matches[0].Groups[1].Value.Trim()
$gid = ($env_ | Select-String '^GOOGLE_SIGNIN_CLIENT_ID=(.*)$').Matches[0].Groups[1].Value.Trim()
@"
# Public settings only: the same values every visitor's browser gets from askargus.app. Never put secrets here.
appUrl=https://askargus.app
supabaseUrl=$url
supabasePublishableKey=$key
googleWebClientId=$gid
"@ | Set-Content -Encoding ascii android\config.properties
Select-String -Path android\config.properties -Pattern '^(appUrl|supabaseUrl|googleWebClientId)='
```
Expected: three lines printed (appUrl, supabaseUrl, googleWebClientId); the publishable key line exists but isn't printed. Check that it starts with `sb_publishable_` (a public key): `(Select-String -Path android\config.properties -Pattern '^supabasePublishableKey=sb_publishable_').Count` → `1`. If it's `0`, stop: the website uses a different key type; ask the user.

`android/app/build.gradle.kts`:
```kotlin
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
        versionCode = 1
        versionName = "0.1.0"
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
    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
```

`android/app/proguard-rules.pro`: an empty file (minify is off in Phase 1).

`android/app/src/main/res/values/strings.xml`:
```xml
<resources>
    <string name="app_name">Argus</string>
</resources>
```

`android/app/src/main/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="false"
        android:label="@string/app_name"
        android:theme="@android:style/Theme.Material.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`android/app/src/main/java/app/askargus/MainActivity.kt`:
```kotlin
package app.askargus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Text("Argus") }
    }
}
```

- [ ] **Step 3: Write the failing test for the level words**

`android/app/src/test/java/app/askargus/core/LevelsTest.kt`:
```kotlin
package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Test

class LevelsTest {
    @Test fun safeNeedsPositiveEvidence() {
        assertEquals(LevelInfo("Safe", Risk.SAFE), Levels.meta("SAFE", verified = true))
        assertEquals(LevelInfo("No red flags", Risk.CLEAR), Levels.meta("SAFE", verified = false))
    }

    @Test fun otherLevelsUseTheWebsitesWords() {
        assertEquals(LevelInfo("Low risk", Risk.LOW), Levels.meta("LOW/MODERATE", false))
        assertEquals(LevelInfo("Suspicious", Risk.SUSPICIOUS), Levels.meta("SUSPICIOUS", false))
        assertEquals(LevelInfo("High risk", Risk.HIGH), Levels.meta("HIGH RISK", true))
        assertEquals(LevelInfo("Unverified", Risk.UNKNOWN), Levels.meta("UNVERIFIED", false))
        assertEquals(LevelInfo("Unverified", Risk.UNKNOWN), Levels.meta("something new", false))
    }

    @Test fun scoresMapToTheWebsitesBands() {
        assertEquals("SAFE", Levels.levelFor(29))
        assertEquals("LOW/MODERATE", Levels.levelFor(30))
        assertEquals("SUSPICIOUS", Levels.levelFor(60))
        assertEquals("HIGH RISK", Levels.levelFor(80))
    }

    @Test fun kindsHavePlainNames() {
        assertEquals("Link", Kinds.label("url"))
        assertEquals("Message", Kinds.label("text"))
        assertEquals("Phone", Kinds.label("phone"))
        assertEquals("Email", Kinds.label("email"))
        assertEquals("UPI code", Kinds.label("upi"))
        assertEquals("Check", Kinds.label("unknown-kind"))
    }
}
```

- [ ] **Step 4: Run it to see it fail**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"; . .\tools\env.ps1
.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.core.LevelsTest"
```
Expected: compilation FAILS with `Unresolved reference: Levels` (the first run also downloads Gradle, AGP and the libraries; allow several minutes).

- [ ] **Step 5: Implement the level words**

`android/app/src/main/java/app/askargus/core/Levels.kt`:
```kotlin
package app.askargus.core

enum class Risk { SAFE, CLEAR, LOW, SUSPICIOUS, HIGH, UNKNOWN }

data class LevelInfo(val label: String, val risk: Risk)

/** The website's words for a verdict (web/src/lib/format.ts): "Safe" only with positive evidence. */
object Levels {
    fun meta(level: String, verified: Boolean): LevelInfo = when (level) {
        "SAFE" -> if (verified) LevelInfo("Safe", Risk.SAFE) else LevelInfo("No red flags", Risk.CLEAR)
        "LOW/MODERATE" -> LevelInfo("Low risk", Risk.LOW)
        "SUSPICIOUS" -> LevelInfo("Suspicious", Risk.SUSPICIOUS)
        "HIGH RISK" -> LevelInfo("High risk", Risk.HIGH)
        else -> LevelInfo("Unverified", Risk.UNKNOWN)
    }

    fun levelFor(score: Int): String = when {
        score >= 80 -> "HIGH RISK"
        score >= 60 -> "SUSPICIOUS"
        score >= 30 -> "LOW/MODERATE"
        else -> "SAFE"
    }
}

object Kinds {
    fun label(kind: String): String = when (kind) {
        "url" -> "Link"
        "text" -> "Message"
        "phone" -> "Phone"
        "email" -> "Email"
        "file" -> "File"
        "call" -> "Call"
        "upi" -> "UPI code"
        else -> "Check"
    }
}
```

- [ ] **Step 6: Run the test to see it pass, and build a debug APK**

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.core.LevelsTest" :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`; `app\build\outputs\apk\debug\app-debug.apk` exists.

- [ ] **Step 7: Create the release signing key (outside the repo, never overwritten)**

```powershell
$dir = "$env:USERPROFILE\.argus"; New-Item -ItemType Directory -Force $dir | Out-Null
if (Test-Path "$dir\argus-release.jks") { "Signing key already exists: keeping it." } else {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
  & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore "$dir\argus-release.jks" -storetype PKCS12 -alias argus `
    -keyalg RSA -keysize 4096 -validity 36500 -storepass $pw -keypass $pw -dname "CN=Argus, O=Argus, C=IN" | Out-Null
  @"
storeFile=$($dir -replace '\\', '/')/argus-release.jks
storePassword=$pw
keyAlias=argus
keyPassword=$pw
"@ | Set-Content -Encoding ascii "$dir\keystore.properties"
  "Signing key created."
}
$pw = ((Get-Content "$dir\keystore.properties") -match '^storePassword=' -replace '^storePassword=', '')
& "$env:JAVA_HOME\bin\keytool.exe" -list -v -keystore "$dir\argus-release.jks" -storepass $pw | Select-String 'SHA1:|SHA256:'
```
Expected: `SHA1: …` and `SHA256: …` fingerprints printed (public; record both in the ledger — Task 8 needs SHA-256, Task 17 needs SHA-1). The password is never printed.

- [ ] **Step 8: Build a signed release APK**

```powershell
.\gradlew.bat :app:assembleRelease
& "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk | Select-String 'SHA-256'
```
Expected: `BUILD SUCCESSFUL`, and the printed certificate SHA-256 digest equals Step 7's SHA256 (apksigner prints it lowercase without colons).

- [ ] **Step 9: Commit**

PowerShell's `Set-Content` wrote `config.properties` with CRLF endings; the repo uses LF for new files (only
`gradlew.bat` keeps CRLF, as Windows batch files need):
```bash
cd /c/Users/GYAN/Downloads/ARGUS-main
python -c "from pathlib import Path; [p.write_bytes(p.read_bytes().replace(b'\r\n', b'\n')) for p in map(Path, ['android/config.properties', 'android/tools/env.ps1', 'android/settings.gradle.kts'])]"
git add android/.gitignore android/settings.gradle.kts android/build.gradle.kts android/gradle.properties android/gradle android/gradlew android/gradlew.bat android/config.properties android/tools/env.ps1 android/app/build.gradle.kts android/app/proguard-rules.pro android/app/src
git status --short android | grep -v '^A' ; git commit -m "feat(android): project skeleton, release signing, level words

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
Expected: no `local.properties`, `build/` or `.jks` staged.

---

### Task 3: Pure app logic (QR/UPI, links, versions, shares, OCR text, money, time, gaze, verdicts, intents, handoff and update decisions)

All of this is plain Kotlin with no Android classes, so it runs as JVM unit tests.

**Files:**
- Create in `android/app/src/main/java/app/askargus/core/`: `Qr.kt`, `Links.kt`, `Versions.kt`, `ShareInput.kt`, `Nonce.kt`, `OcrText.kt`, `Money.kt`, `TimeAgo.kt`, `Gaze.kt`, `Verdict.kt`, `IncomingParser.kt`, `HandoffPlan.kt`, `UpdateDecision.kt`
- Test in `android/app/src/test/java/app/askargus/core/`: `QrTest.kt`, `TextHelpersTest.kt`, `VerdictTest.kt`, `DecisionsTest.kt`

**Interfaces:**
- Produces:
  - `sealed interface QrPayload { Upi(mandate: Boolean, payee: String, name: String?, amount: String?, note: String?); Url(url: String); Phone(number: String); Text(text: String) }`, `Qr.parse(value: String): QrPayload`
  - `Links.first(text: String): String?`
  - `Versions.isNewer(candidate: String, current: String): Boolean`
  - `ShareInput.combine(text: String?, subject: String?): String` (max 20,000 chars)
  - `Nonce.raw(): String`, `Nonce.sha256Hex(s: String): String`
  - `OcrText.tidy(text: String): String`
  - `Money.rupees(amount: String): String`
  - `TimeAgo.format(now: Long, at: Long, zone: TimeZone = TimeZone.getDefault()): String`
  - `Gaze.pupilOffset(cx, cy, tx, ty, maxOffset, reach = 240f): Pair<Float, Float>`, `Gaze.blinkClosure(t: Float): Float`
  - `@Serializable Signal(source, status, score, weight = 1.0, summary, authoritative = false, trust = 0.0)`, `@Serializable Verdict(kind, subject, score, level, threatType ("threat_type"), signals, recommendation, scannedAt ("scanned_at"), verified = false)`, `Reasons.top(v, count = 3): List<String>`, `Reasons.answered(v): Pair<Int, Int>`, `Reasons.subtitle(v): String`
  - `sealed interface Incoming { Text(text); Image(uri); Join(code) }`, `IncomingParser.parse(action, type, text, subject, stream, data): Incoming?`
  - `HandoffPlan.needsHandoff(userId: String?, webSignedInFor: String?, force: Boolean = false): Boolean`, `HandoffPlan.plainUrl(appUrl: String, path: String): String`
  - `UpdateDecision.Outcome(available: String?, notify: Boolean)`, `UpdateDecision.decide(latest: String?, current: String, notified: String?): Outcome`

- [ ] **Step 1: Write the failing tests**

`QrTest.kt` (the same cases as `web/src/lib/qr.test.ts`):
```kotlin
package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Test

class QrTest {
    @Test fun readsAUpiPaymentCode() {
        assertEquals(
            QrPayload.Upi(false, "refund.desk@ybl", "KBC Prize Team", "4999.00", "Claim your prize"),
            Qr.parse("upi://pay?pa=refund.desk@ybl&pn=KBC%20Prize%20Team&am=4999.00&cu=INR&tn=Claim%20your%20prize"),
        )
    }

    @Test fun spotsAutopayMandates() {
        assertEquals(QrPayload.Upi(true, "shop@okaxis", "Shop", "999", null), Qr.parse("UPI://MANDATE?pa=shop@okaxis&pn=Shop&am=999"))
    }

    @Test fun leavesOutWhatAUpiCodeDoesNotSay() {
        assertEquals(QrPayload.Upi(false, "chai.stall@paytm", null, null, null), Qr.parse("upi://pay?pa=chai.stall@paytm"))
    }

    @Test fun upiWithoutPayeeIsPlainText() {
        assertEquals(QrPayload.Text("upi://pay?pn=Nobody"), Qr.parse("upi://pay?pn=Nobody"))
    }

    @Test fun linksGoToALinkCheck() {
        assertEquals(QrPayload.Url("https://paytm-kyc-update.example/login"), Qr.parse("https://paytm-kyc-update.example/login"))
        assertEquals(QrPayload.Url("https://www.example.com/offer"), Qr.parse("  www.example.com/offer "))
    }

    @Test fun numbersAndTexts() {
        assertEquals(QrPayload.Phone("+919876543210"), Qr.parse("tel:+919876543210"))
        assertEquals(
            QrPayload.Text("Your KYC expires today, call now\n+919876543210"),
            Qr.parse("SMSTO:+919876543210:Your KYC expires today, call now"),
        )
        assertEquals(QrPayload.Text("Table 4, ask for the menu"), Qr.parse("Table 4, ask for the menu"))
    }

    @Test fun malformedPercentSignsDoNotCrash() {
        assertEquals(QrPayload.Upi(false, "a@b", "100%", null, null), Qr.parse("upi://pay?pa=a@b&pn=100%"))
    }
}
```

`TextHelpersTest.kt`:
```kotlin
package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class TextHelpersTest {
    @Test fun findsTheFirstLinkAndDropsSentencePunctuation() {
        assertEquals("https://evil.example/login", Links.first("Check this: https://evil.example/login."))
        assertEquals("www.site.com", Links.first("go to www.site.com, now"))
        assertNull(Links.first("no link here"))
    }

    @Test fun comparesVersions() {
        assertTrue(Versions.isNewer("0.2.0", "0.1.0"))
        assertTrue(Versions.isNewer("android-v0.10.0", "0.9.9"))
        assertTrue(Versions.isNewer("1.0", "0.9.9"))
        assertFalse(Versions.isNewer("0.1.0", "0.1.0"))
        assertFalse(Versions.isNewer("0.1.0", "0.2.0"))
    }

    @Test fun sharedTextWins_subjectIsTheFallback() {
        assertEquals("Your parcel is held", ShareInput.combine("  Your parcel is held ", "Messages"))
        assertEquals("Only a title", ShareInput.combine(null, "Only a title"))
        assertEquals("", ShareInput.combine("  ", null))
    }

    @Test fun capsLength() {
        assertEquals(20_000, ShareInput.combine("x".repeat(50_000), null).length)
    }

    @Test fun noncesAreRandomAndHashedLikeGoogleExpects() {
        val a = Nonce.raw()
        assertEquals(32, a.length)
        assertTrue(a.matches(Regex("[A-Za-z0-9_-]+")))
        assertNotEquals(a, Nonce.raw())
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Nonce.sha256Hex("abc"))
    }

    @Test fun tidiesScreenshotText() {
        assertEquals(
            "Dear customer,\n\nyour KYC expires today\n\nCall 98765 43210",
            OcrText.tidy("  Dear  customer,\n\n\n\nyour KYC   expires today \n  \n Call 98765 43210 \n"),
        )
    }

    @Test fun formatsRupees() {
        assertEquals("₹4,999.00", Money.rupees("4999"))
        assertEquals("abc", Money.rupees("abc"))
    }

    @Test fun saysHowLongAgo() {
        val now = 1_790_000_000_000L
        assertEquals("just now", TimeAgo.format(now, now - 20_000))
        assertEquals("5 min ago", TimeAgo.format(now, now - 5 * 60_000))
        assertEquals("3 h ago", TimeAgo.format(now, now - 3 * 3_600_000))
        val sep28 = 1_790_589_600_000L // 2026-09-28T10:00:00Z
        assertEquals("28 Sep", TimeAgo.format(sep28 + 3 * 86_400_000L, sep28, TimeZone.getTimeZone("UTC")))
    }

    @Test fun pupilSlidesTowardTheTouchAndStopsAtItsLimit() {
        assertEquals(0f to 0f, Gaze.pupilOffset(10f, 10f, 10f, 10f, 4f))
        val (fx, fy) = Gaze.pupilOffset(0f, 0f, 1000f, 0f, 4f, reach = 240f)
        assertEquals(4f, fx, 0.001f); assertEquals(0f, fy, 0.001f)
        val (nx, _) = Gaze.pupilOffset(0f, 0f, 120f, 0f, 4f, reach = 240f)
        assertEquals(2f, nx, 0.001f)
    }

    @Test fun blinksCloseInTheMiddle() {
        assertEquals(0f, Gaze.blinkClosure(0f), 0f)
        assertEquals(0f, Gaze.blinkClosure(1f), 0f)
        assertEquals(1f, Gaze.blinkClosure(0.5f), 0.0001f)
    }
}
```

`VerdictTest.kt`:
```kotlin
package app.askargus.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class VerdictTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val sample = """
        {"kind":"url","subject":"http://paypal-security-alert.net/verify","score":96,"level":"HIGH RISK",
         "threat_type":"Phishing","recommendation":"High risk.","scanned_at":"2026-09-30T10:00:00Z","verified":false,
         "signals":[
          {"source":"Heuristics","status":"suspicious","score":60,"weight":1.0,"summary":"Mentions PayPal","authoritative":false,"evidence":{"x":1}},
          {"source":"Phishing.Database","status":"malicious","score":95,"weight":1.5,"summary":"Listed as phishing","authoritative":true,"evidence":{}},
          {"source":"VirusTotal","status":"unavailable","score":0,"weight":0,"summary":"Not configured","authoritative":false,"evidence":{}},
          {"source":"Site reputation","status":"clean","score":0,"weight":0.5,"summary":"Unknown site","authoritative":false,"evidence":{}}
         ]}
    """.trimIndent()

    @Test fun readsTheEnginesVerdict() {
        val v = json.decodeFromString(Verdict.serializer(), sample)
        assertEquals(96, v.score)
        assertEquals("Phishing", v.threatType)
        assertEquals(4, v.signals.size)
    }

    @Test fun reasonsAreTheFlaggedSignalsStrongestFirst() {
        val v = json.decodeFromString(Verdict.serializer(), sample)
        assertEquals(listOf("Listed as phishing", "Mentions PayPal"), Reasons.top(v))
        assertEquals(3 to 4, Reasons.answered(v))
        assertEquals("Phishing", Reasons.subtitle(v))
    }

    @Test fun subtitleForCleanVerdicts() {
        val clean = Verdict("text", "hi", 0, "SAFE", "None", emptyList(), "", "", verified = false)
        assertEquals("Nothing suspicious found", Reasons.subtitle(clean))
        assertEquals("Positive evidence it's legitimate", Reasons.subtitle(clean.copy(verified = true)))
    }
}
```

`DecisionsTest.kt`:
```kotlin
package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DecisionsTest {
    private val send = "android.intent.action.SEND"
    private val view = "android.intent.action.VIEW"

    @Test fun sharedTextBecomesAThingToCheck() {
        assertEquals(Incoming.Text("Pay Rs 25 now"), IncomingParser.parse(send, "text/plain", "Pay Rs 25 now", null, null, null))
        assertEquals(Incoming.Text("Title only"), IncomingParser.parse(send, "text/plain", null, "Title only", null, null))
        assertNull(IncomingParser.parse(send, "text/plain", "  ", null, null, null))
    }

    @Test fun sharedImagesNeedTheirFile() {
        assertEquals(Incoming.Image("content://media/1"), IncomingParser.parse(send, "image/png", null, null, "content://media/1", null))
        assertNull(IncomingParser.parse(send, "image/jpeg", null, null, null, null))
    }

    @Test fun familyInviteLinksOpenTheJoinScreen() {
        val code = "AbCdEfGhIjKlMnOpQrStUvWx"
        assertEquals(Incoming.Join(code), IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/$code"))
        assertEquals(Incoming.Join(code), IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/$code/"))
        assertNull(IncomingParser.parse(view, null, null, null, null, "https://askargus.app/app/join/short"))
        assertNull(IncomingParser.parse(view, null, null, null, null, "https://evil.example/app/join/$code"))
        assertNull(IncomingParser.parse("android.intent.action.MAIN", null, null, null, null, null))
    }

    @Test fun websiteSignInIsOnlyHandedOverWhenNeeded() {
        assertTrue(HandoffPlan.needsHandoff("u1", null))
        assertTrue(HandoffPlan.needsHandoff("u1", "u2"))
        assertFalse(HandoffPlan.needsHandoff("u1", "u1"))
        assertTrue(HandoffPlan.needsHandoff("u1", "u1", force = true))
        assertFalse(HandoffPlan.needsHandoff(null, null, force = true))
        assertEquals("https://askargus.app/history", HandoffPlan.plainUrl("https://askargus.app/", "history"))
        assertEquals("https://askargus.app/scan/abc", HandoffPlan.plainUrl("https://askargus.app", "/scan/abc"))
    }

    @Test fun updatesAreOfferedOnceAndNotifiedOnce() {
        assertEquals(UpdateDecision.Outcome(null, false), UpdateDecision.decide(null, "0.1.0", null))
        assertEquals(UpdateDecision.Outcome(null, false), UpdateDecision.decide("0.1.0", "0.1.0", null))
        assertEquals(UpdateDecision.Outcome("0.2.0", true), UpdateDecision.decide("0.2.0", "0.1.0", null))
        assertEquals(UpdateDecision.Outcome("0.2.0", false), UpdateDecision.decide("0.2.0", "0.1.0", "0.2.0"))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"; . .\tools\env.ps1
.\gradlew.bat :app:testDebugUnitTest
```
Expected: compilation FAILS with unresolved references (`Qr`, `Links`, `Versions`, …).

- [ ] **Step 3: Implement**

`Qr.kt`:
```kotlin
package app.askargus.core

import java.net.URLDecoder

/** What a QR code holds, sorted by where it goes (a port of web/src/lib/qr.ts): UPI codes get their own warning,
 *  links a link check, numbers a phone check, anything else a text check. */
sealed interface QrPayload {
    data class Upi(val mandate: Boolean, val payee: String, val name: String?, val amount: String?, val note: String?) : QrPayload
    data class Url(val url: String) : QrPayload
    data class Phone(val number: String) : QrPayload
    data class Text(val text: String) : QrPayload
}

object Qr {
    private val UPI = Regex("""^upi://(pay|mandate)\b[^?]*\?(.*)$""", RegexOption.IGNORE_CASE)
    private val WWW = Regex("""^www\.\S+$""", RegexOption.IGNORE_CASE)
    private val TEL = Regex("""^tel:([+\d][\d\s()-]*)$""", RegexOption.IGNORE_CASE)
    private val SMS = Regex("""^smsto:([^:]*):([\s\S]*)$""", RegexOption.IGNORE_CASE)
    private val PHONE_JUNK = Regex("""[\s()-]""")

    fun parse(value: String): QrPayload {
        val raw = value.trim()
        upi(raw)?.let { return it }
        if (raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true)) return QrPayload.Url(raw)
        if (WWW.matches(raw)) return QrPayload.Url("https://$raw")
        TEL.find(raw)?.let { return QrPayload.Phone(it.groupValues[1].replace(PHONE_JUNK, "")) }
        SMS.find(raw)?.let { m ->
            return QrPayload.Text(listOf(m.groupValues[2].trim(), m.groupValues[1].trim()).filter { it.isNotEmpty() }.joinToString("\n"))
        }
        return QrPayload.Text(raw)
    }

    private fun upi(raw: String): QrPayload.Upi? {
        val m = UPI.find(raw) ?: return null
        val params = queryParams(m.groupValues[2])
        val payee = params["pa"]?.trim().orEmpty()
        if (payee.isEmpty()) return null
        fun field(key: String) = params[key]?.trim()?.ifEmpty { null }
        return QrPayload.Upi(m.groupValues[1].equals("mandate", ignoreCase = true), payee, field("pn"), field("am"), field("tn"))
    }

    /** Like URLSearchParams: "+" is a space, %XX is decoded (left as is when malformed), the first value wins. */
    private fun queryParams(query: String): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for (part in query.split('&')) {
            if (part.isEmpty()) continue
            val i = part.indexOf('=')
            val key = decode(if (i >= 0) part.substring(0, i) else part)
            if (key !in out) out[key] = decode(if (i >= 0) part.substring(i + 1) else "")
        }
        return out
    }

    private fun decode(s: String): String = try {
        URLDecoder.decode(s, "UTF-8")
    } catch (e: IllegalArgumentException) {
        s
    }
}
```

`Links.kt`:
```kotlin
package app.askargus.core

object Links {
    private val LINK = Regex("""(?i)\b(?:https?://|www\.)[^\s<>"']+""")

    /** The first link in some copied text, without trailing sentence punctuation, or null. */
    fun first(text: String): String? = LINK.find(text)?.value?.trimEnd('.', ',', ')', ']', '!', '?', ';', ':', '"', '\'')
}
```

`Versions.kt`:
```kotlin
package app.askargus.core

object Versions {
    /** True when `candidate` ("0.2.0" or a tag like "android-v0.2.0") is newer than `current`. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = parts(candidate)
        val b = parts(current)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun parts(version: String) =
        version.substringAfterLast('v').split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
}
```

`ShareInput.kt`:
```kotlin
package app.askargus.core

object ShareInput {
    const val MAX_LENGTH = 20_000

    /** What another app shared, as one thing to check: its text, or the subject when there's no text. */
    fun combine(text: String?, subject: String?): String =
        (text?.trim().orEmpty().ifEmpty { subject?.trim().orEmpty() }).take(MAX_LENGTH)
}
```

`Nonce.kt`:
```kotlin
package app.askargus.core

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Google sign-in nonces: Google gets the SHA-256 hex, Supabase gets the raw value. */
object Nonce {
    private val random = SecureRandom()

    fun raw(): String {
        val bytes = ByteArray(24)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun sha256Hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
```

`OcrText.kt`:
```kotlin
package app.askargus.core

object OcrText {
    private val SPACES = Regex("[ \\t]+")
    private val BLANK_RUNS = Regex("\n{3,}")

    /** Drops the stray spacing and blank runs a screenshot reader leaves behind (as web/src/lib/image-read.ts). */
    fun tidy(text: String): String = text.split("\n")
        .joinToString("\n") { it.replace(SPACES, " ").trim() }
        .replace(BLANK_RUNS, "\n\n")
        .trim()
}
```

`Money.kt`:
```kotlin
package app.askargus.core

import java.text.NumberFormat
import java.util.Locale

object Money {
    /** "4999" becomes "₹4,999.00"; anything that isn't a number is shown as it is. */
    fun rupees(amount: String): String {
        val n = amount.trim().toBigDecimalOrNull() ?: return amount
        return NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(n)
    }
}
```

`TimeAgo.kt`:
```kotlin
package app.askargus.core

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object TimeAgo {
    fun format(now: Long, at: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val minutes = (now - at).coerceAtLeast(0) / 60_000
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "$minutes min ago"
            minutes < 24 * 60 -> "${minutes / 60} h ago"
            else -> SimpleDateFormat("d MMM", Locale.ENGLISH).apply { timeZone = zone }.format(Date(at))
        }
    }
}
```

`Gaze.kt`:
```kotlin
package app.askargus.core

import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** The watching eye's geometry, as web/src/lib/gaze.ts. */
object Gaze {
    fun pupilOffset(cx: Float, cy: Float, tx: Float, ty: Float, maxOffset: Float, reach: Float = 240f): Pair<Float, Float> {
        val dx = tx - cx
        val dy = ty - cy
        val dist = sqrt(dx * dx + dy * dy)
        if (dist == 0f) return 0f to 0f
        val k = (min(1f, dist / reach) * maxOffset) / dist
        return dx * k to dy * k
    }

    fun blinkClosure(t: Float): Float = if (t <= 0f || t >= 1f) 0f else sin(PI * t).toFloat()
}
```

`Verdict.kt`:
```kotlin
package app.askargus.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Signal(
    val source: String,
    val status: String,
    val score: Int,
    val weight: Double = 1.0,
    val summary: String,
    val authoritative: Boolean = false,
    val trust: Double = 0.0,
)

@Serializable
data class Verdict(
    val kind: String,
    val subject: String,
    val score: Int,
    val level: String,
    @SerialName("threat_type") val threatType: String,
    val signals: List<Signal> = emptyList(),
    val recommendation: String = "",
    @SerialName("scanned_at") val scannedAt: String = "",
    val verified: Boolean = false,
)

object Reasons {
    fun top(verdict: Verdict, count: Int = 3): List<String> = verdict.signals
        .filter { it.status == "malicious" || it.status == "suspicious" }
        .sortedByDescending { it.score * minOf(1.0, it.weight) }
        .take(count)
        .map { it.summary }

    fun answered(verdict: Verdict): Pair<Int, Int> =
        verdict.signals.count { it.status != "unavailable" && it.status != "error" } to verdict.signals.size

    /** The line under the level word, as on the website's verdict card. */
    fun subtitle(verdict: Verdict): String = when {
        verdict.threatType != "None" -> verdict.threatType
        verdict.verified -> "Positive evidence it's legitimate"
        else -> "Nothing suspicious found"
    }
}
```

`IncomingParser.kt`:
```kotlin
package app.askargus.core

/** What another app handed Argus: something shared to check, or a family invite link. */
sealed interface Incoming {
    data class Text(val text: String) : Incoming
    data class Image(val uri: String) : Incoming
    data class Join(val code: String) : Incoming
}

object IncomingParser {
    private val JOIN = Regex("""^https://askargus\.app/app/join/([A-Za-z0-9_-]{16,64})/?(?:[?#].*)?$""")

    fun parse(action: String?, type: String?, text: String?, subject: String?, stream: String?, data: String?): Incoming? =
        when (action) {
            "android.intent.action.SEND" ->
                if (type?.startsWith("image/") == true) stream?.let { Incoming.Image(it) }
                else ShareInput.combine(text, subject).takeIf { it.isNotEmpty() }?.let { Incoming.Text(it) }
            "android.intent.action.VIEW" -> data?.let { JOIN.find(it) }?.let { Incoming.Join(it.groupValues[1]) }
            else -> null
        }
}
```

`HandoffPlan.kt`:
```kotlin
package app.askargus.core

object HandoffPlan {
    /** A fresh website sign-in link is only needed when someone is signed in and the website isn't signed in as them yet. */
    fun needsHandoff(userId: String?, webSignedInFor: String?, force: Boolean = false): Boolean =
        userId != null && (force || webSignedInFor != userId)

    fun plainUrl(appUrl: String, path: String): String =
        appUrl.trimEnd('/') + if (path.startsWith("/")) path else "/$path"
}
```

`UpdateDecision.kt`:
```kotlin
package app.askargus.core

object UpdateDecision {
    data class Outcome(val available: String?, val notify: Boolean)

    /** Offer a newer version; notify about each version only once. */
    fun decide(latest: String?, current: String, notified: String?): Outcome {
        if (latest == null || !Versions.isNewer(latest, current)) return Outcome(null, false)
        return Outcome(latest, notified != latest)
    }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
.\gradlew.bat :app:testDebugUnitTest
```
Expected: `BUILD SUCCESSFUL`, all tests in `LevelsTest`, `QrTest`, `TextHelpersTest`, `VerdictTest`, `DecisionsTest` pass. If `formatsRupees` fails only because the JVM prints a different rupee layout, check the actual string; the phone (ICU) prints `₹4,999.00`; ledger a ruling if you adjust the JVM expectation.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/askargus/core android/app/src/test/java/app/askargus/core
git commit -m "feat(android): QR/UPI reading, share and invite parsing, verdict helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Networking — Supabase sign-in, sessions, and the Argus API client

**Files:**
- Create in `android/app/src/main/java/app/askargus/net/`: `ArgusJson.kt`, `Session.kt`, `SupabaseAuth.kt`, `Account.kt`, `ArgusApi.kt`
- Test in `android/app/src/test/java/app/askargus/net/`: `SupabaseAuthTest.kt`, `ArgusApiTest.kt`, `AccountTest.kt`

**Interfaces:**
- Consumes: `Verdict` (Task 3).
- Produces:
  - `val ArgusJson: Json`
  - `@Serializable data class Session(accessToken, refreshToken, expiresAt: Long /*epoch s*/, userId, email: String? = null, name: String? = null)`
  - `interface SessionStore { suspend fun load(): Session?; suspend fun save(session: Session?) }`, `MemorySessionStore`, `ObservableSessionStore(inner) : SessionStore` with `val state: StateFlow<Session?>`
  - `class AuthException(message: String)`, `sealed interface SignUpResult { SignedIn(session); CheckInbox; AlreadyRegistered }`
  - `class SupabaseAuth(http: OkHttpClient, baseUrl: String, apiKey: String, now: () -> Long = …)` with `signInWithPassword(email, password): Session`, `signInWithGoogle(idToken, rawNonce): Session`, `refresh(refreshToken): Session`, `signUp(name, email, password, redirectTo): SignUpResult`, `signOut(accessToken)`
  - `class Account(auth, sessions: ObservableSessionStore, appUrl: String, onSignedOut: suspend () -> Unit = {})` with `session: StateFlow<Session?>`, `restore()`, `signIn`, `signUp`, `signInWithGoogle`, `signOut`
  - `class ApiException(message: String, val code: Int)`, `class SignedOutException`
  - Models: `ScanResponse(id: String?, verdict: Verdict)`, `InviteResponse(url, expiresAt)`, `JoinResponse(name)`, `FamilyMember(linkId, name, joinedAt)`, `FamilyList(members)`, `InviteInfo(name: String?, valid: Boolean)`, `LatestRelease(version, apk, smsHelperApk: String?, notes, publishedAt)`
  - `interface Checker { suspend fun scan(input: String, save: String): ScanResponse }`
  - `class ArgusApi(http, appUrl, auth, sessions: SessionStore, now = …) : Checker` with `scan`, `handoff(next): String`, `familyInvite()`, `familyJoin(code)`, `family()`, `leaveFamily(linkId)`, `inviteInfo(code)`, `latest(): LatestRelease?`
- Server contract (built in Tasks 5–8): JSON bodies; errors are `{"error": "<message>"}` with 400/401/429/5xx; `401` means the access token is no longer valid.

- [ ] **Step 1: Write the failing tests**

`SupabaseAuthTest.kt`:
```kotlin
package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

const val NOW = 1_790_000_000L

fun sessionJson(access: String, refresh: String = "r-$access", expiresAt: Long? = NOW + 3600) = """
    {"access_token":"$access","refresh_token":"$refresh","expires_in":3600${if (expiresAt != null) ",\"expires_at\":$expiresAt" else ""},
     "user":{"id":"u1","email":"asha@example.com","user_metadata":{"full_name":"Asha Rao"}}}
""".trimIndent()

class SupabaseAuthTest {
    private val server = MockWebServer()
    private lateinit var auth: SupabaseAuth

    @Before fun start() {
        server.start()
        auth = SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk_test", now = { NOW })
    }

    @After fun stop() = server.shutdown()

    @Test fun passwordSignInReturnsTheSession() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        val s = auth.signInWithPassword("asha@example.com", "pw123456")
        assertEquals(Session("a1", "r-a1", NOW + 3600, "u1", "asha@example.com", "Asha Rao"), s)
        val req = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=password", req.path)
        assertEquals("pk_test", req.getHeader("apikey"))
        assertTrue(req.body.readUtf8().contains("\"password\":\"pw123456\""))
    }

    @Test fun wrongPasswordIsExplainedPlainly() = runTest {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}"""))
        val e = runCatching { auth.signInWithPassword("asha@example.com", "nope") }.exceptionOrNull()
        assertTrue(e is AuthException)
        assertEquals("That email and password don't match.", e!!.message)
    }

    @Test fun googleSendsTheRawNonce() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("g1")))
        auth.signInWithGoogle("id-token", "raw-nonce")
        val req = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=id_token", req.path)
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"provider\":\"google\""))
        assertTrue(body.contains("\"id_token\":\"id-token\""))
        assertTrue(body.contains("\"nonce\":\"raw-nonce\""))
    }

    @Test fun usesExpiresInWhenExpiresAtIsMissing() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1", expiresAt = null)))
        assertEquals(NOW + 3600, auth.signInWithPassword("asha@example.com", "pw123456").expiresAt)
    }

    @Test fun signUpThatNeedsConfirmation() = runTest {
        server.enqueue(MockResponse().setBody("""{"id":"u9","email":"new@example.com","identities":[{"id":"i1"}]}"""))
        assertEquals(SignUpResult.CheckInbox, auth.signUp("Asha", "new@example.com", "pw123456", "https://askargus.app/auth/confirm"))
        val req = server.takeRequest()
        assertEquals("/auth/v1/signup?redirect_to=https%3A%2F%2Faskargus.app%2Fauth%2Fconfirm", req.path)
        assertTrue(req.body.readUtf8().contains("\"full_name\":\"Asha\""))
    }

    @Test fun signUpWithAnEmailThatAlreadyHasAnAccount() = runTest {
        server.enqueue(MockResponse().setBody("""{"id":"u9","email":"old@example.com","identities":[]}"""))
        assertEquals(SignUpResult.AlreadyRegistered, auth.signUp("Asha", "old@example.com", "pw123456", "https://askargus.app/auth/confirm"))
    }

    @Test fun signUpThatSignsStraightIn() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a5")))
        val r = auth.signUp("Asha", "new@example.com", "pw123456", "https://askargus.app/auth/confirm")
        assertTrue(r is SignUpResult.SignedIn && r.session.accessToken == "a5")
    }
}
```

`ArgusApiTest.kt`:
```kotlin
package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ArgusApiTest {
    private val server = MockWebServer()
    private lateinit var store: MemorySessionStore
    private lateinit var api: ArgusApi
    private val scanJson = """{"id":"s1","verdict":{"kind":"text","subject":"hi","score":0,"level":"SAFE","threat_type":"None","signals":[]}}"""

    @Before fun start() {
        server.start()
        val base = server.url("/").toString()
        store = MemorySessionStore(Session("a1", "r1", NOW + 3600, "u1"))
        api = ArgusApi(OkHttpClient(), base, SupabaseAuth(OkHttpClient(), base, "pk", now = { NOW }), store, now = { NOW })
    }

    @After fun stop() {
        runCatching { server.shutdown() }
    }

    @Test fun sendsTheAccessToken() = runTest {
        server.enqueue(MockResponse().setBody(scanJson))
        val r = api.scan("hi", "always")
        assertEquals("s1", r.id)
        val req = server.takeRequest()
        assertEquals("/api/app/scan", req.path)
        assertEquals("Bearer a1", req.getHeader("Authorization"))
        assertTrue(req.body.readUtf8().contains("\"input\":\"hi\""))
    }

    @Test fun refreshesOnceOn401ThenRetries() = runTest {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Sign in again."}"""))
        server.enqueue(MockResponse().setBody(sessionJson("a2")))
        server.enqueue(MockResponse().setBody(scanJson))
        api.scan("hi", "always")
        assertEquals("Bearer a1", server.takeRequest().getHeader("Authorization"))
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
        assertEquals("Bearer a2", server.takeRequest().getHeader("Authorization"))
        assertEquals("a2", store.load()!!.accessToken)
    }

    @Test fun rejectedRefreshSignsOut() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid_grant","error_description":"Invalid Refresh Token"}"""))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull()
        assertTrue(e is SignedOutException)
        assertNull(store.load())
    }

    @Test fun refreshesAnExpiringSessionFirst() = runTest {
        store.save(Session("a1", "r1", NOW + 10, "u1"))
        server.enqueue(MockResponse().setBody(sessionJson("a2")))
        server.enqueue(MockResponse().setBody(scanJson))
        api.scan("hi", "always")
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
        assertEquals("Bearer a2", server.takeRequest().getHeader("Authorization"))
    }

    @Test fun wakingEngineMessage() = runTest {
        server.enqueue(MockResponse().setResponseCode(504).setBody("<html>Gateway Timeout</html>"))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("Argus's checker is waking up. Try again in a moment.", e.message)
    }

    @Test fun serverMessagesAreShownAsTheyAre() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":"You've reached today's limit of 500 checks."}"""))
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("You've reached today's limit of 500 checks.", e.message)
        assertEquals(429, e.code)
    }

    @Test fun offlineMessage() = runTest {
        server.shutdown()
        val e = runCatching { api.scan("hi", "always") }.exceptionOrNull() as ApiException
        assertEquals("Couldn't reach Argus. Check your connection.", e.message)
    }

    @Test fun signedOutWithoutASession() = runTest {
        store.save(null)
        assertTrue(runCatching { api.scan("hi", "always") }.exceptionOrNull() is SignedOutException)
        assertEquals(0, server.requestCount)
    }

    @Test fun publicCallsCarryNoToken() = runTest {
        server.enqueue(MockResponse().setBody("""{"version":"0.2.0","apk":"https://example.com/argus-0.2.0.apk"}"""))
        assertEquals("0.2.0", api.latest()!!.version)
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"No Android release yet."}"""))
        assertNull(api.latest())
    }
}
```

`AccountTest.kt`:
```kotlin
package app.askargus.net

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountTest {
    private val server = MockWebServer().apply { start() }
    private val sessions = ObservableSessionStore(MemorySessionStore())
    private var signedOut = false
    private val account = Account(
        SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW }),
        sessions, "https://askargus.app", onSignedOut = { signedOut = true },
    )

    @After fun stop() {
        runCatching { server.shutdown() }
    }

    @Test fun signInTrimsTheEmailAndPublishesTheSession() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        account.signIn("  asha@example.com ", "pw123456")
        assertTrue(server.takeRequest().body.readUtf8().contains("\"email\":\"asha@example.com\""))
        assertEquals("a1", account.session.value!!.accessToken)
    }

    @Test fun signOutForgetsTheSessionEvenIfTheServerIsUnreachable() = runTest {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        account.signIn("asha@example.com", "pw123456")
        server.shutdown()
        account.signOut()
        assertNull(account.session.value)
        assertTrue(signedOut)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

```powershell
.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.net.*"
```
Expected: compilation FAILS (unresolved `SupabaseAuth`, `ArgusApi`, `Session`, …).

- [ ] **Step 3: Implement**

`ArgusJson.kt`:
```kotlin
package app.askargus.net

import kotlinx.serialization.json.Json

val ArgusJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}
```

`Session.kt`:
```kotlin
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
```

`SupabaseAuth.kt`:
```kotlin
package app.askargus.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder

class AuthException(message: String) : Exception(message)

sealed interface SignUpResult {
    data class SignedIn(val session: Session) : SignUpResult
    data object CheckInbox : SignUpResult
    data object AlreadyRegistered : SignUpResult
}

/** Supabase Auth over its REST API, with the public (publishable) key, exactly as the website's browser code uses it. */
class SupabaseAuth(
    private val http: OkHttpClient,
    baseUrl: String,
    private val apiKey: String,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val base = baseUrl.trimEnd('/')

    suspend fun signInWithPassword(email: String, password: String): Session =
        token("password", buildJsonObject { put("email", email); put("password", password) })

    suspend fun signInWithGoogle(idToken: String, rawNonce: String): Session =
        token("id_token", buildJsonObject { put("provider", "google"); put("id_token", idToken); put("nonce", rawNonce) })

    suspend fun refresh(refreshToken: String): Session =
        token("refresh_token", buildJsonObject { put("refresh_token", refreshToken) })

    suspend fun signUp(name: String, email: String, password: String, redirectTo: String): SignUpResult {
        val body = buildJsonObject {
            put("email", email)
            put("password", password)
            putJsonObject("data") { put("full_name", name) }
        }
        val json = post("/auth/v1/signup?redirect_to=${URLEncoder.encode(redirectTo, "UTF-8")}", body, bearer = null)
        if (json.text("access_token") != null) return SignUpResult.SignedIn(parseSession(json))
        val user = json["user"] as? JsonObject ?: json
        val identities = user["identities"] as? JsonArray
        return if (identities != null && identities.isEmpty()) SignUpResult.AlreadyRegistered else SignUpResult.CheckInbox
    }

    /** Best effort: the session is forgotten on the phone whether or not the server hears about it. */
    suspend fun signOut(accessToken: String) {
        runCatching { post("/auth/v1/logout", JsonObject(emptyMap()), bearer = accessToken) }
    }

    private suspend fun token(grant: String, body: JsonObject): Session =
        parseSession(post("/auth/v1/token?grant_type=$grant", body, bearer = null))

    private fun parseSession(json: JsonObject): Session {
        val missing = AuthException("Sign-in didn't finish. Try again.")
        val user = json["user"] as? JsonObject ?: throw missing
        val meta = user["user_metadata"] as? JsonObject
        val expiresAt = (json["expires_at"] as? JsonPrimitive)?.longOrNull
            ?: (now() + ((json["expires_in"] as? JsonPrimitive)?.longOrNull ?: 3600))
        return Session(
            accessToken = json.text("access_token") ?: throw missing,
            refreshToken = json.text("refresh_token") ?: throw missing,
            expiresAt = expiresAt,
            userId = user.text("id") ?: throw missing,
            email = user.text("email"),
            name = meta?.text("full_name") ?: meta?.text("name"),
        )
    }

    private suspend fun post(path: String, body: JsonObject, bearer: String?): JsonObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(base + path)
            .header("apikey", apiKey)
            .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val json = runCatching { ArgusJson.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!res.isSuccessful) throw AuthException(errorMessage(json, res.code))
            json
        }
    }

    companion object {
        fun errorMessage(json: JsonObject, code: Int): String {
            val raw = listOf("msg", "error_description", "message", "error").firstNotNullOfOrNull { json.text(it) }
                ?: return "Sign-in failed ($code). Try again."
            return when {
                raw.contains("Invalid login credentials", ignoreCase = true) -> "That email and password don't match."
                raw.contains("Email not confirmed", ignoreCase = true) -> "Confirm your email first: the link is in your inbox."
                else -> raw
            }
        }

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
    }
}
```
(`text` is a private extension inside the companion; `parseSession`/`signUp` call it via `json.text(...)` — Kotlin resolves companion members from the class body.)

`Account.kt`:
```kotlin
package app.askargus.net

import kotlinx.coroutines.flow.StateFlow

/** Signing in and out, for the screens. The session itself lives in the (encrypted) session store. */
class Account(
    private val auth: SupabaseAuth,
    private val sessions: ObservableSessionStore,
    private val appUrl: String,
    private val onSignedOut: suspend () -> Unit = {},
) {
    val session: StateFlow<Session?> get() = sessions.state

    suspend fun restore(): Session? = sessions.load()

    suspend fun signIn(email: String, password: String) = sessions.save(auth.signInWithPassword(email.trim(), password))

    suspend fun signUp(name: String, email: String, password: String): SignUpResult {
        val result = auth.signUp(name.trim(), email.trim(), password, "${appUrl.trimEnd('/')}/auth/confirm")
        if (result is SignUpResult.SignedIn) sessions.save(result.session)
        return result
    }

    suspend fun signInWithGoogle(idToken: String, rawNonce: String) = sessions.save(auth.signInWithGoogle(idToken, rawNonce))

    suspend fun signOut() {
        sessions.load()?.let { auth.signOut(it.accessToken) }
        sessions.save(null)
        onSignedOut()
    }
}
```

`ArgusApi.kt`:
```kotlin
package app.askargus.net

import app.askargus.core.Verdict
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder

class ApiException(message: String, val code: Int) : Exception(message)
class SignedOutException : Exception("Sign in to use this.")

@Serializable data class ScanResponse(val id: String? = null, val verdict: Verdict)
@Serializable data class UrlResponse(val url: String)
@Serializable data class InviteResponse(val url: String, val expiresAt: String)
@Serializable data class JoinResponse(val name: String)
@Serializable data class FamilyMember(val linkId: String, val name: String, val joinedAt: String)
@Serializable data class FamilyList(val members: List<FamilyMember> = emptyList())
@Serializable data class InviteInfo(val name: String? = null, val valid: Boolean = false)
@Serializable data class LatestRelease(
    val version: String,
    val apk: String,
    val smsHelperApk: String? = null,
    val notes: String = "",
    val publishedAt: String = "",
)

interface Checker {
    suspend fun scan(input: String, save: String): ScanResponse
}

/** askargus.app's app endpoints. Signed-in calls carry the Supabase access token, refreshed once when it's stale. */
class ArgusApi(
    private val http: OkHttpClient,
    appUrl: String,
    private val auth: SupabaseAuth,
    private val sessions: SessionStore,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) : Checker {
    private val base = appUrl.trimEnd('/')
    private val refreshLock = Mutex()

    override suspend fun scan(input: String, save: String): ScanResponse =
        authed("POST", "/api/app/scan", buildJsonObject { put("input", input); put("save", save) }, ScanResponse.serializer())

    suspend fun handoff(next: String): String =
        authed("POST", "/api/app/handoff", buildJsonObject { put("next", next) }, UrlResponse.serializer()).url

    suspend fun familyInvite(): InviteResponse =
        authed("POST", "/api/app/family/invite", JsonObject(emptyMap()), InviteResponse.serializer())

    suspend fun familyJoin(code: String): JoinResponse =
        authed("POST", "/api/app/family/join", buildJsonObject { put("code", code) }, JoinResponse.serializer())

    suspend fun family(): FamilyList = authed("GET", "/api/app/family", null, FamilyList.serializer())

    suspend fun leaveFamily(linkId: String) {
        authed("DELETE", "/api/app/family/${enc(linkId)}", null, JsonObject.serializer())
    }

    suspend fun inviteInfo(code: String): InviteInfo =
        decode(send("GET", "/api/app/family/invite-info?code=${enc(code)}", null, null), InviteInfo.serializer())

    suspend fun latest(): LatestRelease? = try {
        decode(send("GET", "/api/app/latest", null, null), LatestRelease.serializer())
    } catch (e: ApiException) {
        if (e.code == 404) null else throw e
    }

    private suspend fun <T> authed(method: String, path: String, body: JsonObject?, serializer: KSerializer<T>): T {
        var session = sessions.load() ?: throw SignedOutException()
        if (session.expiresAt - now() < 60) session = refreshed(session) ?: throw SignedOutException()
        val first = send(method, path, body, session.accessToken)
        if (first.code != 401) return decode(first, serializer)
        val fresh = refreshed(session) ?: throw SignedOutException()
        return decode(send(method, path, body, fresh.accessToken), serializer)
    }

    /** One refresh at a time; a refresh token the server rejects means the session is over, so it's forgotten. */
    private suspend fun refreshed(stale: Session): Session? = refreshLock.withLock {
        val current = sessions.load() ?: return@withLock null
        if (current.accessToken != stale.accessToken && current.expiresAt - now() >= 60) return@withLock current
        try {
            auth.refresh(current.refreshToken).also { sessions.save(it) }
        } catch (e: AuthException) {
            sessions.save(null)
            null
        }
    }

    private class Reply(val code: Int, val text: String)

    private suspend fun send(method: String, path: String, body: JsonObject?, token: String?): Reply = withContext(Dispatchers.IO) {
        val payload = body?.toString()?.toRequestBody(JSON)
        val request = Request.Builder().url(base + path).apply {
            if (token != null) header("Authorization", "Bearer $token")
            when (method) {
                "GET" -> get()
                "DELETE" -> delete(payload)
                else -> method(method, payload ?: "{}".toRequestBody(JSON))
            }
        }.build()
        try {
            http.newCall(request).execute().use { Reply(it.code, it.body?.string().orEmpty()) }
        } catch (e: IOException) {
            throw ApiException("Couldn't reach Argus. Check your connection.", 0)
        }
    }

    private fun <T> decode(reply: Reply, serializer: KSerializer<T>): T {
        if (reply.code in 200..299) return ArgusJson.decodeFromString(serializer, reply.text.ifEmpty { "{}" })
        throw ApiException(errorMessage(reply), reply.code)
    }

    private fun errorMessage(reply: Reply): String {
        val fromServer = runCatching {
            ((ArgusJson.parseToJsonElement(reply.text) as JsonObject)["error"] as? JsonPrimitive)?.contentOrNull
        }.getOrNull()
        return when {
            !fromServer.isNullOrBlank() -> fromServer
            reply.code in 502..504 -> "Argus's checker is waking up. Try again in a moment."
            reply.code == 429 -> "You've reached today's limit. Try again tomorrow."
            reply.code == 401 -> "Sign in again."
            else -> "Something went wrong (${reply.code}). Try again."
        }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
        fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
    }
}
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
.\gradlew.bat :app:testDebugUnitTest
```
Expected: `BUILD SUCCESSFUL`; all `net` and `core` tests pass.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/app/askargus/net android/app/src/test/java/app/askargus/net
git commit -m "feat(android): Supabase sign-in, sessions and the Argus API client

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Website — app sign-in check, shared scan pipeline, `POST /api/app/scan`, daily caps

**Files:**
- Create: `web/src/lib/app-auth.ts`, `web/src/lib/app-caps.ts`, `web/src/lib/app-scan.ts`, `web/src/lib/scan-core.ts`, `web/src/app/api/app/scan/route.ts`, `.superpowers/e2e/app-api-check.mjs` (git-ignored)
- Modify: `web/src/lib/rate-limit.ts` (add `appLimitKey`), `web/src/app/(app)/scan/actions.ts` (use `performScan`)
- Test: `web/src/lib/app-auth.test.ts`, `web/src/lib/app-scan.test.ts`, `web/src/lib/rate-limit.test.ts` (extend)

**Interfaces:**
- Consumes: `api`, `communityFor`, `recordSightings`, `alertFamily`/`ALERT_AT`, `levelMeta` (existing); `take_check_slot(p_key, p_limit, p_window_seconds)` (existing SQL; keys must be 64 hex chars).
- Produces:
  - `bearerToken(header: string | null): string | null`; `appUser(request): Promise<{ supabase: ServerSupabase; user: User } | null>`; `unauthorized()`; `fail(status, error)`; `type ServerSupabase`
  - `appLimitKey(purpose, userId, secret): string`
  - `APP_CAPS = { scan: 500, handoff: 20, invite: 20 }`, `CAP_MESSAGES`, `withinCap(supabase, cap, userId): Promise<boolean>`
  - `type SaveMode = "always" | "flagged"`, `SAVE_FLAGGED_AT = 60`, `shouldSave(mode, score)`, `MAX_APP_INPUT = 20_000`, `parseScanBody(body): { input; save } | { error }`
  - `performScan(supabase, what: { input } | { file }, mode = "always"): Promise<{ ok: true; id: string | null; verdict; alerted } | { ok: false; error }>`
  - `POST /api/app/scan` body `{ input, save? }` → `200 { id, verdict, alerted }` | `400/401/429/502 { error }`

- [ ] **Step 1: Write the failing tests**

`web/src/lib/app-auth.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { bearerToken } from "./app-auth";

describe("bearerToken", () => {
  it("reads the access token the app sends", () => {
    expect(bearerToken("Bearer eyJhbGciOi.payload.sig")).toBe("eyJhbGciOi.payload.sig");
    expect(bearerToken("bearer abc-123_~+/=")).toBe("abc-123_~+/=");
  });
  it("refuses anything else", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer two words")).toBeNull();
  });
});
```

`web/src/lib/app-scan.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MAX_APP_INPUT, parseScanBody, shouldSave } from "./app-scan";

describe("parseScanBody", () => {
  it("takes the text to check and how to save it", () => {
    expect(parseScanBody({ input: "  call 98765 now " })).toEqual({ input: "call 98765 now", save: "always" });
    expect(parseScanBody({ input: "hi", save: "flagged" })).toEqual({ input: "hi", save: "flagged" });
    expect(parseScanBody({ input: "hi", save: "whatever" })).toEqual({ input: "hi", save: "always" });
  });
  it("explains empty, missing and oversized input", () => {
    expect(parseScanBody({ input: "   " })).toHaveProperty("error");
    expect(parseScanBody(null)).toHaveProperty("error");
    expect(parseScanBody("text")).toHaveProperty("error");
    expect(parseScanBody({ input: "x".repeat(MAX_APP_INPUT + 1) })).toHaveProperty("error");
    expect(parseScanBody({ input: "x".repeat(MAX_APP_INPUT) })).toHaveProperty("input");
  });
});

describe("shouldSave", () => {
  it("saves checks people start, and automatic ones only when flagged", () => {
    expect(shouldSave("always", 0)).toBe(true);
    expect(shouldSave("flagged", 59)).toBe(false);
    expect(shouldSave("flagged", 60)).toBe(true);
  });
});
```

Add to `web/src/lib/rate-limit.test.ts` (and add `appLimitKey` to its import line):
```ts
describe("appLimitKey", () => {
  it("counts per account and purpose without storing the account ID", () => {
    const key = appLimitKey("scan", "5b0c0f8e-1111-2222-3333-444455556666", "secret-a");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("5b0c0f8e");
    expect(appLimitKey("handoff", "5b0c0f8e-1111-2222-3333-444455556666", "secret-a")).not.toBe(key);
    expect(appLimitKey("scan", "another-user", "secret-a")).not.toBe(key);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/app-auth.test.ts src/lib/app-scan.test.ts src/lib/rate-limit.test.ts`
Expected: FAIL — `Cannot find module './app-auth'`, `'./app-scan'`, and `appLimitKey is not a function`.

- [ ] **Step 3: Implement the helpers**

`web/src/lib/app-auth.ts`:
```ts
import "server-only";
import { createClient as createSupabase, type User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** The access token from an "Authorization: Bearer …" header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header?.trim() ?? "");
  return match ? match[1] : null;
}

/** Who the Android app is acting for: a Supabase client that acts as them, so row-level security applies exactly
 *  as on the website. Null when the token is missing or no longer valid. */
export async function appUser(request: Request): Promise<{ supabase: ServerSupabase; user: User } | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;
  const supabase = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase: supabase as unknown as ServerSupabase, user: data.user };
}

export const unauthorized = () => Response.json({ error: "Sign in again." }, { status: 401 });
export const fail = (status: number, error: string) => Response.json({ error }, { status });
```

Append to `web/src/lib/rate-limit.ts`:
```ts

/** What an app user's checks are counted under: a keyed hash of what's counted and for whom, never the account ID. */
export function appLimitKey(purpose: string, userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`app:${purpose}:${userId}`).digest("hex");
}
```

`web/src/lib/app-scan.ts`:
```ts
// The Android app's scan requests: what to check and whether to keep it in history.

export type SaveMode = "always" | "flagged";
export const SAVE_FLAGGED_AT = 60;
export const MAX_APP_INPUT = 20_000;

/** Checks people start are always saved (like the Scan page); automatic ones only when they're flagged. */
export function shouldSave(mode: SaveMode, score: number): boolean {
  return mode === "always" || score >= SAVE_FLAGGED_AT;
}

export function parseScanBody(body: unknown): { input: string; save: SaveMode } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { input?: unknown; save?: unknown };
  const input = typeof b.input === "string" ? b.input.trim() : "";
  if (!input) return { error: "Nothing to check. Paste or share something first." };
  if (input.length > MAX_APP_INPUT) return { error: "That's too long to check. Share a shorter part of it." };
  return { input, save: b.save === "flagged" ? "flagged" : "always" };
}
```

`web/src/lib/app-caps.ts`:
```ts
import "server-only";
import type { ServerSupabase } from "@/lib/app-auth";
import { appLimitKey } from "@/lib/rate-limit";

// Daily caps per account, so one phone can't use up the free services everyone shares.
export const APP_CAPS = { scan: 500, handoff: 20, invite: 20 } as const;
export type CapName = keyof typeof APP_CAPS;

export const CAP_MESSAGES: Record<CapName, string> = {
  scan: "You've reached today's limit of 500 checks. Try again tomorrow.",
  handoff: "That's a lot of website sign-ins today. Sign in on the website instead.",
  invite: "That's a lot of invites today. Try again tomorrow.",
};

const SECRET = process.env.RATE_LIMIT_SECRET || process.env.GMAIL_TOKEN_KEY || "argus-preview";

/** True when this account may do one more of these today. If counting fails, it's allowed rather than blocking people. */
export async function withinCap(supabase: ServerSupabase, cap: CapName, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("take_check_slot", {
    p_key: appLimitKey(cap, userId, SECRET),
    p_limit: APP_CAPS[cap],
    p_window_seconds: 86_400,
  });
  return error ? true : data !== false;
}
```

`web/src/lib/scan-core.ts`:
```ts
import "server-only";
import { api } from "@/lib/api";
import { shouldSave, type SaveMode } from "@/lib/app-scan";
import { communityFor, recordSightings } from "@/lib/community-data";
import { ALERT_AT, alertFamily } from "@/lib/family-alerts";
import { levelMeta } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";
import type { Community, Verdict } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type ScanWhat = { input: string } | { file: File };
export type CoreScanResult = { ok: true; id: string | null; verdict: Verdict; alerted: number } | { ok: false; error: string };

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // hosting limits a request to 4.5 MB
const PHONEISH = /^\+?[\d\s\-().]{7,20}$/;

async function phoneCommunity(supabase: Supabase, input: string): Promise<Community | undefined> {
  if (!PHONEISH.test(input)) return undefined;
  try {
    const { e164 } = await api.normalizePhone(input);
    return e164 ? (await communityFor(supabase, e164)).community : undefined;
  } catch {
    return undefined;
  }
}

/** The scan pipeline shared by the Scan page and the Android app: the engine's verdict, history, sightings and
 *  family alerts. `supabase` acts as the signed-in person, so everything is saved under their account. */
export async function performScan(supabase: Supabase, what: ScanWhat, mode: SaveMode = "always"): Promise<CoreScanResult> {
  try {
    let verdict: Verdict;
    let preview: string;
    if ("file" in what) {
      if (what.file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files up to 4 MB can be scanned in the web app." };
      verdict = await api.scanFile(what.file);
      preview = what.file.name;
    } else {
      verdict = await api.scan(what.input, await phoneCommunity(supabase, what.input));
      preview = what.input;
    }

    let id: string | null = null;
    if (shouldSave(mode, verdict.score)) {
      const { data, error } = await supabase
        .from("scans")
        .insert({
          kind: verdict.kind,
          input_preview: preview.slice(0, 200),
          score: verdict.score,
          level: verdict.level,
          threat_type: verdict.threat_type,
          verdict,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Scanned, but couldn't save the result: ${error.message}` };
      id = data.id;
    }
    await recordSightings(supabase, verdict).catch(() => undefined);
    const alerted =
      verdict.score >= ALERT_AT
        ? await alertFamily(supabase, {
            kind: "scan",
            scanKind: verdict.kind,
            subject: verdict.subject,
            score: verdict.score,
            label: levelMeta(verdict.level, verdict.verified).label,
            threat: verdict.threat_type,
          }).catch(() => 0)
        : 0;
    return { ok: true, id, verdict, alerted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Scan failed." };
  }
}
```

- [ ] **Step 4: Use the shared pipeline in the Scan page's action**

In `web/src/app/(app)/scan/actions.ts`, replace everything from the imports down to the end of `runScan` with:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { performScan } from "@/lib/scan-core";
import { createClient } from "@/lib/supabase/server";
import type { Verdict } from "@/lib/types";

export type ScanResult = { ok: true; id: string; verdict: Verdict; alerted: number } | { ok: false; error: string };

export async function runScan(formData: FormData): Promise<ScanResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  const file = formData.get("file");
  const input = String(formData.get("input") ?? "").trim();
  const what = file instanceof File && file.size > 0 ? { file } : input ? { input } : null;
  if (!what) return { ok: false, error: "Paste something or drop a file to scan." };

  const result = await performScan(supabase, what);
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  revalidatePath("/history");
  return { ok: true, id: result.id!, verdict: result.verdict, alerted: result.alerted };
}
```
Keep `ReportResult`, `CATEGORIES` and `reportNumber` below it unchanged.

- [ ] **Step 5: Add the endpoint**

`web/src/app/api/app/scan/route.ts`:
```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { parseScanBody } from "@/lib/app-scan";
import { performScan } from "@/lib/scan-core";

// Scans visit sites and ask several sources, so give them time on serverless hosting.
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = parseScanBody(await request.json().catch(() => null));
  if ("error" in body) return fail(400, body.error);
  if (!(await withinCap(auth.supabase, "scan", auth.user.id))) return fail(429, CAP_MESSAGES.scan);
  const result = await performScan(auth.supabase, { input: body.input }, body.save);
  if (!result.ok) return fail(502, result.error);
  return Response.json({ id: result.id, verdict: result.verdict, alerted: result.alerted });
}
```

- [ ] **Step 6: Run the unit tests, typecheck and lint**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: all tests pass (the earlier 124 plus the new ones); no type or lint errors.

- [ ] **Step 7: Check the endpoint end to end against the local engine**

Start the engine and website (background): `cd api && .venv/Scripts/python -m uvicorn argus_api.main:app --port 8000` and `cd web && npm run dev`.

`.superpowers/e2e/app-api-check.mjs`:
```js
// Throwaway: the Android app's endpoints, called the way the app calls them. Usage: node app-api-check.mjs [base]
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const env = readFileSync(new URL("../../web/.env.local", import.meta.url), "utf8");
const val = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))[1].trim();
const [email, password] = readFileSync(new URL("./prod-check.mjs", import.meta.url), "utf8")
  .match(/#email", "([^"]+)"[\s\S]*?#password", "([^"]+)"/).slice(1);
const ok = (label, pass, detail = "") => console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);

const auth = await fetch(`${val("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: val("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
const token = auth.access_token;
ok("signed in the way the app does", !!token);
const call = (path, init = {}, bearer = token) =>
  fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...init.headers } });

let r = await call("/api/app/scan", { method: "POST", body: JSON.stringify({ input: "URGENT: your bank account is suspended, verify at bit.ly/x" }) });
let j = await r.json();
ok("scan returns a verdict and a history id", r.status === 200 && j.verdict?.score >= 60 && typeof j.id === "string", `${r.status} ${j.verdict?.score}`);
r = await call("/api/app/scan", { method: "POST", body: JSON.stringify({ input: "Hey, lunch at noon?", save: "flagged" }) });
j = await r.json();
ok("a clean automatic check isn't saved", r.status === 200 && j.id === null, `${r.status} id=${j.id}`);
r = await call("/api/app/scan", { method: "POST", body: JSON.stringify({ input: "hi" }) }, null);
ok("no token is refused", r.status === 401);
r = await call("/api/app/scan", { method: "POST", body: JSON.stringify({ input: "  " }) });
ok("empty input is explained", r.status === 400 && !!(await r.json()).error);
```
Run: `node .superpowers/e2e/app-api-check.mjs`
Expected: 5 PASS lines. Afterwards delete the test scan it saved:
```sql
delete from public.scans where user_id = (select id from auth.users where email = 'argus.demo.tester@gmail.com')
  and created_at > now() - interval '30 minutes' and input_preview like 'URGENT: your bank account is suspended%';
```
(run through the Supabase MCP `execute_sql`, project `yvcxqwrgizfmzgohnezj`).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/app-auth.ts web/src/lib/app-auth.test.ts web/src/lib/app-caps.ts web/src/lib/app-scan.ts web/src/lib/app-scan.test.ts web/src/lib/scan-core.ts web/src/lib/rate-limit.ts web/src/lib/rate-limit.test.ts "web/src/app/(app)/scan/actions.ts" web/src/app/api/app/scan/route.ts
git commit -m "feat(web): app scan endpoint on the Scan page's pipeline, with daily caps

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Website — `POST /api/app/handoff` (open website pages signed in)

**Files:**
- Create: `web/src/lib/handoff.ts`, `web/src/app/api/app/handoff/route.ts`
- Test: `web/src/lib/handoff.test.ts`
- Modify: `.superpowers/e2e/app-api-check.mjs` (append a check)

**Interfaces:**
- Consumes: `appUser`, `fail`, `unauthorized`, `withinCap`, `CAP_MESSAGES` (Task 5); `safeNext` (existing); `APP_URL` (existing); `/auth/confirm` already verifies `token_hash` + `type=magiclink`.
- Produces: `handoffUrl(appUrl, tokenHash, next): string`; `POST /api/app/handoff` body `{ next }` → `200 { url }` | `401` | `429` | `503` (secret key not set) | `502`.

- [ ] **Step 1: Write the failing test**

`web/src/lib/handoff.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { handoffUrl } from "./handoff";

describe("handoffUrl", () => {
  it("links to the confirm route with the one-time token and where to land", () => {
    const url = new URL(handoffUrl("https://askargus.app", "abc123", "/history?kind=url"));
    expect(url.origin + url.pathname).toBe("https://askargus.app/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("magiclink");
    expect(url.searchParams.get("next")).toBe("/history?kind=url");
  });
  it("never lands anywhere off the site", () => {
    expect(new URL(handoffUrl("https://askargus.app", "t", "https://evil.example")).searchParams.get("next")).toBe("/dashboard");
    expect(new URL(handoffUrl("https://askargus.app", "t", "//evil.example")).searchParams.get("next")).toBe("/dashboard");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/lib/handoff.test.ts`
Expected: FAIL — `Cannot find module './handoff'`.

- [ ] **Step 3: Implement**

`web/src/lib/handoff.ts`:
```ts
import { safeNext } from "@/lib/safe-next";

/** The one-time link that signs the app's user in on the website and then lands on `next` (on-site paths only). */
export function handoffUrl(appUrl: string, tokenHash: string, next: string): string {
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}
```

`web/src/app/api/app/handoff/route.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { APP_URL } from "@/lib/app-url";
import { handoffUrl } from "@/lib/handoff";

// Opens website pages (History, Family, Caller ID…) signed in from the app, without a second sign-in. The secret key
// only ever creates a one-time link for the person the access token belongs to.
export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return fail(503, "Opening the website signed in isn't set up yet. You can sign in on the website instead.");
  const email = auth.user.email;
  if (!email) return fail(400, "This account has no email address to sign in with.");
  if (!(await withinCap(auth.supabase, "handoff", auth.user.id))) return fail(429, CAP_MESSAGES.handoff);

  const body = (await request.json().catch(() => ({}))) as { next?: unknown };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return fail(502, "Couldn't open the website signed in. Try again.");
  return Response.json({ url: handoffUrl(APP_URL, tokenHash, typeof body.next === "string" ? body.next : "/dashboard") });
}
```

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: all pass.

- [ ] **Step 5: Check the endpoint (locally the secret key isn't set, so it must say so)**

Append to `.superpowers/e2e/app-api-check.mjs`:
```js
r = await call("/api/app/handoff", { method: "POST", body: JSON.stringify({ next: "/history" }) });
j = await r.json();
if (r.status === 503) ok("handoff explains when the secret key isn't set", /isn't set up/.test(j.error), j.error);
else ok("handoff returns a one-time sign-in link", r.status === 200 && /\/auth\/confirm\?token_hash=.+type=magiclink.+next=%2Fhistory/.test(j.url), `${r.status}`);
r = await call("/api/app/handoff", { method: "POST", body: "{}" }, null);
ok("handoff needs a token", r.status === 401);
```
Run: `node .superpowers/e2e/app-api-check.mjs`
Expected: all PASS (locally the 503 branch).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/handoff.ts web/src/lib/handoff.test.ts web/src/app/api/app/handoff/route.ts
git commit -m "feat(web): one-time sign-in links so the app opens website pages signed in

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Family invites — database, endpoints and the join page

**Files:**
- Create: `supabase/migrations/20260930120000_family_links.sql`, `web/src/lib/family-invite.ts`, `web/src/lib/family-invite-info.ts`, `web/src/app/api/app/family/route.ts`, `web/src/app/api/app/family/invite/route.ts`, `web/src/app/api/app/family/join/route.ts`, `web/src/app/api/app/family/invite-info/route.ts`, `web/src/app/api/app/family/[id]/route.ts`, `web/src/app/app/join/[code]/page.tsx`, `web/src/app/app/join/[code]/actions.ts`, `web/src/app/app/join/[code]/join-button.tsx`
- Test: `web/src/lib/family-invite.test.ts`; SQL checks through the Supabase MCP
- Modify: `.superpowers/e2e/app-api-check.mjs` (append)

**Interfaces:**
- Consumes: `appUser`, `fail`, `unauthorized`, `withinCap`, `CAP_MESSAGES` (Task 5); `APP_URL`; `WatchingEye`.
- Produces:
  - SQL: tables `family_invites(code_hash, inviter_id, created_at, expires_at, used_at, used_by)`, `family_links(id, user_a, user_b, created_at)`; functions `family_invite_info(p_code) → (inviter_name, valid)` (anon + authenticated), `accept_family_invite(p_code) → (link_id, inviter_name)` (authenticated), `my_family() → (link_id, member_id, member_name, joined_at)` (authenticated)
  - `INVITE_CODE`, `newInviteCode()`, `hashInviteCode(code)`, `isInviteCode(code)`, `inviteUrl(appUrl, code)`; `inviteInfo(code): Promise<{ name: string | null; valid: boolean }>`
  - `GET /api/app/family` → `{ members: [{ linkId, name, joinedAt }] }`; `POST /api/app/family/invite` → `{ url, expiresAt }`; `POST /api/app/family/join` `{ code }` → `{ name }`; `GET /api/app/family/invite-info?code=` → `{ name, valid }` (public); `DELETE /api/app/family/<linkId>` → `{ left: true }`
  - Page `/app/join/<code>`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260930120000_family_links.sql`:
```sql
-- Family circle, part one: invite links and the links between accounts they create. Both people consent: one by
-- inviting, the other by accepting. Codes are stored only as SHA-256 hashes. Either person can leave at any time.

create table public.family_invites (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  inviter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
alter table public.family_invites enable row level security;
create policy "people create their own invites" on public.family_invites
  for insert to authenticated
  with check (inviter_id = (select auth.uid()) and used_at is null and used_by is null
              and expires_at <= now() + interval '7 days 1 minute');
create policy "people see their own invites" on public.family_invites
  for select to authenticated using (inviter_id = (select auth.uid()));

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint family_links_ordered check (user_a < user_b),
  constraint family_links_unique unique (user_a, user_b)
);
alter table public.family_links enable row level security;
create policy "members see their links" on public.family_links
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "members can leave" on public.family_links
  for delete to authenticated using ((select auth.uid()) in (user_a, user_b));
-- No insert or update policies: links are only ever created by accept_family_invite().

-- Who sent an invite (first name only) and whether it still works. Public, so the join page can greet people.
create function public.family_invite_info(p_code text)
returns table (inviter_name text, valid boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.family_invites;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{16,64}$' then
    return query select null::text, false;
    return;
  end if;
  select * into inv from public.family_invites where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex');
  if not found then
    return query select null::text, false;
    return;
  end if;
  return query select
    nullif(split_part(coalesce((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = inv.inviter_id), ''), ' ', 1), ''),
    inv.used_at is null and inv.expires_at > now();
end;
$$;
revoke all on function public.family_invite_info(text) from public;
grant execute on function public.family_invite_info(text) to anon, authenticated;

create function public.accept_family_invite(p_code text)
returns table (link_id uuid, inviter_name text)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  inv public.family_invites;
  lid uuid;
begin
  if me is null then
    raise exception 'Sign in to join a family.';
  end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'That invite link isn''t valid.';
  end if;
  select * into inv from public.family_invites
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex') for update;
  if not found or inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'This invite has expired or was already used. Ask for a new one.';
  end if;
  if inv.inviter_id = me then
    raise exception 'That''s your own invite. Send it to a family member.';
  end if;
  insert into public.family_links (user_a, user_b)
    values (least(inv.inviter_id, me), greatest(inv.inviter_id, me))
    on conflict (user_a, user_b) do update set user_a = excluded.user_a
    returning id into lid;
  update public.family_invites set used_at = now(), used_by = me where code_hash = inv.code_hash;
  return query select lid,
    coalesce(nullif((select u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = inv.inviter_id), ''), 'your family member');
end;
$$;
revoke all on function public.accept_family_invite(text) from public;
grant execute on function public.accept_family_invite(text) to authenticated;

create function public.my_family()
returns table (link_id uuid, member_id uuid, member_name text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, m.id,
         coalesce(nullif(m.raw_user_meta_data ->> 'full_name', ''), split_part(m.email, '@', 1)),
         l.created_at
  from public.family_links l
  join auth.users m on m.id = case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end
  where (select auth.uid()) in (l.user_a, l.user_b)
  order by l.created_at;
$$;
revoke all on function public.my_family() from public;
grant execute on function public.my_family() to authenticated;
```

- [ ] **Step 2: Check `pgcrypto` lives in the `extensions` schema, then apply the migration**

Supabase MCP `execute_sql` (project `yvcxqwrgizfmzgohnezj`):
```sql
select extname, extnamespace::regnamespace as schema from pg_extension where extname = 'pgcrypto';
```
Expected: one row, schema `extensions`. (If missing: `create extension if not exists pgcrypto with schema extensions;` as a separate migration first.)

Then MCP `apply_migration` with name `family_links` and the file's SQL.
Expected: success.

- [ ] **Step 3: Run the SQL checks (each is one `execute_sql` call, rolled back)**

Common preamble for every check (two throwaway users):
```sql
begin;
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'asha.plan@test.invalid', '{"full_name":"Asha Test"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'bala.plan@test.invalid', '{"full_name":"Bala Test"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'chand.plan@test.invalid', '{"full_name":"Chand Test"}', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into public.family_invites (code_hash) values (encode(extensions.digest('PlanTestCode-AAAAAAAAAAAA', 'sha256'), 'hex'));
```

**A. Happy path** — preamble, then:
```sql
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select * from public.family_invite_info('PlanTestCode-AAAAAAAAAAAA');
select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA');
select json_build_object(
  'b_sees', (select json_agg(member_name) from public.my_family()),
  'info_after', (select row_to_json(i) from public.family_invite_info('PlanTestCode-AAAAAAAAAAAA') i)
) as result;
rollback;
```
Expected result: `{"b_sees":["Asha Test"],"info_after":{"inviter_name":"Asha","valid":false}}`.

**B. Own invite** — preamble, then (still user A): `select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA'); rollback;`
Expected: error `That's your own invite. Send it to a family member.`

**C. Used twice** — preamble, then:
```sql
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA');
rollback;
```
Expected: error `This invite has expired or was already used. Ask for a new one.`

**D. Expired** — preamble, then:
```sql
insert into public.family_invites (code_hash, expires_at) values (encode(extensions.digest('PlanTestCode-EXPIREDEXPIRED', 'sha256'), 'hex'), now() - interval '1 minute');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select * from public.accept_family_invite('PlanTestCode-EXPIREDEXPIRED');
rollback;
```
Expected: error `This invite has expired or was already used. Ask for a new one.`

**E. Garbage codes** — preamble, then:
```sql
select json_build_object('info', (select row_to_json(i) from public.family_invite_info('no') i)) as result;
rollback;
```
Expected: `{"info":{"inviter_name":null,"valid":false}}`. And separately (preamble + `select * from public.accept_family_invite('bad code!'); rollback;`) → error `That invite link isn't valid.`

**F. Nobody else can create or see links** — preamble, then:
```sql
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select json_build_object(
  'c_links', (select count(*) from public.family_links),
  'c_family', (select count(*) from public.my_family())
) as result;
rollback;
```
Expected: `{"c_links":0,"c_family":0}`. And (preamble + as user C: `insert into public.family_links (user_a, user_b) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000c'); rollback;`) → error mentioning `row-level security`.

**G. Leaving** — preamble, then:
```sql
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select * from public.accept_family_invite('PlanTestCode-AAAAAAAAAAAA');
delete from public.family_links;
select json_build_object('b_family', (select count(*) from public.my_family())) as result;
rollback;
```
Expected: `{"b_family":0}`.

If the tool shows only the first statement's output, run the same statements with the final `select` as the only row-returning statement (as written). Afterwards confirm nothing leaked:
```sql
select count(*) from auth.users where email like '%.plan@test.invalid';
```
Expected: `0`.

- [ ] **Step 4: Write the failing unit test**

`web/src/lib/family-invite.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hashInviteCode, inviteUrl, isInviteCode, newInviteCode } from "./family-invite";

describe("invite codes", () => {
  it("are long, random and link-safe", () => {
    const a = newInviteCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newInviteCode()).not.toBe(a);
    expect(isInviteCode(a)).toBe(true);
  });
  it("are stored only as a SHA-256 hash, the same way the database checks them", () => {
    expect(hashInviteCode("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("turn away anything that isn't a code", () => {
    expect(isInviteCode("short")).toBe(false);
    expect(isInviteCode("has spaces in it here!!")).toBe(false);
    expect(isInviteCode(42)).toBe(false);
    expect(isInviteCode("x".repeat(65))).toBe(false);
  });
  it("become a join link on the site", () => {
    expect(inviteUrl("https://askargus.app", "AbCdEfGhIjKlMnOpQrStUvWx")).toBe("https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx");
  });
});
```
Run: `cd web && npx vitest run src/lib/family-invite.test.ts`
Expected: FAIL — `Cannot find module './family-invite'`.

- [ ] **Step 5: Implement the helpers**

`web/src/lib/family-invite.ts`:
```ts
import { createHash, randomBytes } from "node:crypto";

// Family invite links: 144 random bits, link-safe, stored only as a SHA-256 hash (the database hashes the same way).
export const INVITE_CODE = /^[A-Za-z0-9_-]{16,64}$/;

export function newInviteCode(): string {
  return randomBytes(18).toString("base64url");
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function isInviteCode(code: unknown): code is string {
  return typeof code === "string" && INVITE_CODE.test(code);
}

export function inviteUrl(appUrl: string, code: string): string {
  return new URL(`/app/join/${code}`, appUrl).toString();
}
```

`web/src/lib/family-invite-info.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isInviteCode } from "@/lib/family-invite";

/** Who sent an invite (first name) and whether it still works. Needs no account. */
export async function inviteInfo(code: string): Promise<{ name: string | null; valid: boolean }> {
  if (!isInviteCode(code)) return { name: null, valid: false };
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc("family_invite_info", { p_code: code });
  const row = (data as { inviter_name: string | null; valid: boolean }[] | null)?.[0];
  if (error || !row) return { name: null, valid: false };
  return { name: row.inviter_name, valid: row.valid };
}
```

Run: `cd web && npx vitest run src/lib/family-invite.test.ts` → Expected: PASS.

- [ ] **Step 6: Add the endpoints**

`web/src/app/api/app/family/route.ts`:
```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";

type Row = { link_id: string; member_id: string; member_name: string; joined_at: string };

export async function GET(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { data, error } = await auth.supabase.rpc("my_family");
  if (error) return fail(502, "Couldn't load your family. Try again.");
  const members = ((data ?? []) as Row[]).map((m) => ({ linkId: m.link_id, name: m.member_name, joinedAt: m.joined_at }));
  return Response.json({ members });
}
```

`web/src/app/api/app/family/invite/route.ts`:
```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { CAP_MESSAGES, withinCap } from "@/lib/app-caps";
import { APP_URL } from "@/lib/app-url";
import { hashInviteCode, inviteUrl, newInviteCode } from "@/lib/family-invite";

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  if (!(await withinCap(auth.supabase, "invite", auth.user.id))) return fail(429, CAP_MESSAGES.invite);
  const code = newInviteCode();
  const { data, error } = await auth.supabase
    .from("family_invites")
    .insert({ code_hash: hashInviteCode(code) })
    .select("expires_at")
    .single();
  if (error) return fail(502, "Couldn't create an invite. Try again.");
  return Response.json({ url: inviteUrl(APP_URL, code), expiresAt: data.expires_at });
}
```

`web/src/app/api/app/family/join/route.ts`:
```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";
import { isInviteCode } from "@/lib/family-invite";

export async function POST(request: Request) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  if (!isInviteCode(body.code)) return fail(400, "That invite link isn't valid.");
  const { data, error } = await auth.supabase.rpc("accept_family_invite", { p_code: body.code });
  if (error) return fail(400, error.message);
  const row = (data as { link_id: string; inviter_name: string }[] | null)?.[0];
  return Response.json({ name: row?.inviter_name ?? "your family member" });
}
```

`web/src/app/api/app/family/invite-info/route.ts`:
```ts
import { inviteInfo } from "@/lib/family-invite-info";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  return Response.json(await inviteInfo(code), { headers: { "cache-control": "no-store" } });
}
```

`web/src/app/api/app/family/[id]/route.ts`:
```ts
import { appUser, fail, unauthorized } from "@/lib/app-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await appUser(request);
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "That family link isn't valid.");
  const { error } = await auth.supabase.from("family_links").delete().eq("id", id);
  if (error) return fail(502, "Couldn't leave that family. Try again.");
  return Response.json({ left: true });
}
```

- [ ] **Step 7: Add the join page**

`web/src/app/app/join/[code]/actions.ts`:
```ts
"use server";

import { isInviteCode } from "@/lib/family-invite";
import { createClient } from "@/lib/supabase/server";

export type JoinResult = { ok: true; name: string } | { ok: false; error: string };

export async function joinFamily(code: string): Promise<JoinResult> {
  if (!isInviteCode(code)) return { ok: false, error: "That invite link isn't valid." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to join." };
  const { data, error } = await supabase.rpc("accept_family_invite", { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, name: (data as { inviter_name: string }[] | null)?.[0]?.inviter_name ?? "your family member" };
}
```

`web/src/app/app/join/[code]/join-button.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { joinFamily, type JoinResult } from "./actions";

export function JoinButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<JoinResult | null>(null);
  if (result?.ok) {
    return <p className="mt-8 text-lg">You and {result.name} are now family on Argus.</p>;
  }
  return (
    <div className="mt-8">
      <Button className="h-11 rounded-full px-6" disabled={pending} onClick={() => start(async () => setResult(await joinFamily(code)))}>
        {pending ? "Joining…" : "Join the family"}
      </Button>
      {result && !result.ok && <p className="mt-3 text-sm text-risk-high" role="alert">{result.error}</p>}
    </div>
  );
}
```

`web/src/app/app/join/[code]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { buttonVariants } from "@/components/ui/button";
import { inviteInfo } from "@/lib/family-invite-info";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join a family on Argus", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = await inviteInfo(code);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const who = info.name ?? "Someone";

  return (
    <main className="mx-auto max-w-xl px-6 py-14 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-3">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      {info.valid ? (
        <>
          <h1 className="font-display mt-12 text-[clamp(2.2rem,7vw,3.6rem)] leading-tight">{who} invited you to their family on Argus</h1>
          <p className="mt-6 leading-relaxed text-foreground/80">
            Joining links your two Argus accounts. In the Argus app, family members will be able to see that Argus is
            protecting each other, and hear when it warns about a likely scam (coming soon). What your messages say and
            which sites you visit are never shared.
          </p>
          {user ? (
            <JoinButton code={code} />
          ) : (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/login?next=${encodeURIComponent(`/app/join/${code}`)}`} className={cn(buttonVariants(), "h-11 rounded-full px-6")}>
                Sign in to join
              </Link>
              <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full px-6")}>
                Create a free account
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="font-display mt-12 text-[clamp(2.2rem,7vw,3.6rem)] leading-tight">This invite doesn&apos;t work anymore</h1>
          <p className="mt-6 leading-relaxed text-foreground/80">It has expired or was already used. Ask for a new one.</p>
        </>
      )}
      <p className="mt-12 text-sm text-muted-foreground">
        On Android? <Link href="/app" className="text-foreground underline underline-offset-4">Get the Argus app</Link>.
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Run tests, typecheck and lint; check the endpoints end to end**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src` → Expected: all pass.

Append to `.superpowers/e2e/app-api-check.mjs`:
```js
r = await call("/api/app/family/invite", { method: "POST", body: "{}" });
j = await r.json();
const code = j.url?.split("/app/join/")[1];
ok("invite link created", r.status === 200 && /^https?:\/\/[^/]+\/app\/join\/[A-Za-z0-9_-]{24}$/.test(j.url), j.url);
r = await fetch(`${BASE}/api/app/family/invite-info?code=${code}`);
j = await r.json();
ok("invite info needs no account", r.status === 200 && j.valid === true, JSON.stringify(j));
r = await call("/api/app/family/join", { method: "POST", body: JSON.stringify({ code }) });
j = await r.json();
ok("your own invite is refused with a clear message", r.status === 400 && /your own invite/.test(j.error), j.error);
r = await call("/api/app/family");
j = await r.json();
ok("family list loads", r.status === 200 && Array.isArray(j.members), `${j.members?.length} members`);
r = await fetch(`${BASE}/app/join/${code}`);
ok("join page greets the invitee", r.status === 200 && /invited you to their family/.test(await r.text()));
r = await fetch(`${BASE}/app/join/not-a-real-code-xxxxxxxx`);
ok("a dead invite says so", /doesn.t work anymore|doesn&#x27;t work anymore/.test(await r.text()));
```
Run: `node .superpowers/e2e/app-api-check.mjs` → Expected: all PASS. Then remove the tester's test invites:
```sql
delete from public.family_invites where inviter_id = (select id from auth.users where email = 'argus.demo.tester@gmail.com');
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260930120000_family_links.sql web/src/lib/family-invite.ts web/src/lib/family-invite.test.ts web/src/lib/family-invite-info.ts web/src/app/api/app/family web/src/app/app/join
git commit -m "feat: family invite links, with consent on both sides

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Website — latest release, the `/app` download page, and Digital Asset Links

**Files:**
- Create: `web/src/lib/app-release.ts`, `web/src/app/api/app/latest/route.ts`, `web/src/app/app/page.tsx`, `web/public/.well-known/assetlinks.json`
- Modify: `web/src/proxy.ts` (CRLF — use Edit: skip `.well-known` in the matcher)
- Test: `web/src/lib/app-release.test.ts`

**Interfaces:**
- Consumes: the release key's SHA-256 fingerprint (Task 2, Step 7).
- Produces: `pickAndroidRelease(releases: GithubRelease[]): AndroidRelease | null`; `latestAndroidRelease(): Promise<AndroidRelease | null>`; `type AndroidRelease = { version; apk; smsHelperApk: string | null; notes; publishedAt }`; `GET /api/app/latest` → `200 AndroidRelease` | `404 { error }` | `502 { error }`; page `/app`; `/.well-known/assetlinks.json`. Releases are tagged `android-v<version>` with assets `argus-<version>.apk` (and later `argus-sms-helper-<version>.apk`).

- [ ] **Step 1: Write the failing test**

`web/src/lib/app-release.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pickAndroidRelease, type GithubRelease } from "./app-release";

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/gyanvadhel/ARGUS/releases/download/x/${name}` });
const release = (tag: string, names: string[], extra: Partial<GithubRelease> = {}): GithubRelease => ({
  tag_name: tag, draft: false, prerelease: false, body: "Notes", published_at: "2026-10-01T10:00:00Z", assets: names.map(asset), ...extra,
});

describe("pickAndroidRelease", () => {
  it("takes the newest published Android release and its APKs", () => {
    const r = pickAndroidRelease([
      release("android-v0.2.0", ["argus-0.2.0.apk", "argus-sms-helper-0.2.0.apk"]),
      release("android-v0.1.0", ["argus-0.1.0.apk"]),
    ]);
    expect(r).toEqual({
      version: "0.2.0",
      apk: asset("argus-0.2.0.apk").browser_download_url,
      smsHelperApk: asset("argus-sms-helper-0.2.0.apk").browser_download_url,
      notes: "Notes",
      publishedAt: "2026-10-01T10:00:00Z",
    });
  });
  it("skips drafts, pre-releases, other tags and releases without the app", () => {
    const r = pickAndroidRelease([
      release("android-v0.4.0", ["argus-0.4.0.apk"], { draft: true }),
      release("android-v0.3.0", ["argus-0.3.0.apk"], { prerelease: true }),
      release("extension-v1.0.0", ["argus-extension.zip"]),
      release("android-v0.2.1", ["notes.txt"]),
      release("android-v0.2.0", ["argus-0.2.0.apk"]),
    ]);
    expect(r?.version).toBe("0.2.0");
    expect(r?.smsHelperApk).toBeNull();
  });
  it("says so when there's no Android release yet", () => {
    expect(pickAndroidRelease([])).toBeNull();
  });
});
```
Run: `cd web && npx vitest run src/lib/app-release.test.ts` → Expected: FAIL (`Cannot find module './app-release'`).

- [ ] **Step 2: Implement**

`web/src/lib/app-release.ts`:
```ts
// Argus for Android is published as GitHub releases tagged "android-v<version>" with an "argus-<version>.apk".

export type GithubAsset = { name: string; browser_download_url: string };
export type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body?: string | null;
  published_at?: string | null;
  assets: GithubAsset[];
};
export type AndroidRelease = { version: string; apk: string; smsHelperApk: string | null; notes: string; publishedAt: string };

const TAG = "android-v";
const RELEASES_URL = "https://api.github.com/repos/gyanvadhel/ARGUS/releases?per_page=20";

export function pickAndroidRelease(releases: GithubRelease[]): AndroidRelease | null {
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG)) continue;
    const apk = r.assets.find((a) => /^argus-\d[\w.-]*\.apk$/.test(a.name));
    if (!apk) continue;
    const helper = r.assets.find((a) => /^argus-sms-helper-\d[\w.-]*\.apk$/.test(a.name));
    return {
      version: r.tag_name.slice(TAG.length),
      apk: apk.browser_download_url,
      smsHelperApk: helper?.browser_download_url ?? null,
      notes: (r.body ?? "").slice(0, 2000),
      publishedAt: r.published_at ?? "",
    };
  }
  return null;
}

/** The newest release, asked of GitHub at most once an hour. */
export async function latestAndroidRelease(): Promise<AndroidRelease | null> {
  const res = await fetch(RELEASES_URL, {
    headers: {
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return pickAndroidRelease((await res.json()) as GithubRelease[]);
}
```
Run the test → Expected: PASS.

`web/src/app/api/app/latest/route.ts`:
```ts
import { latestAndroidRelease } from "@/lib/app-release";

export const revalidate = 3600;

export async function GET() {
  try {
    const release = await latestAndroidRelease();
    if (!release) return Response.json({ error: "No Android release yet." }, { status: 404 });
    return Response.json(release, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Couldn't check for updates right now." }, { status: 502 });
  }
}
```

- [ ] **Step 3: Add the download page**

`web/src/app/app/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { WatchingEye } from "@/components/eye/watching-eye";
import { buttonVariants } from "@/components/ui/button";
import { latestAndroidRelease, type AndroidRelease } from "@/lib/app-release";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Argus for Android",
  description: "Check links, messages, numbers, QR codes and screenshots for scams, right from your phone. Free.",
};
export const revalidate = 3600;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="font-display text-2xl text-muted-foreground">{n}</span>
      <p className="leading-relaxed text-foreground/85">{children}</p>
    </li>
  );
}

export default async function AppPage() {
  const release: AndroidRelease | null = await latestAndroidRelease().catch(() => null);
  const published = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-3">
        <WatchingEye logo className="h-5 w-8 text-foreground" strokeWidth={1.6} />
        <span className="font-display text-2xl">Argus</span>
      </Link>
      <h1 className="font-display mt-12 text-[clamp(2.6rem,8vw,4.5rem)]">Argus for Android</h1>
      <p className="mt-6 text-lg leading-relaxed text-foreground/85">
        Check links, messages, phone numbers, QR codes and screenshots for scams, right from your phone. Share anything
        to Argus from another app. Free, and it never says &ldquo;Safe&rdquo; without proof.
      </p>

      {release ? (
        <div className="mt-10">
          <a href={release.apk} className={cn(buttonVariants(), "h-12 rounded-full px-7 text-base")}>
            Download Argus {release.version}
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            {published ? `Released ${published}. ` : ""}Needs Android 8 or newer.
          </p>
        </div>
      ) : (
        <p className="mt-10 rounded-2xl border border-border/70 p-5 text-foreground/80">
          The first version is almost ready. Check back soon.
        </p>
      )}

      <section className="mt-14">
        <h2 className="font-serif text-2xl">Installing it</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Argus isn&apos;t on the Play Store yet, so Android asks a couple of extra questions the first time.
        </p>
        <ol className="mt-6 space-y-5">
          <Step n={1}>Tap <strong>Download</strong> on your phone.</Step>
          <Step n={2}>Open the downloaded file. If Android asks, allow your browser to install apps (&ldquo;Allow from this source&rdquo;), then go back.</Step>
          <Step n={3}>
            Tap <strong>Install</strong>. Play Protect may say it doesn&apos;t recognise the developer, because Argus isn&apos;t
            on the Play Store yet. Tap <strong>More details</strong>, then <strong>Install anyway</strong>.
          </Step>
          <Step n={4}>Open Argus. Sign in with the same account as this website, or skip and try it first.</Step>
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl">Coming next</h2>
        <p className="mt-3 leading-relaxed text-foreground/80">
          Warnings while a scam call rings, a scam-site blocker for every app, automatic text checks (an optional add-on)
          and Gmail alerts. The app tells you when an update is ready.
        </p>
      </section>

      <p className="mt-14 text-sm text-muted-foreground">
        What the app does with your data: see the <Link href="/privacy" className="text-foreground underline underline-offset-4">privacy policy</Link>.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Add Digital Asset Links and skip the proxy for it**

`web/public/.well-known/assetlinks.json` (replace the fingerprint with Task 2 Step 7's `SHA256:` value exactly as keytool printed it: uppercase, colon-separated):
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.askargus",
      "sha256_cert_fingerprints": ["AA:BB:…the 32-byte SHA-256 from Task 2…"]
    }
  }
]
```

In `web/src/proxy.ts` (CRLF file — Edit tool), change the matcher line from:
```ts
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
```
to:
```ts
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
```

- [ ] **Step 5: Test, typecheck, lint, and check locally**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: all pass.

With `npm run dev` running:
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/.well-known/assetlinks.json
curl -s -w " %{http_code}\n" http://localhost:3000/api/app/latest
curl -s http://localhost:3000/app | grep -o "Argus for Android" | head -1
```
Expected: `200 application/json`; `{"error":"No Android release yet."} 404` (before the first release); `Argus for Android`.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/app-release.ts web/src/lib/app-release.test.ts web/src/app/api/app/latest/route.ts web/src/app/app/page.tsx web/public/.well-known/assetlinks.json web/src/proxy.ts
git commit -m "feat(web): Android download page, latest-release endpoint, asset links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Deploy the website pieces (needs the user's go-ahead) and check them live**

The Android tasks talk to the live askargus.app, so the website half ships first; nothing on the site changes for existing visitors. Ask the user: "The website side of the app (new API endpoints, the family invite tables, the /app page) is ready and tested. May I push it? Also, when you have a minute: Supabase → Project Settings → API Keys → create a **secret key** and add it to Vercel as `SUPABASE_SECRET_KEY` (Sensitive, Production + Preview). It lets the app open website pages already signed in. Don't paste it here."

After the go-ahead: `git push origin main`, wait for the Vercel deployment to be READY (Vercel MCP `list_deployments`), then:
```bash
node .superpowers/e2e/app-api-check.mjs https://askargus.app
curl -s -o /dev/null -w "%{http_code} %{content_type} %{redirect_url}\n" https://askargus.app/.well-known/assetlinks.json
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://askargus.app&relation=delegate_permission/common.handle_all_urls" | head -c 400
```
Expected: all PASS (the handoff line takes the 200 branch once the user has added the secret key, the 503 branch before); `200 application/json` with no redirect; the statements list names `app.askargus`. Clean up the test scan and invites (SQL from Task 5 Step 7 and Task 7 Step 8).

---

### Task 9: Emulator and the adb driver (so every screen can be seen as it's built)

**Files:**
- Create (git-ignored): `.superpowers/e2e/adbui.py`
- Outside the repo: SDK packages `emulator`, `system-images;android-35;google_apis_playstore;x86_64`, `extras;google;Android_Emulator_Hypervisor_Driver`; AVD `argus35`

**Interfaces:**
- Produces: a running emulator reachable by `adb`; `adbui.py` functions `adb(*args)`, `find(text)`, `wait_for(text, timeout=30)`, `tap(text, timeout=30)`, `type_text(text)`, `screenshot(name) -> path`, `back()`, `start_app()`, `install(apk)`.

- [ ] **Step 1: Install the emulator packages**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"; . .\tools\env.ps1
$sdk = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
& $sdk "emulator" "system-images;android-35;google_apis_playstore;x86_64" "extras;google;Android_Emulator_Hypervisor_Driver"
```
Expected: the three packages appear in `& $sdk --list_installed` (about 2 GB downloaded).

- [ ] **Step 2: Install the emulator's hypervisor driver (one admin prompt)**

Tell the user first: "Windows will ask for permission to install Android's emulator driver; please click Yes." Then:
```powershell
Start-Process -FilePath "$env:ANDROID_HOME\extras\google\Android_Emulator_Hypervisor_Driver\silent_install.bat" -Verb RunAs -Wait
sc.exe query aehd
```
Expected: `STATE : 4 RUNNING`. If it fails (e.g. another hypervisor holds the CPU's virtualisation), stop the emulator path: ask the user to connect their phone over USB (Settings → About phone → tap Build number 7 times → Developer options → USB debugging on → plug in → allow the PC) and use `adb devices` to confirm it shows as `device`. Everything below works the same on a phone.

- [ ] **Step 3: Create and boot the virtual phone**

```powershell
"no" | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" create avd -n argus35 -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_6 --force
Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList "-avd argus35 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot-save" -WindowStyle Hidden
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb wait-for-device
do { Start-Sleep 5; $booted = (& $adb shell getprop sys.boot_completed).Trim() } until ($booted -eq "1")
"booted"
```
Expected: `booted` (first boot can take a few minutes).

- [ ] **Step 4: Write the adb driver**

`.superpowers/e2e/adbui.py`:
```python
"""Throwaway helper: drive Argus on the emulator (or a USB phone) through adb and uiautomator."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ADB = os.path.expandvars(r"%USERPROFILE%\.argus-tools\android-sdk\platform-tools\adb.exe")
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tmp", "android")
PACKAGE = "app.askargus"


def adb(*args, check=True):
    return subprocess.run([ADB, *args], capture_output=True, text=True, encoding="utf-8", check=check).stdout


def nodes():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    xml = adb("shell", "cat", "/sdcard/ui.xml")
    return list(ET.fromstring(xml[xml.index("<"):]).iter("node"))


def find(text, exact=False):
    want = text.lower()
    for n in nodes():
        for attr in ("text", "content-desc"):
            value = (n.get(attr) or "").lower()
            if (value == want) if exact else (want in value):
                return n
    return None


def wait_for(text, timeout=30, exact=False):
    end = time.time() + timeout
    while time.time() < end:
        n = find(text, exact)
        if n is not None:
            return n
        time.sleep(1)
    raise AssertionError(f"'{text}' not on screen after {timeout}s")


def center(n):
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds")))
    return (x1 + x2) // 2, (y1 + y2) // 2


def tap(text, timeout=30, exact=False):
    x, y = center(wait_for(text, timeout, exact))
    adb("shell", "input", "tap", str(x), str(y))


def type_text(text):
    escaped = "".join("\\" + c if c in "\\&;()<>|*'\"`$!?#" else c for c in text).replace(" ", "%s")
    adb("shell", "input", "text", escaped)


def screenshot(name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, f"{name}.png")
    adb("shell", "screencap", "-p", "/sdcard/shot.png")
    adb("pull", "/sdcard/shot.png", path)
    return path


def back():
    adb("shell", "input", "keyevent", "4")


def install(apk):
    print(adb("install", "-r", apk))


def start_app(clear=False):
    if clear:
        adb("shell", "pm", "clear", PACKAGE)
    adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity")
    time.sleep(2)
```

- [ ] **Step 5: Smoke-test the driver with the skeleton APK**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main"
api\.venv\Scripts\python -c "import sys; sys.path.insert(0, '.superpowers/e2e'); import adbui as u; u.install(r'android\app\build\outputs\apk\debug\app-debug.apk'); u.start_app(); u.wait_for('Argus'); print(u.screenshot('skeleton'))"
```
Expected: `Success` from install, then a path to `skeleton.png`; view it with the Read tool and see the word "Argus".

No commit (only git-ignored files).

---

### Task 10: The look — theme, fonts, icons, the living eye, score dial, pills, cards, buttons

**Files:**
- Create: `android/app/src/main/res/values/colors.xml`, `res/values/themes.xml`, `res/drawable/ic_launcher_foreground.xml`, `res/drawable/ic_notification.xml`, `res/mipmap-anydpi-v26/ic_launcher.xml`, `res/mipmap-anydpi-v26/ic_launcher_round.xml`, `res/font/archivo.ttf` (downloaded), `src/main/assets/licenses/archivo-OFL.txt` (downloaded)
- Create in `android/app/src/main/java/app/askargus/ui/`: `theme/Color.kt`, `theme/Type.kt`, `theme/Theme.kt`, `components/Touch.kt`, `components/LivingEye.kt`, `components/ScoreDial.kt`, `components/Pills.kt`, `components/ArgusCard.kt`, `components/Buttons.kt`
- Modify: `android/app/src/main/AndroidManifest.xml` (icon, theme), `android/app/src/main/java/app/askargus/MainActivity.kt` (a temporary gallery of the components, replaced in Task 11)

**Interfaces:**
- Consumes: `Risk`, `Gaze` (Tasks 2–3).
- Produces: `ArgusColors` (all tokens + `risk(r: Risk): Color`), `ArgusTypography`, `@Composable ArgusTheme(content)`; `class TouchState`, `LocalTouch`, `Modifier.trackTouches(state)`; `enum class EyeMood { IDLE, WATCHING, SCANNING, SAFE, DANGER }`, `@Composable LivingEye(mood, modifier)`; `@Composable ScoreDial(score: Int, color: Color, modifier)`; `@Composable LevelPill(label, color)`, `@Composable SoonPill()`; `@Composable ArgusCard(modifier, onClick: (() -> Unit)? = null, content: ColumnScope.() -> Unit)`; `@Composable ArgusButton(text, onClick, modifier, enabled = true, busy = false)`, `@Composable ArgusOutlinedButton(text, onClick, modifier, enabled = true)`; drawables `R.drawable.ic_notification` (white eye), `R.mipmap.ic_launcher`.

- [ ] **Step 1: Download the Archivo font and its licence**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android\app\src\main"
New-Item -ItemType Directory -Force res\font, assets\licenses | Out-Null
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf" -OutFile res\font\archivo.ttf
Invoke-WebRequest "https://github.com/google/fonts/raw/main/ofl/archivo/OFL.txt" -OutFile assets\licenses\archivo-OFL.txt
(Get-Item res\font\archivo.ttf).Length; Select-String -Path assets\licenses\archivo-OFL.txt -Pattern "SIL Open Font License" | Select-Object -First 1
```
Expected: a size well over 100000 bytes and a line mentioning the SIL Open Font License. (If the URL 404s, open `https://github.com/google/fonts/tree/main/ofl/archivo` to find the current variable-font file name.)

- [ ] **Step 2: Add colours, theme and icons**

`res/values/colors.xml`:
```xml
<resources>
    <color name="argus_background">#FF08080A</color>
    <color name="ic_launcher_background">#FF08080A</color>
</resources>
```

`res/values/themes.xml`:
```xml
<resources>
    <style name="Theme.Argus" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">@color/argus_background</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@color/argus_background</item>
    </style>
</resources>
```

`res/drawable/ic_launcher_foreground.xml` (the app icon's eye, from `web/src/app/icon.svg`, centred in the adaptive-icon safe zone):
```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <group android:scaleX="1.15" android:scaleY="1.15" android:translateX="17.2" android:translateY="17.2">
        <clip-path android:pathData="M6,32C17,14.5 47,14.5 58,32C47,49.5 17,49.5 6,32Z" />
        <path android:pathData="M32,18.8a13.2,13.2 0,1 1,0 26.4a13.2,13.2 0,1 1,0 -26.4Z">
            <aapt:attr name="android:fillColor">
                <gradient android:type="linear" android:startX="18.8" android:startY="18.8" android:endX="45.2" android:endY="45.2">
                    <item android:offset="0" android:color="#FF6D6BFF" />
                    <item android:offset="0.5" android:color="#FFA66BFF" />
                    <item android:offset="1" android:color="#FFFF8A7A" />
                </gradient>
            </aapt:attr>
        </path>
        <path android:fillColor="#FF08080A" android:pathData="M32,26.6a5.4,5.4 0,1 1,0 10.8a5.4,5.4 0,1 1,0 -10.8Z" />
        <path android:fillColor="#E6FFFFFF" android:pathData="M28.3,26.2a1.7,1.7 0,1 1,0 3.4a1.7,1.7 0,1 1,0 -3.4Z" />
    </group>
    <group android:scaleX="1.15" android:scaleY="1.15" android:translateX="17.2" android:translateY="17.2">
        <path android:strokeColor="#FFECE6DC" android:strokeWidth="3.6" android:strokeLineJoin="round"
            android:pathData="M6,32C17,14.5 47,14.5 58,32C47,49.5 17,49.5 6,32Z" />
    </group>
</vector>
```

`res/drawable/ic_notification.xml` (white silhouette for notifications and the Argus tab):
```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="64" android:viewportHeight="64">
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="5" android:strokeLineJoin="round" android:fillColor="#00000000"
        android:pathData="M6,32C17,14.5 47,14.5 58,32C47,49.5 17,49.5 6,32Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M32,22a10,10 0,1 1,0 20a10,10 0,1 1,0 -20Z" />
</vector>
```

`res/mipmap-anydpi-v26/ic_launcher.xml` and `res/mipmap-anydpi-v26/ic_launcher_round.xml` (same content):
```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
```

In `AndroidManifest.xml`, change the `<application …>` opening tag to:
```xml
    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:theme="@style/Theme.Argus">
```

- [ ] **Step 3: Add the theme code**

`ui/theme/Color.kt`:
```kotlin
package app.askargus.ui.theme

import androidx.compose.ui.graphics.Color
import app.askargus.core.Risk

/** The website's tokens (web/src/app/globals.css). */
object ArgusColors {
    val Background = Color(0xFF08080A)
    val Card = Color(0xFF0E0E11)
    val Muted = Color(0xFF131316)
    val Accent = Color(0xFF1B1B20)
    val Foreground = Color(0xFFECE6DC)
    val MutedText = Color(0xFF8F8B93)
    val Border = Color(0x1AECE6DC)
    val Input = Color(0x29ECE6DC)
    val OnPrimary = Color(0xFF0B0B0D)
    val Safe = Color(0xFF5ED3B0)
    val Clear = Color(0xFF9CB8B0)
    val Low = Color(0xFFF5C451)
    val Sus = Color(0xFFFF9F4D)
    val High = Color(0xFFFF5D6C)
    val Unknown = Color(0xFF8F8B93)
    val IrisA = Color(0xFF6D6BFF)
    val IrisB = Color(0xFFA66BFF)
    val IrisC = Color(0xFFFF8A7A)

    fun risk(risk: Risk): Color = when (risk) {
        Risk.SAFE -> Safe
        Risk.CLEAR -> Clear
        Risk.LOW -> Low
        Risk.SUSPICIOUS -> Sus
        Risk.HIGH -> High
        Risk.UNKNOWN -> Unknown
    }
}
```

`ui/theme/Type.kt`:
```kotlin
package app.askargus.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.askargus.R

// Archivo's width axis condenses the display type, as on the website.
@OptIn(ExperimentalTextApi::class)
private fun archivo(weight: Int, width: Float) = Font(
    R.font.archivo,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)),
)

val DisplayFamily = FontFamily(archivo(800, 72f))
val BodyFamily = FontFamily(archivo(400, 100f), archivo(500, 100f), archivo(600, 100f))

val ArgusTypography = Typography(
    displayLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 56.sp, lineHeight = 56.sp),
    displayMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 44.sp, lineHeight = 46.sp),
    headlineMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 32.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 17.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(400), fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(400), fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 15.sp),
    labelMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(500), fontSize = 12.sp),
)
```

`ui/theme/Theme.kt`:
```kotlin
package app.askargus.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val scheme = darkColorScheme(
    primary = ArgusColors.Foreground,
    onPrimary = ArgusColors.OnPrimary,
    secondary = ArgusColors.Accent,
    onSecondary = ArgusColors.Foreground,
    background = ArgusColors.Background,
    onBackground = ArgusColors.Foreground,
    surface = ArgusColors.Background,
    onSurface = ArgusColors.Foreground,
    surfaceVariant = ArgusColors.Card,
    onSurfaceVariant = ArgusColors.MutedText,
    surfaceContainer = ArgusColors.Card,
    outline = ArgusColors.Border,
    error = ArgusColors.High,
)

@Composable
fun ArgusTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = ArgusTypography, content = content)
}
```

- [ ] **Step 4: Add the components**

`ui/components/Touch.kt`:
```kotlin
package app.askargus.ui.components

import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput

/** The last place someone touched the screen, so the eyes can look there. Touches are observed, never consumed. */
class TouchState {
    var position by mutableStateOf<Offset?>(null)
    var at by mutableLongStateOf(0L)
}

val LocalTouch = staticCompositionLocalOf { TouchState() }

fun Modifier.trackTouches(state: TouchState): Modifier = pointerInput(state) {
    awaitPointerEventScope {
        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            event.changes.firstOrNull()?.let {
                state.position = it.position
                state.at = SystemClock.uptimeMillis()
            }
        }
    }
}
```

`ui/components/LivingEye.kt`:
```kotlin
package app.askargus.ui.components

import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import app.askargus.core.Gaze
import app.askargus.ui.theme.ArgusColors
import kotlin.math.sin
import kotlin.random.Random

enum class EyeMood { IDLE, WATCHING, SCANNING, SAFE, DANGER }

private class BlinkClock {
    private var start = -1L
    private var next = 0L

    fun closure(now: Long): Float {
        if (next == 0L) next = now + 1500
        if (start < 0 && now >= next) start = now
        if (start < 0) return 0f
        val t = (now - start) / 190f
        if (t >= 1f) {
            start = -1
            next = now + 2400 + Random.nextLong(7000)
        }
        return Gaze.blinkClosure(t)
    }
}

/** The Argus eye, drawn like the app icon: it blinks, looks where you last touched, and its mood shows state. */
@Composable
fun LivingEye(mood: EyeMood, modifier: Modifier = Modifier) {
    val touch = LocalTouch.current
    var origin by remember { mutableStateOf(Offset.Zero) }
    val time by produceState(0L) { while (true) withFrameMillis { value = it } }
    val blink = remember { BlinkClock() }
    val open by animateFloatAsState(if (mood == EyeMood.DANGER) 0.72f else 1f, tween(500), label = "open")
    val iris = when (mood) {
        EyeMood.SAFE -> listOf(ArgusColors.Safe, ArgusColors.Clear)
        EyeMood.DANGER -> listOf(ArgusColors.High, ArgusColors.Sus)
        else -> listOf(ArgusColors.IrisA, ArgusColors.IrisB, ArgusColors.IrisC)
    }

    Canvas(modifier.aspectRatio(2f).onGloballyPositioned { origin = it.positionInRoot() }) {
        val halfW = size.width * 0.46f
        val c = center
        val lift = 0.673f * halfW * open * (1f - blink.closure(time) * 0.94f)
        val almond = Path().apply {
            moveTo(c.x - halfW, c.y)
            cubicTo(c.x - 0.577f * halfW, c.y - lift, c.x + 0.577f * halfW, c.y - lift, c.x + halfW, c.y)
            cubicTo(c.x + 0.577f * halfW, c.y + lift, c.x - 0.577f * halfW, c.y + lift, c.x - halfW, c.y)
            close()
        }
        val irisR = halfW * 0.508f
        val maxShift = halfW * 0.24f
        val last = touch.position
        val fresh = last != null && SystemClock.uptimeMillis() - touch.at < 2500
        val shift = if (fresh) {
            val t = last!! - origin
            val (dx, dy) = Gaze.pupilOffset(c.x, c.y, t.x, t.y, maxShift, size.width * 1.5f)
            Offset(dx, dy * 0.7f)
        } else {
            val s = time / 1000f * if (mood == EyeMood.SCANNING) 3.2f else 0.35f
            Offset(sin(s) * maxShift * 0.8f, sin(s * 0.63f + 1f) * maxShift * 0.35f)
        }
        val ic = c + shift
        clipPath(almond) {
            drawCircle(Brush.linearGradient(iris, ic - Offset(irisR, irisR), ic + Offset(irisR, irisR)), irisR, ic)
            drawCircle(ArgusColors.Background, irisR * 0.41f, ic)
            drawCircle(Color.White.copy(alpha = 0.9f), irisR * 0.13f, ic + Offset(-irisR * 0.28f, -irisR * 0.31f))
        }
        drawPath(almond, ArgusColors.Foreground, style = Stroke(width = halfW * 0.085f, join = StrokeJoin.Round))
    }
}
```

`ui/components/ScoreDial.kt`:
```kotlin
package app.askargus.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors
import kotlin.math.roundToInt

/** Risk out of 100 as a 270° dial that fills when a verdict arrives, like the website's. */
@Composable
fun ScoreDial(score: Int, color: Color, modifier: Modifier = Modifier) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(score) {
        progress.snapTo(0f)
        progress.animateTo(score / 100f, tween(900, easing = FastOutSlowInEasing))
    }
    Box(modifier.size(168.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 10.dp.toPx()
            val inset = Offset(stroke / 2, stroke / 2)
            val arc = Size(size.width - stroke, size.height - stroke)
            drawArc(ArgusColors.Accent, 135f, 270f, false, inset, arc, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(color, 135f, 270f * progress.value, false, inset, arc, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("${(progress.value * 100).roundToInt()}", style = MaterialTheme.typography.displayMedium, color = color)
            Text("risk out of 100", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        }
    }
}
```

`ui/components/Pills.kt`:
```kotlin
package app.askargus.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun LevelPill(label: String, color: Color) {
    Row(
        Modifier.border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).background(color, CircleShape))
        Box(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = color)
    }
}

@Composable
fun SoonPill() {
    Text(
        "Coming soon",
        Modifier.border(1.dp, ArgusColors.Border, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
        style = MaterialTheme.typography.labelMedium,
        color = ArgusColors.MutedText,
    )
}
```

`ui/components/ArgusCard.kt`:
```kotlin
package app.askargus.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun ArgusCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(ArgusColors.Card)
            .border(1.dp, ArgusColors.Border, shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(20.dp),
        content = content,
    )
}
```

`ui/components/Buttons.kt`:
```kotlin
package app.askargus.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun ArgusButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false) {
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled && !busy,
        colors = ButtonDefaults.buttonColors(containerColor = ArgusColors.Foreground, contentColor = ArgusColors.OnPrimary),
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = ArgusColors.OnPrimary, strokeWidth = 2.dp)
        else Text(text)
    }
}

@Composable
fun ArgusOutlinedButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled,
        border = BorderStroke(1.dp, ArgusColors.Input),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = ArgusColors.Foreground),
    ) { Text(text) }
}
```

- [ ] **Step 5: Show the components in a temporary gallery (replaced in Task 11)**

`MainActivity.kt`:
```kotlin
package app.askargus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LevelPill
import app.askargus.ui.components.LivingEye
import app.askargus.ui.components.LocalTouch
import app.askargus.ui.components.ScoreDial
import app.askargus.ui.components.SoonPill
import app.askargus.ui.components.TouchState
import app.askargus.ui.components.trackTouches
import app.askargus.ui.theme.ArgusColors
import app.askargus.ui.theme.ArgusTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val touch = remember { TouchState() }
            ArgusTheme {
                CompositionLocalProvider(LocalTouch provides touch) {
                    Column(
                        Modifier.fillMaxSize().background(ArgusColors.Background).trackTouches(touch).systemBarsPadding().padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.6f))
                        Text("Argus", style = MaterialTheme.typography.displayLarge)
                        ScoreDial(96, ArgusColors.High)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            LevelPill("High risk", ArgusColors.High)
                            LevelPill("No red flags", ArgusColors.Clear)
                            SoonPill()
                        }
                        ArgusCard { Text("A card, with body text in Archivo.", style = MaterialTheme.typography.bodyLarge) }
                        ArgusButton("Check", onClick = {}, modifier = Modifier.fillMaxWidth())
                        ArgusOutlinedButton("Scan QR", onClick = {}, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Build, install, and look at it**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"; . .\tools\env.ps1
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
Set-Location ..
api\.venv\Scripts\python -c "import sys; sys.path.insert(0, '.superpowers/e2e'); import adbui as u; u.install(r'android\app\build\outputs\apk\debug\app-debug.apk'); u.start_app(); import time; time.sleep(3); print(u.screenshot('gallery'))"
```
Expected: tests pass, build succeeds, and `gallery.png` shows the eye (violet-to-coral iris inside a bone-coloured almond), "Argus" in condensed Archivo, a red dial filling to 96, three pills, a card and two pill buttons on near-black. Check the launcher icon too: `u.adb("shell","input","keyevent","3")` (Home), then screenshot — the Argus eye icon on a black tile. Fix anything that looks wrong before continuing.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/res android/app/src/main/assets android/app/src/main/AndroidManifest.xml android/app/src/main/java/app/askargus/ui android/app/src/main/java/app/askargus/MainActivity.kt
git commit -m "feat(android): Argus look: theme, Archivo, icon, living eye, dial and components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: App wiring — encrypted session, preferences, navigation, welcome, sign-in (email + Google)

Screens built in later tasks start as tiny placeholders in `ui/Stubs.kt` with their **final signatures**, so the navigation is written once. Each later task deletes its stub and adds the real screen.

**Files:**
- Create: `android/app/src/main/java/app/askargus/{ArgusApp.kt, AppContainer.kt, Host.kt}`, `net/KeystoreCipher.kt`, `net/EncryptedSessionStore.kt`, `data/Prefs.kt`, `ui/nav/ArgusNav.kt`, `ui/Stubs.kt`, `ui/onboarding/WelcomeScreen.kt`, `ui/auth/SignInViewModel.kt`, `ui/auth/SignInScreen.kt`, `ui/auth/GoogleSignIn.kt`
- Modify: `MainActivity.kt` (replace the gallery), `AndroidManifest.xml`
- Test: `android/app/src/test/java/app/askargus/ui/auth/SignInViewModelTest.kt`

**Interfaces:**
- Consumes: `Account`, `ArgusApi`, `SupabaseAuth`, `ObservableSessionStore`, `Session` (Task 4); `HandoffPlan`, `Nonce` (Task 3); theme + components (Task 10).
- Produces:
  - `class AppContainer(context)` with `http`, `prefs: Prefs`, `account: Account`, `api: ArgusApi` (Task 12 adds `activity` and `reader`)
  - `class ArgusApp : Application` exposing `container`
  - `interface Host { fun openPage(path: String, force: Boolean = false); fun openUrl(url: String); fun share(text: String, title: String); suspend fun googleSignIn(): GoogleSignIn.Result }`, `LocalHost`
  - `class Prefs(context)`: `onboarded: Flow<Boolean>`, `setOnboarded()`, `webSignedInFor(): String?`, `setWebSignedInFor(userId: String?)`, `availableUpdate: Flow<String?>`, `setAvailableUpdate(v: String?)`, `notifiedVersion(): String?`, `setNotifiedVersion(v)`, `askedNotifications(): Boolean`, `setAskedNotifications()`
  - `Routes` constants and `Routes.signIn(back: Boolean)`, `Routes.join(code)`; `@Composable ArgusNav(container, onboarded: Boolean)`
  - Final screen signatures: `HomeScreen(container, go: (String) -> Unit)`, `ScanScreen(container, go, back: () -> Unit)`, `QrCameraScreen(container, back)`, `ActivityScreen(container)`, `ArgusScreen(container)`, `SettingsScreen(container, go)`, `FamilyScreen(container, go, back)`, `JoinFamilyScreen(container, code: String, go, back)`, `LicensesScreen(back)`, `WelcomeScreen(onStart)`, `SignInScreen(container, back: Boolean, onDone, onSkip)`
  - `GoogleSignIn.request(activity, webClientId): Result(idToken, rawNonce)`, `GoogleSignIn.friendly(e): String`
  - `SignInViewModel(account)` with `state: StateFlow<UiState(mode, busy, error, notice, done)>`, `setMode`, `submit(name, email, password)`, `google(idToken, rawNonce)`, `googleFailed(message)`; `SignInViewModel.validate(mode, name, email, password): String?`

- [ ] **Step 1: Write the failing view-model test**

`SignInViewModelTest.kt`:
```kotlin
package app.askargus.ui.auth

import app.askargus.net.Account
import app.askargus.net.MemorySessionStore
import app.askargus.net.NOW
import app.askargus.net.ObservableSessionStore
import app.askargus.net.SupabaseAuth
import app.askargus.net.sessionJson
import app.askargus.ui.auth.SignInViewModel.Mode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SignInViewModelTest {
    private val server = MockWebServer()
    private lateinit var vm: SignInViewModel

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.start()
        val auth = SupabaseAuth(OkHttpClient(), server.url("/").toString(), "pk", now = { NOW })
        vm = SignInViewModel(Account(auth, ObservableSessionStore(MemorySessionStore()), "https://askargus.app"))
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
        runCatching { server.shutdown() }
    }

    private fun settled() = runBlocking { withTimeout(5000) { vm.state.first { !it.busy && (it.done || it.error != null || it.notice != null) } } }

    @Test fun validatesBeforeCallingTheServer() {
        assertEquals("Tell us your name.", SignInViewModel.validate(Mode.CREATE, " ", "a@b.c", "12345678"))
        assertEquals("Enter your email address.", SignInViewModel.validate(Mode.SIGN_IN, "", "nope", "x"))
        assertEquals("Use at least 8 characters for your password.", SignInViewModel.validate(Mode.CREATE, "Asha", "a@b.c", "short"))
        assertEquals("Enter your password.", SignInViewModel.validate(Mode.SIGN_IN, "", "a@b.c", ""))
        assertNull(SignInViewModel.validate(Mode.SIGN_IN, "", "a@b.c", "x"))
        vm.submit("", "nope", "")
        assertEquals("Enter your email address.", vm.state.value.error)
        assertEquals(0, server.requestCount)
    }

    @Test fun signingInFinishes() {
        server.enqueue(MockResponse().setBody(sessionJson("a1")))
        vm.submit("", "asha@example.com", "pw123456")
        assertTrue(settled().done)
    }

    @Test fun wrongPasswordIsShown() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"msg":"Invalid login credentials"}"""))
        vm.submit("", "asha@example.com", "wrong")
        assertEquals("That email and password don't match.", settled().error)
    }

    @Test fun newAccountsAreToldToCheckTheirInbox() {
        vm.setMode(Mode.CREATE)
        server.enqueue(MockResponse().setBody("""{"id":"u9","identities":[{"id":"i"}]}"""))
        vm.submit("Asha", "new@example.com", "pw123456")
        val s = settled()
        assertEquals(Mode.SIGN_IN, s.mode)
        assertTrue(s.notice!!.startsWith("Check your inbox"))
    }

    @Test fun anExistingEmailIsToldToSignIn() {
        vm.setMode(Mode.CREATE)
        server.enqueue(MockResponse().setBody("""{"id":"u9","identities":[]}"""))
        vm.submit("Asha", "old@example.com", "pw123456")
        assertEquals("That email already has an account. Sign in instead.", settled().error)
    }
}
```
Run: `.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.ui.auth.*"` → Expected: FAIL (unresolved `SignInViewModel`).

- [ ] **Step 2: Implement the view model**

`ui/auth/SignInViewModel.kt`:
```kotlin
package app.askargus.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.askargus.net.Account
import app.askargus.net.AuthException
import app.askargus.net.SignUpResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

class SignInViewModel(private val account: Account) : ViewModel() {
    enum class Mode { SIGN_IN, CREATE }

    data class UiState(
        val mode: Mode = Mode.SIGN_IN,
        val busy: Boolean = false,
        val error: String? = null,
        val notice: String? = null,
        val done: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun setMode(mode: Mode) = _state.update { it.copy(mode = mode, error = null, notice = null) }

    fun submit(name: String, email: String, password: String) {
        val current = _state.value
        if (current.busy) return
        validate(current.mode, name, email, password)?.let { problem ->
            _state.update { it.copy(error = problem, notice = null) }
            return
        }
        launchAuth {
            if (current.mode == Mode.SIGN_IN) {
                account.signIn(email, password)
                _state.update { it.copy(busy = false, done = true) }
            } else when (account.signUp(name, email, password)) {
                is SignUpResult.SignedIn -> _state.update { it.copy(busy = false, done = true) }
                SignUpResult.CheckInbox -> _state.update {
                    it.copy(busy = false, mode = Mode.SIGN_IN, notice = "Check your inbox: we sent a link to confirm your email. Then sign in here.")
                }
                SignUpResult.AlreadyRegistered -> _state.update {
                    it.copy(busy = false, mode = Mode.SIGN_IN, error = "That email already has an account. Sign in instead.")
                }
            }
        }
    }

    fun google(idToken: String, rawNonce: String) {
        if (_state.value.busy) return
        launchAuth {
            account.signInWithGoogle(idToken, rawNonce)
            _state.update { it.copy(busy = false, done = true) }
        }
    }

    fun googleFailed(message: String) = _state.update { it.copy(error = message, notice = null) }

    private fun launchAuth(block: suspend () -> Unit) {
        _state.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (e: AuthException) {
                _state.update { it.copy(busy = false, error = e.message) }
            } catch (e: IOException) {
                _state.update { it.copy(busy = false, error = "Couldn't reach Argus. Check your connection.") }
            }
        }
    }

    companion object {
        fun validate(mode: Mode, name: String, email: String, password: String): String? = when {
            mode == Mode.CREATE && name.isBlank() -> "Tell us your name."
            !email.contains('@') -> "Enter your email address."
            password.isEmpty() -> "Enter your password."
            mode == Mode.CREATE && password.length < 8 -> "Use at least 8 characters for your password."
            else -> null
        }
    }
}
```
Run the test → Expected: PASS. (Note `validate(CREATE, "Asha", "a@b.c", "short")`: not empty, so it reaches the length rule.)

- [ ] **Step 3: Add storage, the container, the host and Google sign-in**

`net/KeystoreCipher.kt`:
```kotlin
package app.askargus.net

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM with a key that never leaves the phone's Android Keystore. */
class KeystoreCipher(private val alias: String = "argus_session") {
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return cipher.iv + cipher.doFinal(plain)
    }

    fun decrypt(data: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, 12))
        return cipher.doFinal(data, 12, data.size - 12)
    }
}
```

`net/EncryptedSessionStore.kt`:
```kotlin
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
```

`data/Prefs.kt`:
```kotlin
package app.askargus.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
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
}
```

`AppContainer.kt`:
```kotlin
package app.askargus

import android.content.Context
import app.askargus.data.Prefs
import app.askargus.net.Account
import app.askargus.net.ArgusApi
import app.askargus.net.EncryptedSessionStore
import app.askargus.net.ObservableSessionStore
import app.askargus.net.SupabaseAuth
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Everything the screens and background jobs share, created once per process. */
class AppContainer(context: Context) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(70, TimeUnit.SECONDS)
        .callTimeout(75, TimeUnit.SECONDS)
        .build()
    val prefs = Prefs(context)
    private val sessions = ObservableSessionStore(EncryptedSessionStore(context))
    private val auth = SupabaseAuth(http, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY)
    val account = Account(auth, sessions, BuildConfig.APP_URL, onSignedOut = { prefs.setWebSignedInFor(null) })
    val api = ArgusApi(http, BuildConfig.APP_URL, auth, sessions)
}
```

`ArgusApp.kt`:
```kotlin
package app.askargus

import android.app.Application

class ArgusApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
```

`Host.kt`:
```kotlin
package app.askargus

import androidx.compose.runtime.staticCompositionLocalOf
import app.askargus.ui.auth.GoogleSignIn

/** What screens ask of the activity: opening pages and links, sharing, and Google's account picker. */
interface Host {
    fun openPage(path: String, force: Boolean = false)
    fun openUrl(url: String)
    fun share(text: String, title: String)
    suspend fun googleSignIn(): GoogleSignIn.Result
}

val LocalHost = staticCompositionLocalOf<Host> { error("Host not provided") }
```

`ui/auth/GoogleSignIn.kt`:
```kotlin
package app.askargus.ui.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.askargus.core.Nonce
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** Google's account picker. Google gets the nonce's hash; Supabase gets the raw nonce to check it. */
object GoogleSignIn {
    class Result(val idToken: String, val rawNonce: String)

    suspend fun request(activity: Activity, webClientId: String): Result {
        val raw = Nonce.raw()
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .setNonce(Nonce.sha256Hex(raw))
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            return Result(GoogleIdTokenCredential.createFrom(credential.data).idToken, raw)
        }
        throw IllegalStateException("Google didn't return an account.")
    }

    fun friendly(e: Throwable): String = when (e) {
        is GetCredentialCancellationException -> "Google sign-in was cancelled."
        is NoCredentialException -> "There's no Google account on this phone. Add one in Settings, or use email."
        is GetCredentialException -> "Google sign-in isn't available right now. Use email instead."
        else -> e.message ?: "Google sign-in didn't work. Use email instead."
    }
}
```

- [ ] **Step 4: Add the screens and navigation**

`ui/onboarding/WelcomeScreen.kt`:
```kotlin
package app.askargus.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.theme.ArgusColors

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.SpaceBetween) {
        Column {
            Spacer(Modifier.height(40.dp))
            LivingEye(EyeMood.WATCHING, Modifier.fillMaxWidth(0.7f))
            Spacer(Modifier.height(36.dp))
            Text("Argus", style = MaterialTheme.typography.displayLarge)
            Text("The watcher that never sleeps.", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            Text(
                "Check any link, message, phone number, QR code or screenshot for scams, right from your phone.",
                style = MaterialTheme.typography.bodyLarge,
                color = ArgusColors.Foreground.copy(alpha = 0.8f),
            )
        }
        Column {
            ArgusButton("Get started", onClick = onStart, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Text("Free. Argus never says “Safe” without proof.", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        }
    }
}
```

`ui/auth/SignInScreen.kt`:
```kotlin
package app.askargus.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.ui.auth.SignInViewModel.Mode
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(container: AppContainer, back: Boolean, onDone: () -> Unit, onSkip: () -> Unit) {
    val vm: SignInViewModel = viewModel { SignInViewModel(container.account) }
    val state by vm.state.collectAsState()
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val creating = state.mode == Mode.CREATE

    LaunchedEffect(state.done) { if (state.done) onDone() }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        LivingEye(if (state.busy) EyeMood.SCANNING else EyeMood.WATCHING, Modifier.fillMaxWidth(0.4f).align(Alignment.CenterHorizontally))
        Text(if (creating) "Create your account" else "Sign in to Argus", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Checks use Argus's servers, so they need a free account. It's the same account as on askargus.app.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.MutedText,
        )
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            ArgusOutlinedButton(
                "Continue with Google",
                onClick = {
                    scope.launch {
                        runCatching { host.googleSignIn() }
                            .onSuccess { vm.google(it.idToken, it.rawNonce) }
                            .onFailure { vm.googleFailed(GoogleSignIn.friendly(it)) }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.busy,
            )
            Text("or with email", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
        if (creating) {
            OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(
            email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        state.error?.let { Text(it, color = ArgusColors.High, style = MaterialTheme.typography.bodyMedium) }
        state.notice?.let { Text(it, color = ArgusColors.Safe, style = MaterialTheme.typography.bodyMedium) }
        ArgusButton(
            if (creating) "Create account" else "Sign in",
            onClick = { vm.submit(name, email, password) },
            modifier = Modifier.fillMaxWidth(),
            busy = state.busy,
        )
        TextButton(onClick = { vm.setMode(if (creating) Mode.SIGN_IN else Mode.CREATE) }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (creating) "I already have an account" else "New to Argus? Create an account", color = ArgusColors.Foreground)
        }
        TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (back) "Not now" else "Skip for now", color = ArgusColors.MutedText)
        }
    }
}
```

`ui/Stubs.kt` (temporary; each later task removes its stub):
```kotlin
package app.askargus.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.nav.Routes
import kotlinx.coroutines.launch

@Composable
private fun Placeholder(title: String, content: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        content()
    }
}

@Composable
fun HomeScreen(container: AppContainer, go: (String) -> Unit) {
    val session by container.account.session.collectAsState()
    Placeholder("Home") {
        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.6f))
        Text(session?.let { "Signed in as ${it.email}" } ?: "Signed out")
        if (session == null) ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) })
    }
}

@Composable
fun SettingsScreen(container: AppContainer, go: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val session by container.account.session.collectAsState()
    Placeholder("Settings") {
        if (session != null) ArgusButton("Sign out", onClick = { scope.launch { container.account.signOut() } })
    }
}

@Composable fun ScanScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) = Placeholder("Scan")
@Composable fun QrCameraScreen(container: AppContainer, back: () -> Unit) = Placeholder("Scan a QR code")
@Composable fun ActivityScreen(container: AppContainer) = Placeholder("Activity")
@Composable fun ArgusScreen(container: AppContainer) = Placeholder("Argus")
@Composable fun FamilyScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) = Placeholder("Family")
@Composable fun JoinFamilyScreen(container: AppContainer, code: String, go: (String) -> Unit, back: () -> Unit) = Placeholder("Join a family")
@Composable fun LicensesScreen(back: () -> Unit) = Placeholder("Licences")
```

`ui/nav/ArgusNav.kt`:
```kotlin
package app.askargus.ui.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.askargus.AppContainer
import app.askargus.R
import app.askargus.ui.ActivityScreen
import app.askargus.ui.ArgusScreen
import app.askargus.ui.FamilyScreen
import app.askargus.ui.HomeScreen
import app.askargus.ui.JoinFamilyScreen
import app.askargus.ui.LicensesScreen
import app.askargus.ui.QrCameraScreen
import app.askargus.ui.ScanScreen
import app.askargus.ui.SettingsScreen
import app.askargus.ui.auth.SignInScreen
import app.askargus.ui.onboarding.WelcomeScreen
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

object Routes {
    const val WELCOME = "welcome"
    const val SIGN_IN = "signin?back={back}"
    const val HOME = "home"
    const val ACTIVITY = "activity"
    const val ARGUS = "argus"
    const val SETTINGS = "settings"
    const val SCAN = "scan"
    const val QR = "qr"
    const val FAMILY = "family"
    const val LICENSES = "licenses"
    const val JOIN = "join/{code}"
    fun signIn(back: Boolean) = "signin?back=$back"
    fun join(code: String) = "join/$code"
}

private data class Tab(val route: String, val label: String, val icon: @Composable () -> Unit)

@Composable
fun ArgusNav(container: AppContainer, onboarded: Boolean) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val scope = rememberCoroutineScope()
    val go: (String) -> Unit = { nav.navigate(it) }
    val back: () -> Unit = { nav.popBackStack() }
    val tabs = listOf(
        Tab(Routes.HOME, "Home") { Icon(Icons.Default.Home, contentDescription = null) },
        Tab(Routes.ACTIVITY, "Activity") { Icon(Icons.Default.List, contentDescription = null) },
        Tab(Routes.ARGUS, "Argus") { Icon(painterResource(R.drawable.ic_notification), contentDescription = null) },
        Tab(Routes.SETTINGS, "Settings") { Icon(Icons.Default.Settings, contentDescription = null) },
    )
    val finishOnboarding: () -> Unit = {
        scope.launch { container.prefs.setOnboarded() }
        nav.navigate(Routes.HOME) { popUpTo(0) { inclusive = true } }
    }

    Scaffold(
        containerColor = ArgusColors.Background,
        bottomBar = {
            if (tabs.any { it.route == route }) {
                NavigationBar(containerColor = ArgusColors.Card) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(Routes.HOME) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = tab.icon,
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = ArgusColors.Foreground,
                                selectedTextColor = ArgusColors.Foreground,
                                indicatorColor = ArgusColors.Accent,
                                unselectedIconColor = ArgusColors.MutedText,
                                unselectedTextColor = ArgusColors.MutedText,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = if (onboarded) Routes.HOME else Routes.WELCOME, modifier = Modifier.padding(padding)) {
            composable(Routes.WELCOME) { WelcomeScreen(onStart = { nav.navigate(Routes.signIn(back = false)) }) }
            composable(Routes.SIGN_IN, arguments = listOf(navArgument("back") { type = NavType.BoolType; defaultValue = false })) {
                val returning = it.arguments?.getBoolean("back") ?: false
                val leave: () -> Unit = { if (returning) back() else finishOnboarding() }
                SignInScreen(container, back = returning, onDone = leave, onSkip = leave)
            }
            composable(Routes.HOME) { HomeScreen(container, go) }
            composable(Routes.ACTIVITY) { ActivityScreen(container) }
            composable(Routes.ARGUS) { ArgusScreen(container) }
            composable(Routes.SETTINGS) { SettingsScreen(container, go) }
            composable(Routes.SCAN) { ScanScreen(container, go, back) }
            composable(Routes.QR) { QrCameraScreen(container, back) }
            composable(Routes.FAMILY) { FamilyScreen(container, go, back) }
            composable(Routes.LICENSES) { LicensesScreen(back) }
            composable(Routes.JOIN) { JoinFamilyScreen(container, it.arguments?.getString("code").orEmpty(), go, back) }
        }
    }
}
```
(`Icons.Default.List` may be deprecated in favour of `Icons.AutoMirrored.Filled.List`; either works — use whichever compiles without error; a deprecation warning is fine.)

`MainActivity.kt` (replace the gallery):
```kotlin
package app.askargus

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import app.askargus.core.HandoffPlan
import app.askargus.ui.auth.GoogleSignIn
import app.askargus.ui.components.LocalTouch
import app.askargus.ui.components.TouchState
import app.askargus.ui.components.trackTouches
import app.askargus.ui.nav.ArgusNav
import app.askargus.ui.theme.ArgusColors
import app.askargus.ui.theme.ArgusTheme

class MainActivity : ComponentActivity(), Host {
    private val container get() = (application as ArgusApp).container

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val touch = remember { TouchState() }
            val onboarded by container.prefs.onboarded.collectAsState(initial = null)
            LaunchedEffect(Unit) { container.account.restore() }
            ArgusTheme {
                CompositionLocalProvider(LocalTouch provides touch, LocalHost provides this) {
                    Box(Modifier.fillMaxSize().background(ArgusColors.Background).trackTouches(touch)) {
                        onboarded?.let { ArgusNav(container, it) }
                    }
                }
            }
        }
    }

    // Task 14 replaces this with signed-in website pages (handoff + Trusted Web Activity).
    override fun openPage(path: String, force: Boolean) = openUrl(HandoffPlan.plainUrl(BuildConfig.APP_URL, path))

    override fun openUrl(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    override fun share(text: String, title: String) {
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), title))
    }

    override suspend fun googleSignIn(): GoogleSignIn.Result = GoogleSignIn.request(this, BuildConfig.GOOGLE_WEB_CLIENT_ID)
}
```

`AndroidManifest.xml` — add the permission before `<application>`, name the application class, and set the activity's launch mode:
```xml
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".ArgusApp"
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:theme="@style/Theme.Argus">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize">
```

- [ ] **Step 5: Run the tests and build**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Try it on the emulator: welcome → sign in → stays signed in → sign out**

`.superpowers/e2e/android_signin.py`:
```python
import re, sys, time
sys.path.insert(0, ".superpowers/e2e")
import adbui as u

email, password = re.search(r'#email", "([^"]+)"[\s\S]*?#password", "([^"]+)"', open(".superpowers/e2e/prod-check.mjs", encoding="utf-8").read()).groups()
u.install(r"android\app\build\outputs\apk\debug\app-debug.apk")
u.start_app(clear=True)
u.wait_for("The watcher that never sleeps"); print(u.screenshot("1-welcome"))
u.tap("Get started")
u.wait_for("Sign in to Argus"); print(u.screenshot("2-signin"))
u.tap("Email", exact=True); u.type_text(email)
u.tap("Password", exact=True); u.type_text(password)
u.back()  # hide the keyboard
u.tap("Sign in", exact=True)
u.wait_for(f"Signed in as {email}", timeout=40); print(u.screenshot("3-signed-in"))
u.adb("shell", "am", "force-stop", u.PACKAGE); u.start_app()
u.wait_for(f"Signed in as {email}", timeout=20); print("PASS  still signed in after a restart")
u.tap("Settings", exact=True); u.tap("Sign out", exact=True)
u.tap("Home", exact=True); u.wait_for("Signed out"); print("PASS  signed out")
```
Run: `api\.venv\Scripts\python .superpowers\e2e\android_signin.py`
Expected: three screenshot paths and two PASS lines. View the screenshots: welcome with the eye and headline; the sign-in form; the home placeholder showing the tester's email. (Google sign-in is checked by the user on a real phone in Task 18, after they add the Android OAuth client.)

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main android/app/src/test/java/app/askargus/ui
git commit -m "feat(android): sign-in with email and Google, encrypted session, navigation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The scanner — checks, results, the UPI card, screenshot reading, and the Activity timeline

**Files:**
- Create: `android/app/src/main/java/app/askargus/data/ActivityDb.kt`, `scan/ScanFlow.kt`, `read/ImageReader.kt`, `ui/scan/ScanViewModel.kt`, `ui/scan/ScanScreen.kt`, `ui/scan/ResultView.kt`, `ui/scan/UpiCard.kt`, `ui/activity/ActivityScreen.kt`
- Modify: `AppContainer.kt` (add `activity`, `reader`), `ui/Stubs.kt` (remove `ScanScreen`, `ActivityScreen`; add a "Check something" button to the Home placeholder), `ui/nav/ArgusNav.kt` (imports)
- Test: `android/app/src/test/java/app/askargus/scan/ScanFlowTest.kt`

**Interfaces:**
- Consumes: `Checker`, `ScanResponse`, `ApiException`, `SignedOutException` (Task 4); `Qr`, `QrPayload`, `OcrText`, `Verdict`, `Reasons`, `Levels`, `Kinds`, `Money`, `TimeAgo` (Tasks 2–3); components (Task 10); `Routes`, `LocalHost` (Task 11).
- Produces:
  - `@Entity ActivityEvent(id, at, type: "scan"|"upi", kind, subject, score?, level?, verified, scanId?, source?)`, `ActivityDao` (`add`, `recent(): Flow<List<ActivityEvent>>`, `countSince(since): Flow<Int>`, `deleteBefore(before)`), `ActivityDb.get(context)`
  - `sealed interface ScanState { Idle; Reading(message); Checking(input); Done(input, verdict, scanId, source); Upi(payment); NeedsSignIn(input, source); Failed(message, input?) }`
  - `class ScanFlow(checker, signedIn: suspend () -> Boolean, record: suspend (ActivityEvent) -> Unit, now = System::currentTimeMillis)` with `check(input, source)`, `fromQr(raw, source)`, `fromImage(qr, words, onStage)`
  - `class ImageReader(context)` with `qr(uri): String?`, `words(uri): String`
  - `class ScanViewModel(flow, reader)` with `state`, `draft`, `setDraft`, `check(input, source)`, `qr(raw, source = "qr")`, `image(uri)`, `retry()`, `reset()`; `@Composable scanViewModel(container): ScanViewModel` (activity-scoped, shared by Home, Scan, QR and share intents)
  - `@Composable ResultView(verdict, scanId, onEvidence: (String) -> Unit)`, `@Composable UpiCard(payment, onDismiss)`
  - `AppContainer.activity: ActivityDao`, `AppContainer.reader: ImageReader`

- [ ] **Step 1: Write the failing tests**

`ScanFlowTest.kt`:
```kotlin
package app.askargus.scan

import app.askargus.core.QrPayload
import app.askargus.core.Verdict
import app.askargus.data.ActivityEvent
import app.askargus.net.ApiException
import app.askargus.net.Checker
import app.askargus.net.ScanResponse
import app.askargus.net.SignedOutException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanFlowTest {
    private val verdict = Verdict("text", "Pay now", 91, "HIGH RISK", "Scam or spam message")
    private val calls = mutableListOf<Pair<String, String>>()
    private val recorded = mutableListOf<ActivityEvent>()
    private var answer: () -> ScanResponse = { ScanResponse("s1", verdict) }
    private val checker = object : Checker {
        override suspend fun scan(input: String, save: String): ScanResponse {
            calls += input to save
            return answer()
        }
    }

    private fun flow(signedIn: Boolean = true) = ScanFlow(checker, { signedIn }, { recorded += it }, now = { 1000L })

    @Test fun emptyInputAsksForSomething() = runTest {
        assertEquals(ScanState.Failed("Paste something to check first."), flow().check("   ", "paste"))
        assertTrue(calls.isEmpty())
    }

    @Test fun signedOutKeepsTheInputForAfterSignIn() = runTest {
        assertEquals(ScanState.NeedsSignIn("Pay now", "share"), flow(signedIn = false).check(" Pay now ", "share"))
        assertTrue(calls.isEmpty())
    }

    @Test fun aCheckIsSavedAndRecordedOnThePhone() = runTest {
        assertEquals(ScanState.Done("Pay now", verdict, "s1", "paste"), flow().check("Pay now", "paste"))
        assertEquals("Pay now" to "always", calls.single())
        val e = recorded.single()
        assertEquals(listOf("scan", "text", "s1", "paste"), listOf(e.type, e.kind, e.scanId, e.source))
        assertEquals(91, e.score)
    }

    @Test fun failureKeepsInputForRetry() = runTest {
        answer = { throw ApiException("Argus's checker is waking up. Try again in a moment.", 504) }
        assertEquals(ScanState.Failed("Argus's checker is waking up. Try again in a moment.", "Pay now"), flow().check("Pay now", "paste"))
        assertTrue(recorded.isEmpty())
    }

    @Test fun anEndedSessionAsksToSignIn() = runTest {
        answer = { throw SignedOutException() }
        assertEquals(ScanState.NeedsSignIn("Pay now", "paste"), flow().check("Pay now", "paste"))
    }

    @Test fun upiCodesAreExplainedNotChecked() = runTest {
        val s = flow().fromQr("upi://pay?pa=refund.desk@ybl&am=4999", "qr")
        assertEquals(ScanState.Upi(QrPayload.Upi(false, "refund.desk@ybl", null, "4999", null)), s)
        assertTrue(calls.isEmpty())
        assertEquals("upi", recorded.single().type)
    }

    @Test fun linkCodesAreChecked() = runTest {
        flow().fromQr("https://prize.example/claim", "qr")
        assertEquals("https://prize.example/claim", calls.single().first)
    }

    @Test fun imageWithNothingInIt() = runTest {
        assertEquals(ScanState.Failed("No words or QR code found in that image."), flow().fromImage({ null }, { " \n " }))
    }

    @Test fun unreadableImage() = runTest {
        val s = flow().fromImage({ null }, { throw java.io.IOException("bad file") })
        assertEquals(ScanState.Failed("Couldn't read that image. Try a clearer screenshot, or paste the text."), s)
    }

    @Test fun aQrCodeInAnImageWinsOverItsWords() = runTest {
        assertTrue(flow().fromImage({ "upi://pay?pa=a@b" }, { error("not read") }) is ScanState.Upi)
    }

    @Test fun screenshotWordsAreCheckedAndEachStageIsShown() = runTest {
        val stages = mutableListOf<ScanState>()
        val s = flow().fromImage({ null }, { "Your KYC expires today" }) { stages += it }
        assertEquals(
            listOf(
                ScanState.Reading("Looking for a QR code…"),
                ScanState.Reading("Reading your screenshot on this phone…"),
                ScanState.Checking("Your KYC expires today"),
            ),
            stages,
        )
        assertEquals("screenshot", (s as ScanState.Done).source)
    }
}
```
Run: `.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.scan.*"` → Expected: FAIL (unresolved `ScanFlow`, `ActivityEvent`).

- [ ] **Step 2: Implement the timeline storage and the scan flow**

`data/ActivityDb.kt`:
```kotlin
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
```

`scan/ScanFlow.kt`:
```kotlin
package app.askargus.scan

import app.askargus.core.Qr
import app.askargus.core.QrPayload
import app.askargus.core.Verdict
import app.askargus.data.ActivityEvent
import app.askargus.net.ApiException
import app.askargus.net.Checker
import app.askargus.net.SignedOutException
import kotlin.coroutines.cancellation.CancellationException

sealed interface ScanState {
    data object Idle : ScanState
    data class Reading(val message: String) : ScanState
    data class Checking(val input: String) : ScanState
    data class Done(val input: String, val verdict: Verdict, val scanId: String?, val source: String) : ScanState
    data class Upi(val payment: QrPayload.Upi) : ScanState
    data class NeedsSignIn(val input: String, val source: String) : ScanState
    data class Failed(val message: String, val input: String? = null) : ScanState
}

/** What happens when something is checked: sign-in first, QR codes sorted, screenshots read, results recorded. */
class ScanFlow(
    private val checker: Checker,
    private val signedIn: suspend () -> Boolean,
    private val record: suspend (ActivityEvent) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun check(input: String, source: String): ScanState {
        val text = input.trim()
        if (text.isEmpty()) return ScanState.Failed("Paste something to check first.")
        if (!signedIn()) return ScanState.NeedsSignIn(text, source)
        return try {
            val res = checker.scan(text, "always")
            val v = res.verdict
            record(ActivityEvent(at = now(), type = "scan", kind = v.kind, subject = v.subject.take(200), score = v.score,
                level = v.level, verified = v.verified, scanId = res.id, source = source))
            ScanState.Done(text, v, res.id, source)
        } catch (e: SignedOutException) {
            ScanState.NeedsSignIn(text, source)
        } catch (e: ApiException) {
            ScanState.Failed(e.message ?: "The check couldn't finish. Try again.", text)
        }
    }

    suspend fun fromQr(raw: String, source: String): ScanState = when (val p = Qr.parse(raw)) {
        is QrPayload.Upi -> {
            record(ActivityEvent(at = now(), type = "upi", kind = "upi", subject = p.name ?: p.payee, source = source))
            ScanState.Upi(p)
        }
        is QrPayload.Url -> check(p.url, source)
        is QrPayload.Phone -> check(p.number, source)
        is QrPayload.Text -> check(p.text, source)
    }

    suspend fun fromImage(qr: suspend () -> String?, words: suspend () -> String, onStage: (ScanState) -> Unit = {}): ScanState {
        onStage(ScanState.Reading("Looking for a QR code…"))
        val code = try { qr() } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (!code.isNullOrBlank()) return fromQr(code, "qr-image")
        onStage(ScanState.Reading("Reading your screenshot on this phone…"))
        val text = try {
            words()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return ScanState.Failed("Couldn't read that image. Try a clearer screenshot, or paste the text.")
        }
        if (text.count { !it.isWhitespace() } < 4) return ScanState.Failed("No words or QR code found in that image.")
        onStage(ScanState.Checking(text))
        return check(text, "screenshot")
    }
}
```
Run the tests → Expected: PASS.

- [ ] **Step 3: Add the image reader and wire it into the container**

`read/ImageReader.kt`:
```kotlin
package app.askargus.read

import android.content.Context
import android.net.Uri
import app.askargus.core.OcrText
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import kotlinx.coroutines.tasks.await

/** Reads QR codes and the words in screenshots on the phone (ML Kit, bundled models). Images never leave the phone.
 *  The Devanagari model reads Hindi and English text. */
class ImageReader(private val context: Context) {
    private val barcodes by lazy {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    private val recognizer by lazy { TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build()) }

    suspend fun qr(uri: Uri): String? =
        barcodes.process(InputImage.fromFilePath(context, uri)).await().firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }

    suspend fun words(uri: Uri): String = OcrText.tidy(recognizer.process(InputImage.fromFilePath(context, uri)).await().text)
}
```

In `AppContainer.kt`, add the imports `app.askargus.data.ActivityDao`, `app.askargus.data.ActivityDb`, `app.askargus.read.ImageReader` and, after `val api = …`:
```kotlin
    val activity: ActivityDao by lazy { ActivityDb.get(context).dao() }
    val reader = ImageReader(context.applicationContext)
```

- [ ] **Step 4: Add the view model, screen, result and UPI card**

`ui/scan/ScanViewModel.kt`:
```kotlin
package app.askargus.ui.scan

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.read.ImageReader
import app.askargus.scan.ScanFlow
import app.askargus.scan.ScanState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ScanViewModel(private val flow: ScanFlow, private val reader: ImageReader) : ViewModel() {
    private val _state = MutableStateFlow<ScanState>(ScanState.Idle)
    val state: StateFlow<ScanState> = _state.asStateFlow()
    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    fun setDraft(text: String) {
        _draft.value = text
    }

    fun check(input: String, source: String) {
        _draft.value = input
        launchScan(ScanState.Checking(input.trim())) { flow.check(input, source) }
    }

    fun qr(raw: String, source: String = "qr") = launchScan(ScanState.Checking(raw)) {
        flow.fromQr(raw, source).also { if (it is ScanState.Done) _draft.value = it.input }
    }

    fun image(uri: Uri) = launchScan(ScanState.Reading("Looking for a QR code…")) {
        flow.fromImage({ reader.qr(uri) }, { reader.words(uri) }) { stage ->
            _state.value = stage
            if (stage is ScanState.Checking) _draft.value = stage.input
        }
    }

    fun retry() {
        when (val s = _state.value) {
            is ScanState.NeedsSignIn -> check(s.input, s.source)
            is ScanState.Failed -> s.input?.let { check(it, "retry") }
            else -> Unit
        }
    }

    fun reset() {
        _state.value = ScanState.Idle
    }

    private fun launchScan(first: ScanState, block: suspend () -> ScanState) {
        _state.value = first
        viewModelScope.launch { _state.value = block() }
    }
}

/** One scanner for the whole app, so Home's quick actions, the QR camera and shared items all land on the Scan screen. */
@Composable
fun scanViewModel(container: AppContainer): ScanViewModel {
    val activity = LocalContext.current as ComponentActivity
    return viewModel(viewModelStoreOwner = activity) {
        ScanViewModel(
            ScanFlow(container.api, { container.account.restore() != null }, { container.activity.add(it) }),
            container.reader,
        )
    }
}
```

`ui/scan/ResultView.kt`:
```kotlin
package app.askargus.ui.scan

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.askargus.core.Levels
import app.askargus.core.Reasons
import app.askargus.core.Verdict
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.ScoreDial
import app.askargus.ui.theme.ArgusColors

/** A verdict as on the website: the dial, the honest level word, why, and how many sources answered. */
@Composable
fun ResultView(verdict: Verdict, scanId: String?, onEvidence: (String) -> Unit) {
    val meta = Levels.meta(verdict.level, verdict.verified)
    val color = ArgusColors.risk(meta.risk)
    val (answered, total) = Reasons.answered(verdict)
    val reasons = Reasons.top(verdict)
    ArgusCard {
        ScoreDial(verdict.score, color, Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(8.dp))
        Text(meta.label, style = MaterialTheme.typography.displayMedium, color = color, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(Reasons.subtitle(verdict), style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Text(verdict.subject, style = MaterialTheme.typography.labelMedium, color = ArgusColors.Foreground.copy(alpha = 0.8f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(12.dp))
        Text(verdict.recommendation, style = MaterialTheme.typography.bodyLarge)
        if (reasons.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text("Why", style = MaterialTheme.typography.titleMedium)
            reasons.forEach { reason ->
                Row(Modifier.fillMaxWidth()) {
                    Text("•", color = color)
                    Spacer(Modifier.width(8.dp))
                    Text(reason, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("$answered of $total sources answered", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        if (scanId != null) {
            Spacer(Modifier.height(12.dp))
            ArgusOutlinedButton("See full evidence", onClick = { onEvidence(scanId) }, modifier = Modifier.fillMaxWidth())
        }
    }
}
```

`ui/scan/UpiCard.kt` (the website's `upi-card.tsx` copy, word for word):
```kotlin
package app.askargus.ui.scan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.core.Money
import app.askargus.core.QrPayload
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.theme.ArgusColors

@Composable
fun UpiCard(payment: QrPayload.Upi, onDismiss: () -> Unit) {
    ArgusCard {
        Text(if (payment.mandate) "UPI autopay code" else "UPI payment code", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
        Spacer(Modifier.height(10.dp))
        Text(
            if (payment.mandate) "This code sets up automatic payments from your account." else "This code sends money. It never receives it.",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            "If someone sent you this for a refund, a prize, a job payment or to “receive” money, it's a scam. " +
                "Don't scan it in your UPI app. You never need your PIN to receive money.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.High,
            modifier = Modifier.fillMaxWidth()
                .background(ArgusColors.High.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                .border(1.dp, ArgusColors.High.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                .padding(14.dp),
        )
        Spacer(Modifier.height(14.dp))
        Row { Label("Pays"); Column { Text(payment.name ?: payment.payee); if (payment.name != null) Text(payment.payee, style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText) } }
        Spacer(Modifier.height(8.dp))
        Row { Label("Amount"); Text(payment.amount?.let(Money::rupees) ?: "Not set: you'd type it in") }
        payment.note?.let {
            Spacer(Modifier.height(8.dp))
            Row { Label("Note"); Text(it) }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            "Paying a shop or a friend? Go ahead, as long as the name your UPI app shows before you pay is the one you expect.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.MutedText,
        )
        TextButton(onClick = onDismiss) { Text("Close", color = ArgusColors.Foreground) }
    }
}

@Composable
private fun Label(text: String) {
    Text(text, color = ArgusColors.MutedText, modifier = Modifier.width(76.dp))
}
```

`ui/scan/ScanScreen.kt`:
```kotlin
package app.askargus.ui.scan

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.scan.ScanState
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors

@Composable
fun ScanScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) {
    val vm = scanViewModel(container)
    val state by vm.state.collectAsState()
    val draft by vm.draft.collectAsState()
    val session by container.account.session.collectAsState()
    val clipboard = LocalClipboardManager.current
    val host = LocalHost.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(vm::image) }
    val busy = state is ScanState.Reading || state is ScanState.Checking

    // Back from signing in: run the check that was waiting.
    LaunchedEffect(session) { if (session != null && state is ScanState.NeedsSignIn) vm.retry() }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Check anything", style = MaterialTheme.typography.headlineMedium)
        }
        LivingEye(moodFor(state), Modifier.fillMaxWidth(0.45f).align(Alignment.CenterHorizontally))
        OutlinedTextField(
            draft, vm::setDraft, Modifier.fillMaxWidth(), minLines = 4,
            placeholder = { Text("Paste a link, a message, an email or a phone number") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ArgusOutlinedButton("Paste", onClick = { clipboard.getText()?.text?.let(vm::setDraft) }, modifier = Modifier.weight(1f))
            ArgusOutlinedButton("Scan QR", onClick = { go(Routes.QR) }, modifier = Modifier.weight(1f))
            ArgusOutlinedButton(
                "Screenshot",
                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                modifier = Modifier.weight(1f),
            )
        }
        ArgusButton("Check", onClick = { vm.check(draft, "paste") }, modifier = Modifier.fillMaxWidth(), enabled = draft.isNotBlank(), busy = busy)
        when (val s = state) {
            ScanState.Idle -> Text(
                "Checks run on Argus's servers and are saved to your history. QR codes and screenshots are read on this phone.",
                style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
            )
            is ScanState.Reading -> Working(s.message)
            is ScanState.Checking -> Working("Checking live threat feeds, the page itself and more…")
            is ScanState.Done -> ResultView(s.verdict, s.scanId, onEvidence = { id -> host.openPage("/scan/$id") })
            is ScanState.Upi -> UpiCard(s.payment, onDismiss = vm::reset)
            is ScanState.NeedsSignIn -> ArgusCard {
                Text("Sign in to check it", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Checks use Argus's servers, so they need a free account. What you shared stays here until you're signed in.",
                    style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
                )
                Spacer(Modifier.height(12.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
            is ScanState.Failed -> ArgusCard {
                Text(s.message, color = ArgusColors.High)
                if (s.input != null) {
                    Spacer(Modifier.height(12.dp))
                    ArgusOutlinedButton("Try again", onClick = vm::retry)
                }
            }
        }
    }
}

@Composable
private fun Working(message: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = ArgusColors.Foreground)
        Spacer(Modifier.width(12.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
    }
}

private fun moodFor(state: ScanState): EyeMood = when (state) {
    is ScanState.Reading, is ScanState.Checking -> EyeMood.SCANNING
    is ScanState.Done -> when {
        state.verdict.score >= 60 -> EyeMood.DANGER
        state.verdict.score < 30 -> EyeMood.SAFE
        else -> EyeMood.WATCHING
    }
    is ScanState.Upi -> EyeMood.DANGER
    else -> EyeMood.WATCHING
}
```

- [ ] **Step 5: Add the Activity screen**

`ui/activity/ActivityScreen.kt`:
```kotlin
package app.askargus.ui.activity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.core.Kinds
import app.askargus.core.Levels
import app.askargus.core.TimeAgo
import app.askargus.data.ActivityEvent
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.LevelPill
import app.askargus.ui.theme.ArgusColors

@Composable
fun ActivityScreen(container: AppContainer) {
    val events by container.activity.recent().collectAsState(initial = emptyList())
    val host = LocalHost.current
    val now = System.currentTimeMillis()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Activity", style = MaterialTheme.typography.headlineMedium)
            Text("What Argus checked or warned about on this phone. This list stays on this phone.", style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
        }
        if (events.isEmpty()) {
            item { ArgusCard { Text("Nothing yet. Checks you run and warnings Argus gives will show up here.") } }
        }
        items(events, key = { it.id }) { e -> ActivityRow(e, now) { e.scanId?.let { host.openPage("/scan/$it") } } }
    }
}

@Composable
private fun ActivityRow(e: ActivityEvent, now: Long, onOpen: () -> Unit) {
    ArgusCard(onClick = if (e.scanId != null) onOpen else null) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row {
                    Text(Kinds.label(e.kind), style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                    Spacer(Modifier.weight(1f))
                    Text(TimeAgo.format(now, e.at), style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                }
                Text(e.subject, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(10.dp))
            when {
                e.type == "upi" -> LevelPill("Sends money", ArgusColors.Sus)
                e.level != null -> Levels.meta(e.level, e.verified).let { LevelPill(it.label, ArgusColors.risk(it.risk)) }
            }
        }
    }
}
```

- [ ] **Step 6: Update the stubs and navigation**

In `ui/Stubs.kt`: delete the `ScanScreen` and `ActivityScreen` lines, and in the Home placeholder add (after the sign-in button line):
```kotlin
        ArgusButton("Check something", onClick = { go(Routes.SCAN) })
```
In `ui/nav/ArgusNav.kt`: replace `import app.askargus.ui.ActivityScreen` with `import app.askargus.ui.activity.ActivityScreen` and `import app.askargus.ui.ScanScreen` with `import app.askargus.ui.scan.ScanScreen`.

- [ ] **Step 7: Test, build, and try a real check on the emulator**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`.

`.superpowers/e2e/android_scan.py`:
```python
import re, sys
sys.path.insert(0, ".superpowers/e2e")
import adbui as u

email, password = re.search(r'#email", "([^"]+)"[\s\S]*?#password", "([^"]+)"', open(".superpowers/e2e/prod-check.mjs", encoding="utf-8").read()).groups()
u.install(r"android\app\build\outputs\apk\debug\app-debug.apk")
u.start_app(clear=True)
u.tap("Get started"); u.tap("Email", exact=True); u.type_text(email); u.tap("Password", exact=True); u.type_text(password); u.back()
u.tap("Sign in", exact=True); u.wait_for("Signed in as", timeout=40)
u.tap("Check something")
u.tap("Paste a link"); u.type_text("URGENT your bank account is suspended. Verify now at bit.ly/secure-verify or you will be arrested")
u.back(); u.tap("Check", exact=True)
u.wait_for("sources answered", timeout=90); print(u.screenshot("scan-result"))
found = u.find("High risk") or u.find("Suspicious")
print("PASS  scam text flagged" if found else "FAIL  scam text not flagged")
u.back(); u.tap("Activity", exact=True); u.wait_for("Message"); print(u.screenshot("activity"))
print("PASS  activity shows the check")
```
Run: `api\.venv\Scripts\python .superpowers\e2e\android_scan.py` (the app talks to the live askargus.app, deployed at the end of Task 8).
Expected: two PASS lines; `scan-result.png` shows the dial, "High risk" in red, reasons and "See full evidence"; `activity.png` lists the check. Afterwards delete the tester's test scan (the SQL from Task 5 Step 7, matching `URGENT your bank account is suspended%`).

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main android/app/src/test/java/app/askargus/scan
git commit -m "feat(android): scanner with honest results, UPI card, screenshot reading, activity timeline

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Live QR camera and "Share to Argus"

**Files:**
- Create: `android/app/src/main/java/app/askargus/read/QrAnalyzer.kt`, `ui/scan/QrCameraScreen.kt`, `.superpowers/e2e/make-images.mjs` and `.superpowers/e2e/android_share.py` (git-ignored)
- Modify: `MainActivity.kt` (turn incoming intents into `Incoming`), `ui/nav/ArgusNav.kt` (new parameters; handle shared text and images), `ui/Stubs.kt` (remove `QrCameraScreen`), `AndroidManifest.xml` (camera permission, share filters), `.superpowers/e2e/adbui.py` (add `sign_in_fresh`)

**Interfaces:**
- Consumes: `IncomingParser`, `Incoming` (Task 3); `scanViewModel`, `ScanViewModel.check/qr/image` (Task 12).
- Produces: `class QrAnalyzer(onFound: (String) -> Unit) : ImageAnalysis.Analyzer`; `@Composable QrCameraScreen(container, back)` (final); `ArgusNav(container, onboarded, incoming: StateFlow<Incoming?>, onIncomingHandled: () -> Unit)`; Argus appears as "Check with Argus" in other apps' Share menus for text and images.

- [ ] **Step 1: Add the camera analyzer and screen**

`read/QrAnalyzer.kt`:
```kotlin
package app.askargus.read

import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.atomic.AtomicBoolean

/** Looks for a QR code in each camera frame, on the phone, and reports the first one once. */
class QrAnalyzer(private val onFound: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    private val found = AtomicBoolean(false)

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    override fun analyze(proxy: ImageProxy) {
        val media = proxy.image
        if (media == null || found.get()) {
            proxy.close()
            return
        }
        scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
            .addOnSuccessListener { codes ->
                codes.firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }?.let {
                    if (found.compareAndSet(false, true)) onFound(it)
                }
            }
            .addOnCompleteListener { proxy.close() }
    }
}
```

`ui/scan/QrCameraScreen.kt`:
```kotlin
package app.askargus.ui.scan

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.askargus.AppContainer
import app.askargus.read.QrAnalyzer
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.theme.ArgusColors

@Composable
fun QrCameraScreen(container: AppContainer, back: () -> Unit) {
    val context = LocalContext.current
    val vm = scanViewModel(container)
    fun allowed() = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    var granted by remember { mutableStateOf(allowed()) }
    var asked by remember { mutableStateOf(false) }
    val request = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; asked = true }
    LaunchedEffect(Unit) { if (!granted) request.launch(Manifest.permission.CAMERA) }
    LifecycleResumeEffect(Unit) {
        granted = allowed()
        onPauseOrDispose { }
    }

    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Scan a QR code", style = MaterialTheme.typography.headlineMedium)
        }
        if (granted) {
            CameraPreview(
                onFound = { raw -> vm.qr(raw); back() },
                modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(24.dp)),
            )
            Text(
                "Point your camera at the code. It's read on this phone; nothing is recorded or sent anywhere.",
                style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
            )
        } else if (asked) {
            Text(
                "Camera access is off, so Argus can't read codes live. Allow it in Settings, or read a screenshot of the code instead.",
                style = MaterialTheme.typography.bodyLarge,
            )
            ArgusOutlinedButton("Open settings", onClick = {
                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
            })
        }
    }
}

@Composable
private fun CameraPreview(onFound: (String) -> Unit, modifier: Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(onFound)
    val providerFuture = remember { ProcessCameraProvider.getInstance(context) }
    DisposableEffect(Unit) { onDispose { runCatching { providerFuture.get().unbindAll() } } }
    AndroidView(modifier = modifier, factory = { ctx ->
        PreviewView(ctx).also { view ->
            providerFuture.addListener({
                val provider = providerFuture.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build().also {
                    it.setAnalyzer(ContextCompat.getMainExecutor(ctx), QrAnalyzer { raw -> view.post { latest(raw) } })
                }
                runCatching {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }
            }, ContextCompat.getMainExecutor(ctx))
        }
    })
}
```

- [ ] **Step 2: Turn shares into things to check**

In `MainActivity.kt`, add imports `androidx.core.content.IntentCompat`, `app.askargus.core.Incoming`, `app.askargus.core.IncomingParser`, `kotlinx.coroutines.flow.MutableStateFlow`; add the field and methods below, call `handle(intent)` in `onCreate` right after `super.onCreate(savedInstanceState)` when `savedInstanceState == null`, and pass the flow to the navigation:
```kotlin
    private val incoming = MutableStateFlow<Incoming?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        incoming.value = IncomingParser.parse(
            intent.action, intent.type,
            intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
            intent.getStringExtra(Intent.EXTRA_SUBJECT),
            stream?.toString(),
            intent.dataString,
        ) ?: incoming.value
    }
```
and change `onboarded?.let { ArgusNav(container, it) }` to:
```kotlin
                        onboarded?.let { ArgusNav(container, it, incoming) { incoming.value = null } }
```

In `ui/nav/ArgusNav.kt`: change the signature to
```kotlin
@Composable
fun ArgusNav(container: AppContainer, onboarded: Boolean, incoming: StateFlow<Incoming?>, onIncomingHandled: () -> Unit) {
```
add imports `android.net.Uri`, `androidx.compose.runtime.LaunchedEffect`, `androidx.compose.runtime.collectAsState`, `app.askargus.core.Incoming`, `app.askargus.ui.scan.QrCameraScreen`, `app.askargus.ui.scan.scanViewModel`, `kotlinx.coroutines.flow.StateFlow`; remove `import app.askargus.ui.QrCameraScreen`; and just before `Scaffold(` add:
```kotlin
    val scan = scanViewModel(container)
    val pending by incoming.collectAsState()
    LaunchedEffect(pending) {
        when (val item = pending ?: return@LaunchedEffect) {
            is Incoming.Text -> {
                scan.check(item.text, "share")
                nav.navigate(Routes.SCAN) { launchSingleTop = true }
            }
            is Incoming.Image -> {
                scan.image(Uri.parse(item.uri))
                nav.navigate(Routes.SCAN) { launchSingleTop = true }
            }
            is Incoming.Join -> Unit // Task 14 opens the join screen
        }
        onIncomingHandled()
    }
```
In `ui/Stubs.kt`, delete the `QrCameraScreen` line.

- [ ] **Step 3: Declare the camera and the Share menu entries**

In `AndroidManifest.xml`, next to the INTERNET permission:
```xml
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.any" android:required="false" />
```
and inside `<activity android:name=".MainActivity" …>` after the launcher filter:
```xml
            <intent-filter android:label="Check with Argus">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter android:label="Check with Argus">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
```

- [ ] **Step 4: Build**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Try sharing text, a UPI QR image and a screenshot, and the live camera**

Add to `.superpowers/e2e/adbui.py`:
```python
def sign_in_fresh(apk=r"android\app\build\outputs\apk\debug\app-debug.apk"):
    email, password = re.search(r'#email", "([^"]+)"[\s\S]*?#password", "([^"]+)"',
                                open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "prod-check.mjs"), encoding="utf-8").read()).groups()
    install(apk)
    start_app(clear=True)
    tap("Get started"); tap("Email", exact=True); type_text(email); tap("Password", exact=True); type_text(password); back()
    tap("Sign in", exact=True)
    time.sleep(3)
```

`.superpowers/e2e/make-images.mjs` (renders the test images with Playwright and the website's `qrcode` package):
```js
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const QRCode = require("qrcode");
const out = new URL("../tmp/", import.meta.url).pathname.slice(1);
await QRCode.toFile(`${out}upi.png`, "upi://pay?pa=refund.desk@ybl&pn=KBC%20Prize%20Team&am=4999&cu=INR&tn=Claim%20your%20prize", { width: 600, margin: 4 });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
await page.setContent(`<body style="margin:0;background:#fff;font:34px Arial;padding:48px;color:#111">
  <p>VM-SBIINB</p><p>Dear customer, your SBI KYC has expired and your account will be blocked today.</p>
  <p>Update now at sbi-kyc-update.top or call 9876543210</p></body>`);
await page.screenshot({ path: `${out}sms.png` });
await browser.close();
console.log("images ready");
```

`.superpowers/e2e/android_share.py`:
```python
import subprocess, sys, time
sys.path.insert(0, ".superpowers/e2e")
import adbui as u

subprocess.run(["node", ".superpowers/e2e/make-images.mjs"], check=True)
u.sign_in_fresh()

def share_text(text):
    u.adb("shell", "am", "start", "-a", "android.intent.action.SEND", "-t", "text/plain",
          "--es", "android.intent.extra.TEXT", f"'{text}'", "-n", f"{u.PACKAGE}/.MainActivity")

def media_uri(name):
    u.adb("push", f".superpowers/tmp/{name}", f"/sdcard/Pictures/{name}")
    u.adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", f"file:///sdcard/Pictures/{name}", check=False)
    for _ in range(10):
        rows = u.adb("shell", "content", "query", "--uri", "content://media/external/images/media",
                     "--projection", "_id:_display_name", check=False)
        for line in rows.splitlines():
            if f"_display_name={name}" in line:
                return "content://media/external/images/media/" + line.split("_id=")[1].split(",")[0]
        time.sleep(1)
    raise AssertionError(f"{name} not in the media store")

def share_image(name):
    u.adb("shell", "am", "start", "-a", "android.intent.action.SEND", "-t", "image/png",
          "--eu", "android.intent.extra.STREAM", media_uri(name), "--grant-read-uri-permission", "-n", f"{u.PACKAGE}/.MainActivity")

share_text("Your parcel is on hold. Pay Rs 25 at indiapost-help.top within 12 hours")
u.wait_for("sources answered", timeout=90); print(u.screenshot("share-text")); print("PASS  shared text is checked")

share_image("upi.png")
u.wait_for("This code sends money", timeout=30); print(u.screenshot("share-upi")); print("PASS  shared UPI QR is explained")

share_image("sms.png")
u.wait_for("sources answered", timeout=120); print(u.screenshot("share-screenshot"))
print("PASS  screenshot read on the phone and checked" if u.find("KYC") else "FAIL  screenshot text not read")

u.tap("Scan QR", exact=True)
if u.find("While using the app"): u.tap("While using the app")
time.sleep(3); print(u.screenshot("qr-camera")); print("PASS  camera screen open")
u.back()
```
Run: `api\.venv\Scripts\python .superpowers\e2e\android_share.py`
Expected: four PASS lines. Look at the screenshots: the shared parcel text with a verdict; the UPI card ("This code sends money. It never receives it.", KBC Prize Team, ₹4,999.00); the screenshot's words in the text box with a verdict; the camera preview (the emulator's virtual scene) under "Scan a QR code". If `share_image` fails on media permissions, instead tap **Screenshot** on the Scan screen and pick the pushed image in the photo picker. Then delete the tester's test scans (SQL as in Task 5 Step 7, for `Your parcel is on hold%` and `%SBI KYC%`).

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main
git commit -m "feat(android): live QR camera and Share to Argus for text and images

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Website pages signed in, Settings, Family and joining a family

**Files:**
- Create: `android/app/src/main/java/app/askargus/web/WebPages.kt`, `ui/argus/ArgusScreen.kt`, `ui/settings/SettingsScreen.kt`, `ui/settings/LicensesScreen.kt`, `ui/family/FamilyViewModel.kt`, `ui/family/FamilyScreen.kt`, `ui/family/JoinFamilyScreen.kt`, `.superpowers/e2e/android_family.py` (git-ignored)
- Modify: `MainActivity.kt` (open pages through `WebPages`), `ui/nav/ArgusNav.kt` (imports; open the join screen for invite links), `ui/Stubs.kt` (remove `ArgusScreen`, `SettingsScreen`, `FamilyScreen`, `JoinFamilyScreen`, `LicensesScreen`), `AndroidManifest.xml` (App Link filter)
- Test: `android/app/src/test/java/app/askargus/ui/family/FamilyViewModelTest.kt`

**Interfaces:**
- Consumes: `ArgusApi.handoff/family/familyInvite/familyJoin/leaveFamily/inviteInfo/latest` (Task 4); `HandoffPlan`, `Versions` (Task 3); `Prefs.webSignedInFor/setWebSignedInFor` (Task 11); `/api/app/*` (Tasks 5–8).
- Produces: `class WebPages(activity, container)` with `open(path, force = false)` and `destroy()`; `FamilyViewModel(api)` with `state`, `load()`, `suspend invite(): InviteResponse?`, `leave(linkId)`; `JoinViewModel(api, code)`; final `ArgusScreen`, `SettingsScreen`, `LicensesScreen`, `FamilyScreen`, `JoinFamilyScreen`. Invite links `https://askargus.app/app/join/<code>` open the app when installed.

- [ ] **Step 1: Write the failing family test**

`FamilyViewModelTest.kt`:
```kotlin
package app.askargus.ui.family

import app.askargus.net.ArgusApi
import app.askargus.net.MemorySessionStore
import app.askargus.net.NOW
import app.askargus.net.Session
import app.askargus.net.SupabaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class FamilyViewModelTest {
    private val server = MockWebServer()
    private val store = MemorySessionStore(Session("a1", "r1", NOW + 3600, "u1"))
    private lateinit var vm: FamilyViewModel

    @Before fun setUp() {
        Dispatchers.setMain(Dispatchers.Unconfined)
        server.start()
        val base = server.url("/").toString()
        vm = FamilyViewModel(ArgusApi(OkHttpClient(), base, SupabaseAuth(OkHttpClient(), base, "pk", now = { NOW }), store, now = { NOW }))
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
        runCatching { server.shutdown() }
    }

    private fun loaded() = runBlocking { withTimeout(5000) { vm.state.first { !it.loading } } }

    @Test fun loadsMembers() {
        server.enqueue(MockResponse().setBody("""{"members":[{"linkId":"l1","name":"Asha Rao","joinedAt":"2026-09-30T10:00:00Z"}]}"""))
        vm.load()
        assertEquals("Asha Rao", loaded().members.single().name)
    }

    @Test fun signedOutPeopleAreAskedToSignIn() {
        runBlocking { store.save(null) }
        vm.load()
        assertTrue(loaded().signedOut)
    }

    @Test fun invitesComeBackAsALink() {
        server.enqueue(MockResponse().setBody("""{"url":"https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx","expiresAt":"2026-10-07T10:00:00Z"}"""))
        val invite = runBlocking { vm.invite() }
        assertEquals("https://askargus.app/app/join/AbCdEfGhIjKlMnOpQrStUvWx", invite!!.url)
    }
}
```
Run: `.\gradlew.bat :app:testDebugUnitTest --tests "app.askargus.ui.family.*"` → Expected: FAIL (unresolved `FamilyViewModel`).

- [ ] **Step 2: Implement the family view models**

`ui/family/FamilyViewModel.kt`:
```kotlin
package app.askargus.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.askargus.net.ApiException
import app.askargus.net.ArgusApi
import app.askargus.net.FamilyMember
import app.askargus.net.InviteResponse
import app.askargus.net.SignedOutException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class FamilyViewModel(private val api: ArgusApi) : ViewModel() {
    data class UiState(
        val loading: Boolean = true,
        val members: List<FamilyMember> = emptyList(),
        val error: String? = null,
        val busy: Boolean = false,
        val signedOut: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            _state.value = try {
                UiState(loading = false, members = api.family().members)
            } catch (e: SignedOutException) {
                UiState(loading = false, signedOut = true)
            } catch (e: ApiException) {
                UiState(loading = false, error = e.message)
            }
        }
    }

    suspend fun invite(): InviteResponse? {
        _state.update { it.copy(busy = true, error = null) }
        return try {
            api.familyInvite()
        } catch (e: SignedOutException) {
            _state.update { it.copy(signedOut = true) }
            null
        } catch (e: ApiException) {
            _state.update { it.copy(error = e.message) }
            null
        } finally {
            _state.update { it.copy(busy = false) }
        }
    }

    fun leave(linkId: String) {
        viewModelScope.launch {
            try {
                api.leaveFamily(linkId)
                load()
            } catch (e: SignedOutException) {
                _state.update { it.copy(signedOut = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

class JoinViewModel(private val api: ArgusApi, private val code: String) : ViewModel() {
    sealed interface UiState {
        data object Loading : UiState
        data class Invite(val name: String?, val busy: Boolean = false, val error: String? = null) : UiState
        data object Dead : UiState
        data class Joined(val name: String) : UiState
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.value = try {
                api.inviteInfo(code).let { if (it.valid) UiState.Invite(it.name) else UiState.Dead }
            } catch (e: ApiException) {
                UiState.Invite(null, error = e.message)
            }
        }
    }

    fun join() {
        val current = _state.value as? UiState.Invite ?: return
        _state.value = current.copy(busy = true, error = null)
        viewModelScope.launch {
            _state.value = try {
                UiState.Joined(api.familyJoin(code).name)
            } catch (e: SignedOutException) {
                current.copy(busy = false, error = "Sign in first, then tap Join.")
            } catch (e: ApiException) {
                current.copy(busy = false, error = e.message)
            }
        }
    }
}
```
Run the test → Expected: PASS.

- [ ] **Step 3: Open website pages signed in**

`web/WebPages.kt`:
```kotlin
package app.askargus.web

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.lifecycle.lifecycleScope
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.core.HandoffPlan
import com.google.androidbrowserhelper.trusted.TwaLauncher
import kotlinx.coroutines.launch

/** Opens askargus.app pages full screen (Trusted Web Activity), signed in with a one-time link the first time.
 *  If the link can't be made, the page opens anyway and the website asks to sign in. */
class WebPages(private val activity: ComponentActivity, private val container: AppContainer) {
    private val launcher = TwaLauncher(activity)

    fun open(path: String, force: Boolean = false) {
        activity.lifecycleScope.launch {
            val session = container.account.restore()
            val signedInLink = if (HandoffPlan.needsHandoff(session?.userId, container.prefs.webSignedInFor(), force)) {
                runCatching { container.api.handoff(path) }
                    .onSuccess { container.prefs.setWebSignedInFor(session?.userId) }
                    .getOrNull()
            } else null
            show(signedInLink ?: HandoffPlan.plainUrl(BuildConfig.APP_URL, path))
        }
    }

    private fun show(url: String) {
        val colors = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(0xFF08080A.toInt())
            .setNavigationBarColor(0xFF08080A.toInt())
            .build()
        launcher.launch(TrustedWebActivityIntentBuilder(Uri.parse(url)).setDefaultColorSchemeParams(colors), null, null, null)
    }

    fun destroy() = launcher.destroy()
}
```
(If this android-browser-helper version lacks the four-argument `launch`, use `launcher.launch(Uri.parse(url))`; ledger the ruling.)

In `MainActivity.kt`: add `import app.askargus.web.WebPages`, a field `private lateinit var pages: WebPages`, create it in `onCreate` (after `super.onCreate`): `pages = WebPages(this, container)`, replace `openPage` with:
```kotlin
    override fun openPage(path: String, force: Boolean) = pages.open(path, force)

    override fun onDestroy() {
        pages.destroy()
        super.onDestroy()
    }
```
and remove the now-unused `HandoffPlan` import.

- [ ] **Step 4: Add the Argus tab, Settings and Licences**

`ui/argus/ArgusScreen.kt`:
```kotlin
package app.askargus.ui.argus

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.theme.ArgusColors

private data class Page(val title: String, val body: String, val path: String)

private val PAGES = listOf(
    Page("Dashboard", "Your stats, recent checks and protection status", "/dashboard"),
    Page("History", "Every check you've run, searchable", "/history"),
    Page("Caller ID", "Look up any number and report scam callers", "/caller-id"),
    Page("Inbox", "Connect Gmail and see which emails are scams", "/inbox"),
    Page("Family alerts", "Telegram alerts for the people you look out for", "/family"),
)

@Composable
fun ArgusScreen(container: AppContainer) {
    val host = LocalHost.current
    val session by container.account.session.collectAsState()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Argus", style = MaterialTheme.typography.headlineMedium)
            Text(
                if (session != null) "Everything on askargus.app, opened signed in." else "Everything on askargus.app. Sign in to see your history and family.",
                style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
            )
        }
        items(PAGES) { page ->
            ArgusCard(onClick = { host.openPage(page.path) }) {
                Text(page.title, style = MaterialTheme.typography.titleMedium)
                Text(page.body, style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText)
            }
        }
    }
}
```

`ui/settings/SettingsScreen.kt`:
```kotlin
package app.askargus.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.core.Versions
import app.askargus.net.ApiException
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    ArgusCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
fun SettingsScreen(container: AppContainer, go: (String) -> Unit) {
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    val session by container.account.session.collectAsState()
    var checking by remember { mutableStateOf(false) }
    var updateNote by remember { mutableStateOf<String?>(null) }
    var updateReady by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Section("Account") {
            val s = session
            if (s != null) {
                Text("Signed in as ${s.email ?: s.name ?: "you"}")
                ArgusOutlinedButton("Sign in to the website again", onClick = { host.openPage("/dashboard", force = true) }, modifier = Modifier.fillMaxWidth())
                ArgusOutlinedButton("Sign out", onClick = { scope.launch { container.account.signOut() } }, modifier = Modifier.fillMaxWidth())
            } else {
                Text("Not signed in. Checks need a free account.", color = ArgusColors.MutedText)
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
        }
        Section("Family") {
            Text("Invite the people you look out for.", color = ArgusColors.MutedText)
            ArgusOutlinedButton("Family", onClick = { go(Routes.FAMILY) }, modifier = Modifier.fillMaxWidth())
        }
        Section("Updates") {
            Text("Argus ${BuildConfig.VERSION_NAME}")
            ArgusOutlinedButton(
                if (checking) "Checking…" else "Check for updates",
                enabled = !checking,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    scope.launch {
                        checking = true
                        updateReady = false
                        updateNote = try {
                            val latest = container.api.latest()
                            when {
                                latest == null -> "There's no release on the download page yet."
                                Versions.isNewer(latest.version, BuildConfig.VERSION_NAME) -> { updateReady = true; "Version ${latest.version} is ready." }
                                else -> "You have the latest version."
                            }
                        } catch (e: ApiException) {
                            e.message
                        }
                        checking = false
                    }
                },
            )
            updateNote?.let { Text(it, color = ArgusColors.MutedText) }
            if (updateReady) ArgusButton("Download the update", onClick = { host.openUrl("${BuildConfig.APP_URL}/app") }, modifier = Modifier.fillMaxWidth())
        }
        Section("About") {
            Text(
                "Argus is free. It never says “Safe” without proof, and it tells you when a check couldn't finish.",
                color = ArgusColors.MutedText,
            )
            TextButton(onClick = { host.openUrl("${BuildConfig.APP_URL}/privacy") }) { Text("Privacy policy", color = ArgusColors.Foreground) }
            TextButton(onClick = { go(Routes.LICENSES) }) { Text("Open-source licences", color = ArgusColors.Foreground) }
        }
    }
}
```

`ui/settings/LicensesScreen.kt`:
```kotlin
package app.askargus.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.askargus.ui.theme.ArgusColors

@Composable
fun LicensesScreen(back: () -> Unit) {
    val context = LocalContext.current
    val ofl = remember { context.assets.open("licenses/archivo-OFL.txt").bufferedReader().use { it.readText() } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Licences", style = MaterialTheme.typography.headlineMedium)
        }
        Text("Argus uses the Archivo typeface under the SIL Open Font License:", style = MaterialTheme.typography.bodyMedium)
        Text(ofl, style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
    }
}
```

- [ ] **Step 5: Add the Family and Join screens**

`ui/family/FamilyScreen.kt`:
```kotlin
package app.askargus.ui.family

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.LocalHost
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
fun FamilyScreen(container: AppContainer, go: (String) -> Unit, back: () -> Unit) {
    val vm: FamilyViewModel = viewModel { FamilyViewModel(container.api) }
    val state by vm.state.collectAsState()
    val session by container.account.session.collectAsState()
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(session) { vm.load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = back) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
            Text("Family", style = MaterialTheme.typography.headlineMedium)
        }
        Text(
            "Invite the people you look out for, like parents or grandparents. Once they join, you'll be able to see that " +
                "Argus is protecting them and hear when it warns them about a likely scam (coming in a later update). " +
                "What their messages say and which sites they visit are never shared.",
            style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
        )
        when {
            session == null || state.signedOut -> ArgusCard {
                Text("Sign in to invite family.")
                Spacer(Modifier.height(10.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
            state.loading -> CircularProgressIndicator(color = ArgusColors.Foreground)
            else -> {
                ArgusButton(
                    "Invite family",
                    busy = state.busy,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        scope.launch {
                            vm.invite()?.let { host.share("Join my family on Argus, so we can look out for each other: ${it.url}", "Invite family") }
                        }
                    },
                )
                Text("Each link works once and expires in 7 days.", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                if (state.members.isEmpty()) Text("No family members yet.")
                state.members.forEach { m ->
                    ArgusCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(m.name, style = MaterialTheme.typography.titleMedium)
                                Text("Joined ${m.joinedAt.take(10)}", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText)
                            }
                            TextButton(onClick = { vm.leave(m.linkId) }) { Text("Remove", color = ArgusColors.High) }
                        }
                    }
                }
            }
        }
        state.error?.let { Text(it, color = ArgusColors.High) }
    }
}
```

`ui/family/JoinFamilyScreen.kt`:
```kotlin
package app.askargus.ui.family

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.family.JoinViewModel.UiState
import app.askargus.ui.nav.Routes
import app.askargus.ui.theme.ArgusColors

@Composable
fun JoinFamilyScreen(container: AppContainer, code: String, go: (String) -> Unit, back: () -> Unit) {
    val vm: JoinViewModel = viewModel(key = code) { JoinViewModel(container.api, code) }
    val state by vm.state.collectAsState()
    val session by container.account.session.collectAsState()
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        LivingEye(if (state is UiState.Joined) EyeMood.SAFE else EyeMood.WATCHING, Modifier.fillMaxWidth(0.5f))
        when (val s = state) {
            UiState.Loading -> CircularProgressIndicator(color = ArgusColors.Foreground)
            UiState.Dead -> {
                Text("This invite doesn't work anymore", style = MaterialTheme.typography.headlineMedium)
                Text("It has expired or was already used. Ask for a new one.", color = ArgusColors.MutedText)
                ArgusButton("Done", onClick = { go(Routes.HOME) }, modifier = Modifier.fillMaxWidth())
            }
            is UiState.Invite -> {
                Text("${s.name ?: "Someone"} invited you to their family on Argus", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "Joining links your two Argus accounts. Soon you'll see that Argus is protecting each other, and hear when it " +
                        "warns about a likely scam. What your messages say and which sites you visit are never shared.",
                    color = ArgusColors.MutedText,
                )
                if (session == null) ArgusButton("Sign in to join", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
                else ArgusButton("Join the family", onClick = vm::join, busy = s.busy, modifier = Modifier.fillMaxWidth())
                s.error?.let { Text(it, color = ArgusColors.High) }
            }
            is UiState.Joined -> {
                Text("You and ${s.name} are now family on Argus", style = MaterialTheme.typography.headlineMedium)
                ArgusButton("Done", onClick = { go(Routes.HOME) }, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
```

- [ ] **Step 6: Wire up invite links and remove the stubs**

In `AndroidManifest.xml`, add inside `MainActivity` after the share filters:
```xml
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="askargus.app" android:pathPrefix="/app/join/" />
            </intent-filter>
```
In `ui/nav/ArgusNav.kt`, replace `is Incoming.Join -> Unit // Task 14 opens the join screen` with `is Incoming.Join -> nav.navigate(Routes.join(item.code))`, and swap the stub imports for `app.askargus.ui.argus.ArgusScreen`, `app.askargus.ui.settings.SettingsScreen`, `app.askargus.ui.settings.LicensesScreen`, `app.askargus.ui.family.FamilyScreen`, `app.askargus.ui.family.JoinFamilyScreen`. In `ui/Stubs.kt`, delete those five stubs (only `HomeScreen` and `Placeholder` remain).

- [ ] **Step 7: Test, build, and try it on the emulator**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`.

`.superpowers/e2e/android_family.py`:
```python
import json, re, sys, time, urllib.request
sys.path.insert(0, ".superpowers/e2e")
import adbui as u

u.sign_in_fresh()
u.tap("Argus", exact=True); u.tap("History")
time.sleep(6)
top = u.adb("shell", "dumpsys", "activity", "activities")
print("PASS  History opened in the browser" if "com.android.chrome" in top else "FAIL  browser didn't open")
print(u.screenshot("web-history"))
u.start_app()
u.tap("Settings", exact=True); u.tap("Check for updates"); time.sleep(4); print(u.screenshot("settings-updates"))
print("PASS  update check answered" if (u.find("no release") or u.find("latest version") or u.find("is ready")) else "FAIL  no update answer")
u.tap("Family", exact=True); u.wait_for("Invite family"); u.tap("Invite family"); time.sleep(3); print(u.screenshot("invite-share"))
u.back()

# The tester's own invite, opened as a link: the screen greets, then refuses kindly.
env = open("web/.env.local", encoding="utf-8").read()
val = lambda k: re.search(rf"^{k}=(.*)$", env, re.M).group(1).strip()
email, password = re.search(r'#email", "([^"]+)"[\s\S]*?#password", "([^"]+)"', open(".superpowers/e2e/prod-check.mjs", encoding="utf-8").read()).groups()
req = urllib.request.Request(f"{val('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/token?grant_type=password", data=json.dumps({"email": email, "password": password}).encode(),
                             headers={"apikey": val("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "content-type": "application/json"})
token = json.load(urllib.request.urlopen(req))["access_token"]
req = urllib.request.Request("https://askargus.app/api/app/family/invite", data=b"{}", headers={"authorization": f"Bearer {token}", "content-type": "application/json"})
link = json.load(urllib.request.urlopen(req))["url"]
u.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", link, "-n", f"{u.PACKAGE}/.MainActivity")
u.wait_for("invited you to their family"); u.tap("Join the family")
u.wait_for("your own invite"); print(u.screenshot("join-own")); print("PASS  own invite refused kindly")
```
Run: `api\.venv\Scripts\python .superpowers\e2e\android_family.py`
Expected: PASS lines; screenshots of the History page in the browser (signed in if the user added `SUPABASE_SECRET_KEY`, otherwise the website's sign-in page), the update answer, the Android share sheet with the invite, and the join screen's "That's your own invite" message. Then delete the tester's invites (SQL from Task 7 Step 8).

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main android/app/src/test/java/app/askargus/ui/family
git commit -m "feat(android): website pages signed in, settings, family invites and joining

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Home screen, update check and notifications

**Files:**
- Create: `android/app/src/main/java/app/askargus/work/Notifications.kt`, `work/UpdateCheckWorker.kt`, `ui/home/HomeScreen.kt`
- Delete: `ui/Stubs.kt`
- Modify: `ArgusApp.kt` (channels, daily update check, trim old activity), `ui/nav/ArgusNav.kt` (import `app.askargus.ui.home.HomeScreen`), `AndroidManifest.xml` (notification permission)

**Interfaces:**
- Consumes: `UpdateDecision`, `Versions`, `Links` (Task 3); `ArgusApi.latest()` (Task 4); `Prefs` (Task 11); `scanViewModel`, `ActivityDao.countSince/deleteBefore` (Task 12).
- Produces: `Notifications.UPDATES`, `Notifications.createChannels(context)`, `Notifications.updateReady(context, version)`; `UpdateCheckWorker.schedule(context)` (daily, network required); final `HomeScreen(container, go)`.

- [ ] **Step 1: Add notifications and the daily update check**

`work/Notifications.kt`:
```kotlin
package app.askargus.work

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.askargus.BuildConfig
import app.askargus.R

object Notifications {
    const val UPDATES = "updates"
    private const val UPDATE_ID = 1001

    fun createChannels(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(UPDATES, "Updates", NotificationManager.IMPORTANCE_LOW).apply {
                description = "When a new version of Argus is ready"
            },
        )
    }

    @SuppressLint("MissingPermission") // checked just below
    fun updateReady(context: Context, version: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, 0, Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_URL}/app")), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, UPDATES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Argus $version is ready")
            .setContentText("Tap to download the update.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(UPDATE_ID, notification)
    }
}
```

`work/UpdateCheckWorker.kt`:
```kotlin
package app.askargus.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.askargus.ArgusApp
import app.askargus.BuildConfig
import app.askargus.core.UpdateDecision
import app.askargus.net.ApiException
import java.util.concurrent.TimeUnit

/** Once a day: is there a newer Argus on the download page? Tells the person once per version. */
class UpdateCheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as ArgusApp).container
        val latest = try {
            container.api.latest()
        } catch (e: ApiException) {
            return Result.retry()
        }
        val outcome = UpdateDecision.decide(latest?.version, BuildConfig.VERSION_NAME, container.prefs.notifiedVersion())
        container.prefs.setAvailableUpdate(outcome.available)
        if (outcome.notify && outcome.available != null) {
            Notifications.updateReady(applicationContext, outcome.available)
            container.prefs.setNotifiedVersion(outcome.available)
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(1, TimeUnit.DAYS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("update-check", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
```

`ArgusApp.kt` becomes:
```kotlin
package app.askargus

import android.app.Application
import app.askargus.work.Notifications
import app.askargus.work.UpdateCheckWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ArgusApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifications.createChannels(this)
        UpdateCheckWorker.schedule(this)
        // The Activity timeline keeps 90 days.
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            container.activity.deleteBefore(System.currentTimeMillis() - 90L * 24 * 60 * 60 * 1000)
        }
    }
}
```

In `AndroidManifest.xml`, next to the other permissions:
```xml
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- [ ] **Step 2: Build the real Home screen and remove the stubs**

`ui/home/HomeScreen.kt`:
```kotlin
package app.askargus.ui.home

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.core.Links
import app.askargus.core.Versions
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusCard
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.components.SoonPill
import app.askargus.ui.nav.Routes
import app.askargus.ui.scan.scanViewModel
import app.askargus.ui.theme.ArgusColors
import java.util.Calendar

private val COMING = listOf(
    "Warnings while a scam call rings",
    "A scam-site blocker for every app",
    "Automatic text checks (optional add-on)",
    "Gmail scam alerts",
)

@Composable
fun HomeScreen(container: AppContainer, go: (String) -> Unit) {
    val host = LocalHost.current
    val scan = scanViewModel(container)
    val session by container.account.session.collectAsState()
    val update by container.prefs.availableUpdate.collectAsState(initial = null)
    val startOfDay = remember {
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }
    val today by container.activity.countSince(startOfDay).collectAsState(initial = 0)
    val clipboard = LocalClipboardManager.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { scan.image(it); go(Routes.SCAN) }
    }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !container.prefs.askedNotifications()) {
            container.prefs.setAskedNotifications()
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        LivingEye(EyeMood.IDLE, Modifier.fillMaxWidth(0.62f).align(Alignment.CenterHorizontally))
        Text(session?.name?.substringBefore(' ')?.let { "Hi, $it" } ?: "Argus", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Check anything for scams. Protection that runs by itself (calls, texts and sites) arrives in the next updates.",
            style = MaterialTheme.typography.bodyMedium, color = ArgusColors.MutedText,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction("Scan QR", Modifier.weight(1f)) { go(Routes.QR) }
            QuickAction("Read screenshot", Modifier.weight(1f)) {
                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction("Check copied link", Modifier.weight(1f)) {
                val copied = clipboard.getText()?.text.orEmpty()
                scan.check(Links.first(copied) ?: copied, "clipboard")
                go(Routes.SCAN)
            }
            QuickAction("Paste a message", Modifier.weight(1f)) {
                scan.reset()
                go(Routes.SCAN)
            }
        }
        if (session == null) {
            ArgusCard {
                Text("Sign in to check links, messages and numbers", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                Text("QR codes and screenshots are read without an account; checking what they say needs one. It's free.", color = ArgusColors.MutedText)
                Spacer(Modifier.height(12.dp))
                ArgusButton("Sign in", onClick = { go(Routes.signIn(back = true)) }, modifier = Modifier.fillMaxWidth())
            }
        }
        ArgusCard {
            Text("$today", style = MaterialTheme.typography.displayMedium)
            Text(if (today == 1) "check today" else "checks today", color = ArgusColors.MutedText)
        }
        update?.takeIf { Versions.isNewer(it, BuildConfig.VERSION_NAME) }?.let { version ->
            ArgusCard {
                Text("Argus $version is ready", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                ArgusButton("Download the update", onClick = { host.openUrl("${BuildConfig.APP_URL}/app") }, modifier = Modifier.fillMaxWidth())
            }
        }
        ArgusCard {
            Text("Coming to Argus", style = MaterialTheme.typography.titleMedium)
            COMING.forEach { item ->
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(item, modifier = Modifier.weight(1f))
                    SoonPill()
                }
            }
        }
        ArgusCard(onClick = { go(Routes.FAMILY) }) {
            Text("Look out for your family", style = MaterialTheme.typography.titleMedium)
            Text("Invite parents or grandparents to Argus.", color = ArgusColors.MutedText)
        }
    }
}

@Composable
private fun QuickAction(label: String, modifier: Modifier, onClick: () -> Unit) {
    ArgusCard(modifier, onClick = onClick) { Text(label, style = MaterialTheme.typography.titleMedium) }
}
```

Delete `ui/Stubs.kt`. In `ui/nav/ArgusNav.kt` replace `import app.askargus.ui.HomeScreen` with `import app.askargus.ui.home.HomeScreen`.

- [ ] **Step 3: Test, build, and look at Home**

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
Set-Location ..
api\.venv\Scripts\python -c "import sys, time; sys.path.insert(0, '.superpowers/e2e'); import adbui as u; u.sign_in_fresh(); time.sleep(2); u.find('Allow') and u.tap('Allow'); time.sleep(2); print(u.screenshot('home'))"
```
Expected: `BUILD SUCCESSFUL`; `home.png` shows the eye, "Hi, Demo", the four quick actions, the checks-today card, "Coming to Argus" with "Coming soon" pills, and the family card; the bottom bar has Home, Activity, Argus, Settings. Check the notification permission prompt appeared once and was allowed.

- [ ] **Step 4: Commit**

```bash
git add -A android/app/src/main
git commit -m "feat(android): home screen, daily update check, notifications

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: The signed release build, end to end

**Files:**
- Modify (git-ignored): `.superpowers/e2e/adbui.py` (the APK path comes from `ARGUS_APK`)

**Interfaces:**
- Consumes: everything above; the live askargus.app (deployed in Task 8).
- Produces: a verified `app-release.apk`; screenshots of every screen for review.

- [ ] **Step 1: Let the scripts install any APK**

In `adbui.py`, change `def sign_in_fresh(apk=r"android\app\build\outputs\apk\debug\app-debug.apk"):` to:
```python
def sign_in_fresh(apk=os.environ.get("ARGUS_APK", r"android\app\build\outputs\apk\debug\app-debug.apk")):
```
and in the `android_*.py` scripts that call `u.install(r"android\app\build\outputs\apk\debug\app-debug.apk")`, use `u.install(os.environ.get("ARGUS_APK", r"android\app\build\outputs\apk\debug\app-debug.apk"))` (add `import os`).

Since Task 15, Home asks for notification permission the first time (Android 13+), which would block taps. Add a
helper to `adbui.py` and call it at the end of `sign_in_fresh` (after `time.sleep(3)`):
```python
def allow_notifications():
    time.sleep(2)
    if find("Allow", exact=True) is not None:
        tap("Allow", exact=True)
```
Update the scripts written before the real Home screen existed:
- `android_signin.py`: after tapping **Sign in**, call `u.allow_notifications()`; wait for `"Hi, Demo"` instead of `f"Signed in as {email}"` (both places); at the end wait for `"Sign in to check links"` instead of `"Signed out"`.
- `android_scan.py`: replace `u.wait_for("Signed in as", timeout=40)` with `u.allow_notifications(); u.wait_for("Paste a message", timeout=40)`, and `u.tap("Check something")` with `u.tap("Paste a message")`.

- [ ] **Step 2: Build and install the release APK**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main\android"; . .\tools\env.ps1
.\gradlew.bat :app:testDebugUnitTest :app:assembleRelease
& "$env:ANDROID_HOME\platform-tools\adb.exe" uninstall app.askargus
Set-Location ..
$env:ARGUS_APK = "android\app\build\outputs\apk\release\app-release.apk"
```
Expected: `BUILD SUCCESSFUL`; the debug build is removed (it was signed with a different key).

- [ ] **Step 3: Run every device script on the release build**

```powershell
api\.venv\Scripts\python .superpowers\e2e\android_signin.py
api\.venv\Scripts\python .superpowers\e2e\android_scan.py
api\.venv\Scripts\python .superpowers\e2e\android_share.py
api\.venv\Scripts\python .superpowers\e2e\android_family.py
& "$env:ANDROID_HOME\platform-tools\adb.exe" shell pm get-app-links app.askargus
```
Expected: every PASS line; the app-links output shows `askargus.app: verified` (the release key matches `assetlinks.json`). With the release build, History should open **without an address bar** (Trusted Web Activity) — check `web-history.png`.

- [ ] **Step 4: Review every screenshot**

Read each image in `.superpowers/tmp/android/` (welcome, sign-in, home, scan result, UPI card, screenshot result, camera, activity, web history, settings, invite share, join). Check: nothing cut off or overlapping, text readable on the dark background, the honest words ("No red flags" vs "Safe"), no leftover placeholder text. Fix anything wrong, rebuild, re-run the affected script.

- [ ] **Step 5: Run every test suite and clean up**

```powershell
Set-Location android; .\gradlew.bat :app:testDebugUnitTest; Set-Location ..
Set-Location web; npx vitest run; npx tsc --noEmit -p .; npx eslint src; Set-Location ..
Set-Location api; .venv\Scripts\python -m pytest -q; Set-Location ..
```
Expected: all green (web: the earlier 124 plus this plan's new tests; API: 227 unchanged). Delete the tester's test scans and invites (SQL from Tasks 5 and 7).

No commit unless Step 4 required fixes (then commit them: `fix(android): <what>`).

---

### Task 17: Privacy page, handoff guide and build notes

**Files:**
- Modify: `web/src/app/privacy/page.tsx`, `AI_HANDOFF.md` (LF — use the Edit tool), `README.md`
- Create: `android/README.md`

- [ ] **Step 1: Add the app to the privacy page**

In `web/src/app/privacy/page.tsx`, set the "Last updated" line to today's date, and add this section after "What other Argus users see":
```tsx
      <Section title="Argus for Android">
        <p>
          QR codes and screenshots are read on your phone, and the image never leaves it: only the link or words read
          from it are checked, like anything you paste. Things you check in the app are checked and saved to your
          history exactly as on this website. The app&apos;s Activity list stays on your phone.
        </p>
        <p>
          Your sign-in is kept on your phone, encrypted with a key that never leaves it. When you open a page of this
          website from the app, Argus makes a one-time sign-in link for your own account, so you don&apos;t have to sign
          in twice. Once a day the app checks the download page for a newer version.
        </p>
        <p>
          Family invites: a link works once and expires after 7 days, and only a scrambled (hashed) form of it is
          stored. When someone joins, you both see each other&apos;s name in the app. Either of you can remove the link
          at any time.
        </p>
      </Section>
```
Run: `cd web && npx tsc --noEmit -p . && npx eslint src/app/privacy`
Expected: no errors.

- [ ] **Step 2: Write `android/README.md`**

```markdown
# Argus for Android

Native Kotlin + Jetpack Compose app (package `app.askargus`). It uses askargus.app's `/api/app/*` endpoints with the
signed-in person's Supabase access token, reads QR codes and screenshots on the phone (ML Kit), and opens the
website's pages signed in (one-time link + Trusted Web Activity). Design: `docs/superpowers/specs/2026-09-30-android-app-design.md`.

## Build

Tools live in `%USERPROFILE%\.argus-tools\` (JDK 17, Android SDK; see the Phase 1 plan, Task 1). In PowerShell:

    cd android
    . .\tools\env.ps1
    .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug     # debug build + unit tests
    .\gradlew.bat :app:assembleRelease                          # signed release build

`config.properties` holds public settings only (the same values every visitor's browser gets).

## The signing key — back it up

Release builds are signed with `%USERPROFILE%\.argus\argus-release.jks`, whose passwords are in
`%USERPROFILE%\.argus\keystore.properties`. Both stay out of git. **Back up the whole `.argus` folder** (e.g. a
password manager or private cloud drive). If the key is lost, installed copies of Argus can never be updated, and
`web/public/.well-known/assetlinks.json` (which names the key's SHA-256) would have to change.

## Release

1. Bump `versionCode` and `versionName` in `app/build.gradle.kts`.
2. `.\gradlew.bat :app:assembleRelease`, then copy `app/build/outputs/apk/release/app-release.apk` to `argus-<version>.apk`.
3. Publish a GitHub release tagged `android-v<version>` with that file attached. askargus.app/app and the in-app
   update check pick it up (cached for up to an hour).

## Tests

- JVM unit tests: `.\gradlew.bat :app:testDebugUnitTest`
- On a device or emulator: the git-ignored scripts in `.superpowers/e2e/android_*.py` (driven by `adbui.py`).
```

- [ ] **Step 3: Update the handoff guide and README**

In `AI_HANDOFF.md`: add a TL;DR bullet ("Since <date>: an Android app (Phase 1: scanner, QR/screenshots, Share to Argus, website pages signed in, family invites) — see §6b"), and a new section `### 6b. Android app (android/)` after the website section covering: the package and structure (the table from this plan's File Structure), how it signs in (Supabase REST + Google Credential Manager; the Android OAuth client in the sign-in project), the `/api/app/*` endpoints and caps, the handoff (`SUPABASE_SECRET_KEY`), the family tables and functions, the signing-key location and the backup rule, releases (`android-v*` tags, `/app`, `/api/app/latest`), the device scripts, and "next: Phase 2 call warnings" pointing at the spec. Add `SUPABASE_SECRET_KEY` (Vercel, Sensitive) to the environment-variable table, and the new migration to the database section. In `README.md`, add a short "Android app" paragraph linking `askargus.app/app` and `android/README.md`.

Check line endings: `tr -cd '\r' < AI_HANDOFF.md | wc -c` → `0`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/privacy/page.tsx android/README.md AI_HANDOFF.md README.md
git commit -m "docs: Argus for Android in the privacy policy, handoff guide and README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Publish the first release (needs the user)

**Files:** none in the repo (a GitHub release and the user's settings).

- [ ] **Step 1: Ask the user for their three steps**

Tell the user, in plain words:
1. **Back up the signing key:** copy the folder `C:\Users\GYAN\.argus` to a safe place (Google Drive or a password manager). Without it, the app can never be updated.
2. **Google one-tap sign-in:** Google Cloud → the sign-in project (the one with client `306494429614-…`) → APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Android** → Package name `app.askargus` → SHA-1 certificate fingerprint `<the SHA1 from Task 2 Step 7>` → Create.
3. **Website pages signed in:** confirm `SUPABASE_SECRET_KEY` is on Vercel (from Task 8 Step 7).

Wait for them to say they're done.

- [ ] **Step 2: Push the remaining commits (go-ahead) and check the live site**

After the user says go: `git push origin main`; wait for the Vercel deployment to be READY; then `node .superpowers/e2e/app-api-check.mjs https://askargus.app` → all PASS (handoff on the 200 branch).

- [ ] **Step 3: Get a signed-in GitHub CLI (portable, no admin)**

```powershell
$ProgressPreference = 'SilentlyContinue'
$tools = "$env:USERPROFILE\.argus-tools"
$rel = Invoke-RestMethod "https://api.github.com/repos/cli/cli/releases/latest"
$zip = ($rel.assets | Where-Object { $_.name -like "gh_*_windows_amd64.zip" }).browser_download_url
Invoke-WebRequest $zip -OutFile "$tools\gh.zip"; Expand-Archive "$tools\gh.zip" "$tools\gh" -Force; Remove-Item "$tools\gh.zip"
(Get-ChildItem "$tools\gh" -Recurse -Filter gh.exe | Select-Object -First 1).FullName
```
Then ask the user to run, in this chat, `! & "<that gh.exe path>" auth login --web --git-protocol https` and follow the browser prompt (it signs in their GitHub account on this PC). If they'd rather not, skip to the manual route in Step 4.

- [ ] **Step 4: Publish `android-v0.1.0` (go-ahead: this makes the APK public)**

```powershell
Set-Location "$env:USERPROFILE\Downloads\ARGUS-main"
Copy-Item android\app\build\outputs\apk\release\app-release.apk .superpowers\tmp\argus-0.1.0.apk -Force
(Get-FileHash .superpowers\tmp\argus-0.1.0.apk -Algorithm SHA256).Hash
@"
The first Argus for Android.

- Check links, messages, emails and phone numbers for scams, with the same honest verdicts as askargus.app.
- Scan QR codes with the camera; UPI codes get a clear warning.
- Read screenshots on your phone (English and Hindi) and check what they say.
- Share anything to Argus from another app.
- Open your history, Caller ID, Inbox and family alerts, already signed in.
- Invite family members.

Needs Android 8 or newer. Install steps: https://askargus.app/app
"@ | Set-Content -Encoding utf8 .superpowers\tmp\release-notes.md
& "<gh.exe path>" release create android-v0.1.0 .superpowers\tmp\argus-0.1.0.apk --repo gyanvadhel/ARGUS --title "Argus for Android 0.1.0" --notes-file .superpowers\tmp\release-notes.md
```
Expected: the release URL is printed. **Manual route** (no gh): the user opens github.com/gyanvadhel/ARGUS → Releases → Draft a new release → tag `android-v0.1.0` → title "Argus for Android 0.1.0" → paste the notes → attach `argus-0.1.0.apk` (from `.superpowers\tmp`) → Publish.

- [ ] **Step 5: Check the release is live everywhere**

Within the hour (the release list is cached for up to an hour):
```bash
curl -s https://askargus.app/api/app/latest
curl -s https://askargus.app/app | grep -o "Download Argus 0.1.0"
```
Expected: `{"version":"0.1.0","apk":"https://github.com/gyanvadhel/ARGUS/releases/download/android-v0.1.0/argus-0.1.0.apk",…}` and `Download Argus 0.1.0`. On the emulator, Settings → Check for updates → "You have the latest version."

- [ ] **Step 6: Hand over to the user's phone**

Ask the user to open **askargus.app/app** on their Android phone, install, then try: Google one-tap sign-in, sharing a scam screenshot from Gallery to Argus, scanning a UPI QR code, opening History from the Argus tab (full screen, signed in), and inviting a family member. Note anything odd for a fix release.

- [ ] **Step 7: Record the release**

Update `AI_HANDOFF.md` (release `android-v0.1.0` published on <date>, the user's steps done) and the project memory file; commit `docs: Argus for Android 0.1.0 is out` and push with the user's go-ahead.

