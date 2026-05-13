@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-web.ps1" %*
if errorlevel 1 (
  echo.
  echo Planvas failed to start. Press any key to close this window.
  pause >nul
)
