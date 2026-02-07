# ELS 서버 종료 스크립트
Write-Host "========================================"
Write-Host "  ELS 서버 종료 중..."
Write-Host "========================================"

# Python 프로세스 종료
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*els_web_runner_daemon*" -or
    $_.MainWindowTitle -like "*app.py*"
} | Stop-Process -Force

# Node 프로세스 종료 (npm run dev)
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*next dev*"
} | Stop-Process -Force

Write-Host ""
Write-Host "모든 서버가 종료되었습니다."
Write-Host ""
