# 강제 종료 후 재시작 스크립트
Write-Host "========================================"
Write-Host "  Force Kill and Restart"
Write-Host "========================================"
Write-Host ""

# 1. 모든 Python 프로세스 강제 종료
Write-Host "[1/4] Force killing all Python processes..."
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# 2. 모든 Node 프로세스 강제 종료
Write-Host "[2/4] Force killing all Node processes..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# 3. 포트 확인
Write-Host "[3/4] Checking ports..."
$ports = @(31999, 2929, 3000)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  Port $port is still in use. Waiting..."
        Start-Sleep -Seconds 2
    }
    else {
        Write-Host "  Port $port is free"
    }
}

# 4. 서버 재시작
Write-Host "[4/4] Starting servers..."
$env:HEADLESS = "0"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONDONTWRITEBYTECODE = "1"  # .pyc 파일 생성 방지

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\elsbot'; `$env:PYTHONDONTWRITEBYTECODE='1'; python els_web_runner_daemon.py" -WindowStyle Normal
Start-Sleep -Seconds 4

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\docker\els-backend'; `$env:PYTHONDONTWRITEBYTECODE='1'; python app.py" -WindowStyle Normal
Start-Sleep -Seconds 4

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\web'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "========================================"
Write-Host "  Restart Complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "Open: http://localhost:3000/employees/container-history"
Write-Host ""
