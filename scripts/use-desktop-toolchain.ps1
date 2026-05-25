function Add-PathEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Entry
  )

  if (-not (Test-Path $Entry)) {
    return
  }

  $currentEntries = $env:PATH -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($currentEntries -contains $Entry) {
    return
  }

  $env:PATH = "$Entry;$env:PATH"
}

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

function Find-CargoExe {
  $command = Get-Command cargo.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $cargoBin) {
    return $cargoBin
  }

  return $null
}

function Use-DesktopToolchain {
  $linkExe = Find-LinkExe
  if ($linkExe) {
    Add-PathEntry -Entry (Split-Path $linkExe -Parent)
  }

  $cargoExe = Find-CargoExe
  if ($cargoExe) {
    Add-PathEntry -Entry (Split-Path $cargoExe -Parent)
  }

  return [pscustomobject]@{
    LinkExe = $linkExe
    CargoExe = $cargoExe
  }
}