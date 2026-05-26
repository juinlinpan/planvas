param(
  [int]$Port = 18000,
  [int]$McpPort = 18001,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendUrl = "http://${HostName}:$Port"
$mcpUrl = "http://${HostName}:$McpPort/sse"
$healthUrl = "$backendUrl/healthz"

function Get-BackendHealth {
  param([string]$Url)

  try {
    return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Get-PortOwners {
  param([int]$LocalPort)

  return Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -and $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique
}

Set-Location $projectRoot

$health = Get-BackendHealth -Url $healthUrl
if ($health -and $health.data -and $health.data.service -eq "whiteboard-backend" -and $health.data.status -eq "ok") {
  Write-Host "Reusing existing Planvas backend at $backendUrl."
  Write-Host "MCP server should be running at $mcpUrl."
  Write-Host "This wrapper will stay open so the dev process group remains alive."
  Write-Host "Press Ctrl+C to stop this wrapper. The reused backend will keep running."

  while ($true) {
    Start-Sleep -Seconds 5
    $health = Get-BackendHealth -Url $healthUrl
    if (-not ($health -and $health.data -and $health.data.service -eq "whiteboard-backend" -and $health.data.status -eq "ok")) {
      Write-Host "The reused backend is no longer responding; exiting backend dev wrapper."
      exit 1
    }
  }
}

$owners = Get-PortOwners -LocalPort $Port
if ($owners) {
  Write-Error "Port $Port is already in use, but $healthUrl is not a Planvas backend. Owning PID(s): $($owners -join ', '). Run npm run dev:stop only if these are stale Planvas processes, or choose a different port."
}

$mcpOwners = Get-PortOwners -LocalPort $McpPort
if ($mcpOwners) {
  Write-Warning "MCP port $McpPort is already in use by PID(s): $($mcpOwners -join ', '). The MCP server may fail to start. Run npm run dev:stop to clear stale processes, or pass -McpPort to use a different port."
}

npm run dev --workspace backend
