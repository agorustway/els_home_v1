# ============================================================
# build_driver_apk.ps1
# ELS 드라이버 APK 자동 빌드 스크립트
#
# [단일 진실 소스]: web/android/app/build.gradle
#   - versionCode, versionName 을 여기서만 올리면
#     driver-src 전체 ?v= 캐시버스터, store.js, version.json
#     이 모두 자동 갱신됩니다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File scripts\build_driver_apk.ps1
#   또는 선택 인수:
#   -SkipBuild     : cap sync만 하고 gradlew 빌드 생략
#   -ForceUpdate   : version.json forceUpdate=true 로 배포
# ============================================================

param(
    [switch]$SkipBuild = $false,
    [switch]$ForceUpdate = $false
)

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues['*:Encoding'] = 'UTF8'
$UTF8NoBOM = New-Object System.Text.UTF8Encoding($false)

$ROOT       = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$WEB_DIR    = Join-Path $ROOT "web"
$DRIVER_SRC = Join-Path $WEB_DIR "driver-src"
$GRADLE     = Join-Path $WEB_DIR "android\app\build.gradle"
$VER_JSON   = Join-Path $WEB_DIR "public\apk\version.json"

# ── 1. build.gradle에서 버전 읽기 ──────────────────────────
$gradleText   = Get-Content $GRADLE -Encoding UTF8 -Raw
$versionCode  = [int]($gradleText | Select-String 'versionCode\s+(\d+)').Matches[0].Groups[1].Value
$versionName  = ($gradleText | Select-String 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value

Write-Host ""
Write-Host "============================================"
Write-Host " ELS 드라이버 APK 빌드 시작"
Write-Host " 버전: v$versionName  (code: $versionCode)"
Write-Host "============================================"
Write-Host ""

# ── 2. store.js — APP_VERSION / BUILD_CODE 갱신 ────────────
$storePath = Join-Path $DRIVER_SRC "modules\store.js"
$store = [System.IO.File]::ReadAllText($storePath, [System.Text.Encoding]::UTF8)
$store = $store -replace "APP_VERSION:\s*'v[^']*'", "APP_VERSION: 'v$versionName'"
$store = $store -replace "BUILD_CODE:\s*\d+",       "BUILD_CODE: $versionCode"
[System.IO.File]::WriteAllText($storePath, $store, $UTF8NoBOM)
Write-Host "[1/6] store.js 버전 갱신 완료 (APP_VERSION: v$versionName, BUILD_CODE: $versionCode)"

# ── 3. index.html — ?v= 캐시버스터 갱신 ────────────────────
$indexPath = Join-Path $DRIVER_SRC "index.html"
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$index = $index -replace '\?v=[\w.]+', "?v=$versionCode"
[System.IO.File]::WriteAllText($indexPath, $index, $UTF8NoBOM)
Write-Host "[2/6] index.html ?v= 갱신 완료"

# ── 4. app.js — ?v= 캐시버스터 갱신 ────────────────────────
$appPath = Join-Path $DRIVER_SRC "app.js"
$app = [System.IO.File]::ReadAllText($appPath, [System.Text.Encoding]::UTF8)
$app = $app -replace '\?v=[\w.]+', "?v=$versionCode"
[System.IO.File]::WriteAllText($appPath, $app, $UTF8NoBOM)
Write-Host "[3/6] app.js ?v= 갱신 완료"

# ── 5. modules/*.js — 내부 import ?v= 전체 갱신 ─────────────
$modDir = Join-Path $DRIVER_SRC "modules"
$jsFiles = Get-ChildItem -Path $modDir -Filter "*.js"
foreach ($f in $jsFiles) {
    $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    # 기존 ?v= 갱신
    $content = $content -replace '\.js\?v=[\w.]+', ".js?v=$versionCode"
    # ?v= 없는 relative import 추가: from './xxx.js' → from './xxx.js?v=CODE'
    $content = $content -replace "(from '(\./)[^'?]+\.js)(')", "`$1?v=$versionCode`$3"
    $content = $content -replace '(from "(\./)[^"?]+\.js)(")', "`$1?v=$versionCode`$3"
    [System.IO.File]::WriteAllText($f.FullName, $content, $UTF8NoBOM)
}
Write-Host "[4/6] modules/ $($jsFiles.Count)개 파일 ?v= 갱신 완료"

# ── 6. version.json 갱신 ────────────────────────────────────
$verObj = [ordered]@{
    latestVersion = "v$versionName"
    versionCode   = $versionCode
    forceUpdate   = [bool]$ForceUpdate
    changeLog     = "v$versionName 배포"
    downloadUrl   = "https://www.nollae.com/apk/els_driver.apk?t=$versionCode"
}
$verJson = $verObj | ConvertTo-Json
[System.IO.File]::WriteAllText($VER_JSON, $verJson, $UTF8NoBOM)
Write-Host "[5/6] version.json 갱신 완료 (forceUpdate: $ForceUpdate)"

# ── 7. cap sync ─────────────────────────────────────────────
Write-Host "[6/6] cap sync 실행 중..."
Set-Location $WEB_DIR
npx cap sync
Write-Host "      cap sync 완료"

# ── 8. Gradle 빌드 ──────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Gradle 빌드 시작..."
    Set-Location (Join-Path $WEB_DIR "android")
    .\gradlew clean assembleDebug
    Write-Host ""
    $apkPath = Join-Path $WEB_DIR "android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
        Write-Host "============================================"
        Write-Host " 빌드 성공!"
        Write-Host " APK: $apkPath"
        Write-Host " 크기: ${size} MB"
        Write-Host "============================================"
    }
} else {
    Write-Host ""
    Write-Host "-SkipBuild 플래그: Gradle 빌드 생략됨"
}
