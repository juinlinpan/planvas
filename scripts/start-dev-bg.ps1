param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [Parameter(Mandatory = $true)]
  [string]$LogFile
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
