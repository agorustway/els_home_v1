@echo off
chcp 65001 >nul
echo ========================================
echo   ELS 컨테이너 이력조회 로컬 테스트
echo ========================================
echo.

REM 환경 변수 설정 (브라우저 보이게)
set HEADLESS=0
set PYTHONIOENCODING=utf-8

echo [1/3] 데몬 서버 시작 중... (포트 31999)
cd /d "%~dp0elsbot"
start "ELS-DAEMON" cmd /k "python els_web_runner_daemon.py"
timeout /t 3 /nobreak >nul

echo [2/3] 백엔드 서버 시작 중... (포트 2929)
cd /d "%~dp0docker\els-backend"
start "ELS-BACKEND" cmd /k "python app.py"
timeout /t 3 /nobreak >nul

echo [3/3] 프론트엔드 개발 서버 시작 중... (포트 3000)
cd /d "%~dp0web"
start "ELS-FRONTEND" cmd /k "npm run dev"

echo.
echo ========================================
echo   모든 서버 시작 완료!
echo ========================================
echo   - 데몬:     http://localhost:31999
echo   - 백엔드:   http://localhost:2929
echo   - 프론트:   http://localhost:3000
echo ========================================
echo.
echo 브라우저에서 http://localhost:3000/employees/container-history 접속
echo.
pause
