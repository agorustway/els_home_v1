# 완전 클린 재시작 스크립트
Write-Host "========================================"
Write-Host "  ELS Complete Clean Restart"
Write-Host "========================================"
Write-Host ""

# 1. 모든 Python 프로세스 종료
Write-Host "[1/5] Stopping all Python processes..."
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. 모든 Node 프로세스 종료
Write-Host "[2/5] Stopping all Node processes..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 3. Python 캐시 삭제
Write-Host "[3/5] Cleaning Python cache..."
Get-ChildItem -Path "$PSScriptRoot\elsbot" -Filter "__pycache__" -Recurse -Directory | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "$PSScriptRoot\elsbot" -Filter "*.pyc" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue

# 4. Next.js 캐시 삭제
Write-Host "[4/5] Cleaning Next.js cache..."
Remove-Item -Path "$PSScriptRoot\web\.next" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[5/5] Starting all servers..."
Start-Sleep -Seconds 2

# 환경 변수 설정
$env:HEADLESS = "0"
$env:PYTHONIOENCODING = "utf-8"

# 데몬 시작
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\elsbot'; python els_web_runner_daemon.py" -WindowStyle Normal
Start-Sleep -Seconds 3

# 백엔드 시작
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\docker\els-backend'; python app.py" -WindowStyle Normal
Start-Sleep -Seconds 3

# 프론트엔드 시작
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\web'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "========================================"
Write-Host "  Clean Restart Complete!"
Write-Host "========================================"
Write-Host "  - Daemon:   http://localhost:31999"
Write-Host "  - Backend:  http://localhost:2929"
Write-Host "  - Frontend: http://localhost:3000"
Write-Host "========================================"
Write-Host ""
Write-Host "Open: http://localhost:3000/employees/container-history"
Write-Host ""
