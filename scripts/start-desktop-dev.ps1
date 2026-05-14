param(
  [switch]$SkipToolchainCheck
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "use-desktop-toolchain.ps1")

$toolchain = Use-DesktopToolchain

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

if (-not $SkipToolchainCheck) {
  $linkExe = $toolchain.LinkExe
  if (-not $linkExe) {
    Write-Host ""
    Write-Host "Tauri desktop dev cannot start because MSVC linker link.exe was not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This machine can still run the local web app without admin rights:"
    Write-Host "  scripts\start-web.bat"
    Write-Host "  npm run web:start"
    Write-Host ""
    Write-Host "To run Tauri desktop dev on Windows, ask IT to install Visual Studio 2022 Build Tools with:"
    Write-Host "  - Desktop development with C++"
    Write-Host "  - MSVC v143"
    Write-Host "  - Windows 10/11 SDK"
    Write-Host ""
    exit 1
  }
  Write-Host "MSVC linker found: $linkExe"
}

npx @tauri-apps/cli dev
