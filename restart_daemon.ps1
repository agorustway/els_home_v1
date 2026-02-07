# 데몬 재시작 스크립트
Write-Host "Stopping daemon..."
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*els_web_runner_daemon*"
} | Stop-Process -Force

Start-Sleep -Seconds 2

Write-Host "Starting daemon..."
Set-Location "$PSScriptRoot\elsbot"
$env:HEADLESS = "0"
python els_web_runner_daemon.py
