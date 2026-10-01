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
- On a device or emulator: the git-ignored scripts in `.superpowers\e2e\android_*.py` (driven by `adbui.py`).