@echo off
setlocal

set "GLAPS_DIR=%~dp0"
set "PS_SCRIPT=%GLAPS_DIR%glaps-input-calculator.ps1"

if not exist "%PS_SCRIPT%" (
  echo [GLAPS] ERROR: glaps-input-calculator.ps1 was not found.
  pause
  exit /b 1
)

where pwsh >nul 2>nul
if errorlevel 1 (
  set "PS_CMD=powershell"
) else (
  set "PS_CMD=pwsh"
)

echo [GLAPS] Input calculator
echo Source folder: %GLAPS_DIR%
echo.
echo Close the output workbook before running if overwrite fails.
echo.

"%PS_CMD%" -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [GLAPS] Done.
) else (
  echo [GLAPS] Failed. Error code: %EXIT_CODE%
)

exit /b %EXIT_CODE%