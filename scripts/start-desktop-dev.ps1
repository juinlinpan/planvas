param(
  [switch]$SkipToolchainCheck
)

$ErrorActionPreference = "Stop"

function Find-LinkExe {
  $command = Get-Command link.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $vsRoot = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio"
  if (-not (Test-Path $vsRoot)) {
    return $null
  }

  $link = Get-ChildItem $vsRoot -Recurse -Filter link.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\VC\Tools\MSVC\*\bin\Hostx64\x64\link.exe" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($link) {
    return $link.FullName
  }
  return $null
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

if (-not $SkipToolchainCheck) {
  $linkExe = Find-LinkExe
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

npx tauri dev
