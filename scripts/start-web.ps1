param(
  [int]$Port = 18000,
  [string]$HostName = "127.0.0.1",
  [switch]$NoBuild,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$appUrl = "http://${HostName}:$Port"
$healthUrl = "$appUrl/healthz"

function Test-BackendHealth {
  param([string]$Url)

  try {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

Set-Location $projectRoot

if (Test-BackendHealth -Url $healthUrl) {
  Write-Host "Planvas backend is already running at $appUrl."
  if (-not $NoOpen) {
    Start-Process $appUrl
  }
  exit 0
}

if (-not $NoBuild) {
  Write-Host "Building Planvas frontend and backend..."
  npm run build
}

$serverPath = Join-Path $projectRoot "backend\dist\src\server.js"
$frontendIndex = Join-Path $projectRoot "frontend\dist\index.html"
if (-not (Test-Path $serverPath)) {
  Write-Error "Backend bundle not found at $serverPath. Run npm run build first or omit -NoBuild."
}
if (-not (Test-Path $frontendIndex)) {
  Write-Error "Frontend bundle not found at $frontendIndex. Run npm run build first or omit -NoBuild."
}

if (-not $NoOpen) {
  Start-Process $appUrl
}

Write-Host "Starting Planvas local web app at $appUrl"
Write-Host "Close this console window or press Ctrl+C to stop the backend."
& node $serverPath --host $HostName --port $Port
