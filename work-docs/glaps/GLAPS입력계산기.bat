@echo off
setlocal

set "GLAPS_DIR=%~dp0"
for %%I in ("%GLAPS_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "SCRIPT_PATH=%REPO_ROOT%\web\scripts\build-glaps-container-formula-workbook.mjs"

if not exist "%SCRIPT_PATH%" (
  set "REPO_ROOT=C:\Users\hoon\Desktop\els_home_v1"
  set "SCRIPT_PATH=C:\Users\hoon\Desktop\els_home_v1\web\scripts\build-glaps-container-formula-workbook.mjs"
)

set "NODE_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_CMD%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [GLAPS] ERROR: Node.js was not found.
    echo Install Node.js or run this from the Codex environment.
    pause
    exit /b 1
  )
  set "NODE_CMD=node"
)

echo [GLAPS] Input calculator
echo Source folder: %GLAPS_DIR%
echo.
echo Close the output workbook before running if overwrite fails.
echo.

pushd "%REPO_ROOT%"
"%NODE_CMD%" "%SCRIPT_PATH%" --source-dir "%GLAPS_DIR%" --open
set "EXIT_CODE=%ERRORLEVEL%"
popd

echo.
if "%EXIT_CODE%"=="0" (
  echo [GLAPS] Done.
) else (
  echo [GLAPS] Failed. Error code: %EXIT_CODE%
)
pause
exit /b %EXIT_CODE%
