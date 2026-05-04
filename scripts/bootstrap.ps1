[CmdletBinding()]
param(
  [switch]$InstallNode
)

$ErrorActionPreference = "Stop"

function Assert-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required to run bootstrap.ps1"
  }
}

Assert-Winget

Write-Host "Whiteboard Planner bootstrap" -ForegroundColor Cyan

if (-not $InstallNode) {
  Write-Host "Nothing selected. Use -InstallNode to install Node.js LTS." -ForegroundColor Yellow
  exit 0
}

Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements

Write-Host ""
Write-Host "Run ./scripts/preflight.ps1 again after installation completes." -ForegroundColor Green
