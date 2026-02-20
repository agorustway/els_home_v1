# 데몬 재시작 스크립트
Write-Host "Stopping daemon..."
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*els_web_runner_daemon*"
} | Stop-Process -Force

Start-Sleep -Seconds 2

$PYTHON_EXE = if (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") { "$PSScriptRoot\.venv\Scripts\python.exe" } else { "python" }

Write-Host "Starting daemon..."
Set-Location "$PSScriptRoot\elsbot"
$env:HEADLESS = "0"
& $PYTHON_EXE els_web_runner_daemon.py
