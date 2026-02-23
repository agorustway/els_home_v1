# ELS Local Test Runner
Write-Host "========================================"
Write-Host "  ELS Container History Local Test"
Write-Host "========================================"
Write-Host ""

# Set environment variables
$env:HEADLESS = "0"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "[1/3] Starting Daemon Server... (port 31999)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\elsbot'; python els_web_runner_daemon.py" -WindowStyle Normal
Start-Sleep -Seconds 3

Write-Host "[2/3] Starting Backend Server... (port 2929)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\docker\els-backend'; python app.py" -WindowStyle Normal
Start-Sleep -Seconds 3

Write-Host "[3/3] Starting Frontend Dev Server... (port 3000)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\web'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "========================================"
Write-Host "  All Servers Started!"
Write-Host "========================================"
Write-Host "  - Daemon:   http://localhost:31999"
Write-Host "  - Backend:  http://localhost:2929"
Write-Host "  - Frontend: http://localhost:3000"
Write-Host "========================================"
Write-Host ""
Write-Host "Open: http://localhost:3000/employees/container-history"
Write-Host ""
Write-Host "To stop: Close windows or run stop_local_test.ps1"
Write-Host ""
