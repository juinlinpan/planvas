param(
  [int[]]$Ports = @(5173, 18000),
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$projectRootText = $projectRoot.Path
$targetIds = New-Object "System.Collections.Generic.HashSet[int]"

foreach ($port in $Ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -and $connection.OwningProcess -gt 0) {
      [void]$targetIds.Add([int]$connection.OwningProcess)
    }
  }
}

$processRows = @()
try {
  $processRows = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -match "^(node|npm|cmd)\.exe$" -and
      $_.CommandLine -and
      (
        $_.CommandLine.Contains($projectRootText) -or
        ($_.CommandLine -match "--port\s+(5173|18000)")
      )
    } |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine
} catch {
  Write-Warning "Could not inspect process command lines. Falling back to port owners only."
}

$childrenByParent = @{}
foreach ($row in $processRows) {
  [void]$targetIds.Add([int]$row.ProcessId)
  $parentId = [int]$row.ParentProcessId
  if (-not $childrenByParent.ContainsKey($parentId)) {
    $childrenByParent[$parentId] = New-Object "System.Collections.Generic.List[int]"
  }
  $childrenByParent[$parentId].Add([int]$row.ProcessId)
}

$queue = New-Object "System.Collections.Generic.Queue[int]"
foreach ($id in $targetIds) {
  $queue.Enqueue($id)
}

while ($queue.Count -gt 0) {
  $id = $queue.Dequeue()
  if (-not $childrenByParent.ContainsKey($id)) {
    continue
  }
  foreach ($childId in $childrenByParent[$id]) {
    if ($targetIds.Add($childId)) {
      $queue.Enqueue($childId)
    }
  }
}

$runningTargets = foreach ($id in $targetIds) {
  Get-Process -Id $id -ErrorAction SilentlyContinue
}

if (-not $runningTargets) {
  Write-Host "No Planvas dev processes found on ports $($Ports -join ', ')."
  exit 0
}

$runningTargets |
  Sort-Object Id |
  Select-Object Id, ProcessName, Path |
  Format-Table -AutoSize

if ($WhatIf) {
  Write-Host "WhatIf mode: no processes were stopped."
  exit 0
}

foreach ($process in ($runningTargets | Sort-Object Id -Descending)) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 300
Write-Host "Stopped Planvas dev processes."
