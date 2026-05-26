$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "use-desktop-toolchain.ps1")

$toolchain = Use-DesktopToolchain
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

node .\scripts\sync-version.mjs

if (-not $toolchain.LinkExe) {
  Write-Error "Tauri desktop build cannot start because MSVC linker link.exe was not found. Run npm run desktop:setup first."
}

if (-not $toolchain.CargoExe) {
  Write-Error "Tauri desktop build cannot start because cargo.exe was not found. Run npm run desktop:setup first."
}

$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  Write-Error "Tauri desktop build cannot start because node.exe was not found."
}

$tauriBinDir = Join-Path $projectRoot "src-tauri\bin"
New-Item -ItemType Directory -Force -Path $tauriBinDir | Out-Null
Copy-Item -Path $nodeExe -Destination (Join-Path $tauriBinDir "node.exe") -Force

Write-Host "MSVC linker found: $($toolchain.LinkExe)"
Write-Host "Cargo found: $($toolchain.CargoExe)"
Write-Host "Packaged Node runtime prepared: $nodeExe"

npx @tauri-apps/cli build
