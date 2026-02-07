# 백엔드만 재시작
Write-Host "Restarting backend server..."

Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*app.py*"
} | Stop-Process -Force

Start-Sleep -Seconds 2

Set-Location "$PSScriptRoot\docker\els-backend"
$env:PYTHONDONTWRITEBYTECODE = "1"
python app.py
