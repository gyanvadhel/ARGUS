# Dot-source before building: . .\tools\env.ps1  (tools installed by the Phase 1 plan, Task 1)
$env:JAVA_HOME = "$env:USERPROFILE\.argus-tools\jdk-17"
$env:ANDROID_HOME = "$env:USERPROFILE\.argus-tools\android-sdk"
$sdkDir = $env:ANDROID_HOME -replace '\\', '\\'
"sdk.dir=$sdkDir" | Set-Content -Encoding ascii "$PSScriptRoot\..\local.properties"
