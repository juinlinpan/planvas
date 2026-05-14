$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "use-desktop-toolchain.ps1")

$toolchain = Use-DesktopToolchain
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

if (-not $toolchain.LinkExe) {
  Write-Error "Tauri desktop build cannot start because MSVC linker link.exe was not found. Run npm run desktop:setup first."
}

if (-not $toolchain.CargoExe) {
  Write-Error "Tauri desktop build cannot start because cargo.exe was not found. Run npm run desktop:setup first."
}

Write-Host "MSVC linker found: $($toolchain.LinkExe)"
Write-Host "Cargo found: $($toolchain.CargoExe)"

npx @tauri-apps/cli build