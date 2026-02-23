@echo off
chcp 65001 >nul
echo ========================================
echo   ELS 서버 종료 중...
echo ========================================

taskkill /FI "WINDOWTITLE eq ELS-DAEMON*" /F 2>nul
taskkill /FI "WINDOWTITLE eq ELS-BACKEND*" /F 2>nul
taskkill /FI "WINDOWTITLE eq ELS-FRONTEND*" /F 2>nul

echo.
echo 모든 서버가 종료되었습니다.
pause
