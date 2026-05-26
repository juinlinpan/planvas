@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$item = Get-Item -LiteralPath '%PROJECT_ROOT%'; if ($item.Target) { $target = @($item.Target)[0]; if ([System.IO.Path]::IsPathRooted($target)) { [System.IO.Path]::GetFullPath($target) } else { [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $item.FullName) $target)) } } else { $item.FullName }"`) do set "PROJECT_ROOT=%%I"

if "%~1"=="--help" (
  echo Usage: planvas
  echo.
  echo Starts Planvas from source in the background without building first.
  echo Writes dev server output to backend\logs\planvas-dev.log.
  echo Requires npm install to have been run in the checkout.
  exit /b 0
)

if "%~1"=="-h" (
  echo Usage: planvas
  echo.
  echo Starts Planvas from source in the background without building first.
  echo Writes dev server output to backend\logs\planvas-dev.log.
  echo Requires npm install to have been run in the checkout.
  exit /b 0
)

if not exist "%PROJECT_ROOT%\package.json" (
  echo Planvas could not find package.json beside the launcher.
  exit /b 1
)

if not exist "%PROJECT_ROOT%\node_modules" (
  echo Planvas dependencies are missing. Run npm install in this repo first.
  exit /b 1
)

set "LOG_DIR=%PROJECT_ROOT%\backend\logs"
set "LOG_FILE=%LOG_DIR%\planvas-dev.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Starting Planvas from source in the background...
echo Frontend: http://127.0.0.1:5173
echo Backend:  http://127.0.0.1:18000
echo MCP:      http://127.0.0.1:18001/sse
echo Log:      %LOG_FILE%
echo Stop:     npm run dev:stop

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%\scripts\start-dev-bg.ps1" -ProjectRoot "%PROJECT_ROOT%" -LogFile "%LOG_FILE%"
exit /b %ERRORLEVEL%
