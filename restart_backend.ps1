# 백엔드만 재시작
Write-Host "Restarting backend server..."

Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*app.py*"
} | Stop-Process -Force

Start-Sleep -Seconds 2

$PYTHON_EXE = if (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") { "$PSScriptRoot\.venv\Scripts\python.exe" } else { "python" }

Set-Location "$PSScriptRoot\docker\els-backend"
$env:PYTHONDONTWRITEBYTECODE = "1"
& $PYTHON_EXE app.py
