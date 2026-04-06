param(
    [switch]$SkipBuild = $false,
    [switch]$ForceUpdate = $false
)

$ErrorActionPreference = "Stop"
$UTF8NoBOM = New-Object System.Text.UTF8Encoding($false)

$ROOT       = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$WEB_DIR    = Join-Path $ROOT "web"
$DRIVER_SRC = Join-Path $WEB_DIR "driver-src"
$GRADLE     = Join-Path $WEB_DIR "android\app\build.gradle"
$VER_JSON   = Join-Path $WEB_DIR "public\apk\version.json"

# 1. Read version from build.gradle
$gradleText  = [System.IO.File]::ReadAllText($GRADLE, [System.Text.Encoding]::UTF8)
$versionCode = [int]($gradleText | Select-String 'versionCode\s+(\d+)').Matches[0].Groups[1].Value
$versionName = ($gradleText | Select-String 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value

Write-Host ""
Write-Host "============================================"
Write-Host " ELS Driver APK Build"
Write-Host " Version: v$versionName  (code: $versionCode)"
Write-Host "============================================"
Write-Host ""

# 2. Update store.js
$storePath = Join-Path $DRIVER_SRC "modules\store.js"
$store = [System.IO.File]::ReadAllText($storePath, [System.Text.Encoding]::UTF8)
$store = $store -replace "APP_VERSION:\s*'v[^']*'", "APP_VERSION: 'v$versionName'"
$store = $store -replace "BUILD_CODE:\s*\d+",       "BUILD_CODE: $versionCode"
[System.IO.File]::WriteAllText($storePath, $store, $UTF8NoBOM)
Write-Host "[1/6] store.js updated (v$versionName / $versionCode)"

# 3. Update index.html
$indexPath = Join-Path $DRIVER_SRC "index.html"
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$index = $index -replace '\?v=[\w.]+', "?v=$versionCode"
[System.IO.File]::WriteAllText($indexPath, $index, $UTF8NoBOM)
Write-Host "[2/6] index.html cache-buster updated"

# 4. Update app.js
$appPath = Join-Path $DRIVER_SRC "app.js"
$app = [System.IO.File]::ReadAllText($appPath, [System.Text.Encoding]::UTF8)
$app = $app -replace '\?v=[\w.]+', "?v=$versionCode"
[System.IO.File]::WriteAllText($appPath, $app, $UTF8NoBOM)
Write-Host "[3/6] app.js cache-buster updated"

# 5. Update modules/*.js imports
$modDir  = Join-Path $DRIVER_SRC "modules"
$jsFiles = Get-ChildItem -Path $modDir -Filter "*.js"
foreach ($f in $jsFiles) {
    $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    $content = $content -replace '\.js\?v=[\w.]+', ".js?v=$versionCode"
    $content = $content -replace "(from '(\./)[^'?]+\.js)(')", "`$1?v=$versionCode`$3"
    $content = $content -replace '(from "(\./)[^"?]+\.js)(")', "`$1?v=$versionCode`$3"
    [System.IO.File]::WriteAllText($f.FullName, $content, $UTF8NoBOM)
}
Write-Host "[4/6] modules/ $($jsFiles.Count) files cache-buster updated"

# 6. Update version.json
$verObj = [ordered]@{
    latestVersion = "v$versionName"
    versionCode   = $versionCode
    forceUpdate   = [bool]$ForceUpdate
    changeLog     = "v$versionName"
    downloadUrl   = "https://www.nollae.com/apk/els_driver.apk?t=$versionCode"
}
$verJson = $verObj | ConvertTo-Json
[System.IO.File]::WriteAllText($VER_JSON, $verJson, $UTF8NoBOM)
Write-Host "[5/6] version.json updated (forceUpdate: $ForceUpdate)"

# 7. cap sync
Write-Host "[6/6] Running cap sync..."
Set-Location $WEB_DIR
npx cap sync
Write-Host "      cap sync done"

# 8. Gradle build
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Starting Gradle build..."
    Set-Location (Join-Path $WEB_DIR "android")
    .\gradlew clean assembleDebug
    Write-Host ""
    $apkPath = Join-Path $WEB_DIR "android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
        Write-Host "============================================"
        Write-Host " BUILD SUCCESS"
        Write-Host " APK: $apkPath"
        Write-Host " Size: ${size} MB"
        Write-Host "============================================"
    }
} else {
    Write-Host ""
    Write-Host "-SkipBuild: Gradle build skipped"
}
