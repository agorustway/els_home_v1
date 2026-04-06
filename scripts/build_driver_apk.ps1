param(
    [switch]$SkipBuild = $false,
    [switch]$ForceUpdate = $false
)

# Force UTF-8 encoding for PowerShell console
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# 9. APK Deploy copy + Validation
Write-Host ""
$apkBuild   = Join-Path $WEB_DIR "android\app\build\outputs\apk\debug\app-debug.apk"
$apkDeploy  = Join-Path $WEB_DIR "public\apk\els_driver.apk"

if (Test-Path $apkBuild) {
    $buildTime  = (Get-Item $apkBuild).LastWriteTime
    $currentTime = Get-Date

    Write-Host "[7/7] APK Deploy copy + Validation..."
    Write-Host "  Current time: $($currentTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "  Build time:   $($buildTime.ToString('yyyy-MM-dd HH:mm:ss'))"

    Copy-Item $apkBuild $apkDeploy -Force
    Start-Sleep -Milliseconds 500

    $deployTime = (Get-Item $apkDeploy).LastWriteTime
    $timeDiff   = ($deployTime - $buildTime).TotalSeconds

    Write-Host "  Deploy time:  $($deployTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "  Time diff:    $([math]::Round($timeDiff, 1))sec"

    if ($timeDiff -ge 0 -and $timeDiff -lt 10) {
        Write-Host "  SUCCESS: APK copied to deploy location"
    } else {
        Write-Host "  WARNING: Deploy file time seems odd"
    }

    # APK internal validation
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $tempDir = Join-Path $env:TEMP "els_apk_check_$(Get-Random)"
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $tempDir -Force > $null

        [System.IO.Compression.ZipFile]::ExtractToDirectory($apkDeploy, $tempDir)
        $storeFile = Join-Path $tempDir "assets\public\modules\store.js"

        if (Test-Path $storeFile) {
            $storeContent = [System.IO.File]::ReadAllText($storeFile, [System.Text.Encoding]::UTF8)
            if ($storeContent -like "*APP_VERSION: 'v$versionName'*") {
                Write-Host "  VERIFIED: APK internal version v$versionName OK"
            } else {
                Write-Host "  WARNING: APK internal version mismatch (not v$versionName)"
            }
        }

        # Also check that settings-back-btn is removed (UI fix validation)
        $indexFile = Join-Path $tempDir "assets\public\index.html"
        if (Test-Path $indexFile) {
            $indexContent = [System.IO.File]::ReadAllText($indexFile, [System.Text.Encoding]::UTF8)
            $hasSettingsBtn = $indexContent -like "*settings-back-btn*"
            if (-not $hasSettingsBtn) {
                Write-Host "  VERIFIED: settings-back-btn removed (UI fix OK)"
            } else {
                Write-Host "  WARNING: settings-back-btn still present (UI fix not applied)"
            }
        }

        Remove-Item $tempDir -Recurse -Force
    } catch {
        Write-Host "  (APK validation skipped: $_)"
    }

    Write-Host ""
    Write-Host "============================================"
    Write-Host " DEPLOY COMPLETE"
    Write-Host " Final APK: $apkDeploy"
    Write-Host " Version:   v$versionName ($versionCode)"
    Write-Host "============================================"

} else {
    Write-Host "ERROR: Build APK not found"
    exit 1
}
