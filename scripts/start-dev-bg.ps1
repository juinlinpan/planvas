param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [Parameter(Mandatory = $true)]
  [string]$LogFile,

  [switch]$Wait,
  [int]$WaitTimeoutSec = 60,
  [string]$HealthUrl = 'http://127.0.0.1:18000/healthz'
)

$ErrorActionPreference = "Stop"

$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$logDirectory = Split-Path -Parent $LogFile
if (-not (Test-Path -LiteralPath $logDirectory)) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

$runner = Join-Path $logDirectory "planvas-dev-run.cmd"
$runnerContent = @"
@echo off
cd /d "$resolvedRoot"
npm.cmd run dev > "$LogFile" 2>&1
"@
Set-Content -LiteralPath $runner -Value $runnerContent -Encoding ASCII

Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList @("/d", "/c", ('""' + $runner + '""')) `
  -WindowStyle Hidden `
  -WorkingDirectory $resolvedRoot

if ($Wait) {
  $elapsed = 0
  Write-Host 'Waiting for backend' -NoNewline
  while ($elapsed -lt $WaitTimeoutSec) {
    try {
      $r = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2 -ErrorAction Stop
      if ($r.data -and $r.data.status -eq 'ok') { break }
    } catch {}
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 1
    $elapsed++
  }
  Write-Host ''
  if ($elapsed -ge $WaitTimeoutSec) {
    Write-Host "Planvas did not respond within $WaitTimeoutSec seconds. Check the log for errors." -ForegroundColor Yellow
    exit 1
  }
  Write-Host 'Planvas is ready.' -ForegroundColor Green
}
