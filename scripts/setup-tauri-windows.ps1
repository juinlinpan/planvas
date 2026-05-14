param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

function Find-VsWhere {
  $path = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $path) {
    return $path
  }
  return $null
}

function Get-BuildToolsInstallationPath {
  $vswhere = Find-VsWhere
  if (-not $vswhere) {
    return $null
  }

  $path = & $vswhere -latest -products Microsoft.VisualStudio.Product.BuildTools -property installationPath
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  $path = ($path | Select-Object -First 1).Trim()
  if ([string]::IsNullOrWhiteSpace($path)) {
    return $null
  }

  return $path
}

$linkExe = Find-LinkExe
if ($linkExe) {
  Write-Host "MSVC linker found: $linkExe"
  exit 0
}

if ($CheckOnly) {
  Write-Error "MSVC linker link.exe was not found."
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Error "winget was not found. Install Visual Studio 2022 Build Tools manually with the C++ build tools workload."
}

if (-not (Test-IsAdmin)) {
  Write-Host "Administrator permission is required to install Visual Studio Build Tools."
  $scriptPath = $MyInvocation.MyCommand.Path
  Start-Process powershell -Verb RunAs -ArgumentList @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$scriptPath`""
  )
  exit 0
}

$vswhere = Find-VsWhere
$buildToolsPath = Get-BuildToolsInstallationPath

if ($buildToolsPath) {
  Write-Host "Modifying existing Visual Studio Build Tools installation to add the C++ toolchain..."

  $installer = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\setup.exe"
  if (-not (Test-Path $installer)) {
    Write-Error "Visual Studio Installer was not found. Open the Visual Studio Installer and add the Desktop development with C++ workload manually."
  }

  & $installer modify `
    --installPath "$buildToolsPath" `
    --passive `
    --norestart `
    --add Microsoft.VisualStudio.Workload.VCTools `
    --includeRecommended

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Visual Studio Installer modify failed with exit code $LASTEXITCODE. Open the Visual Studio Installer and add the Desktop development with C++ workload manually."
  }
}
else {
  Write-Host "Installing Visual Studio 2022 Build Tools with C++ toolchain..."
  winget install `
    --source winget `
    --id Microsoft.VisualStudio.2022.BuildTools `
    --exact `
    --accept-package-agreements `
    --accept-source-agreements `
    --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

  if ($LASTEXITCODE -ne 0) {
    Write-Error "winget install for Visual Studio Build Tools failed with exit code $LASTEXITCODE."
  }
}

$linkExe = Find-LinkExe
if (-not $linkExe) {
  Write-Error "Visual Studio Build Tools installed, but link.exe was not found. Re-open PowerShell or check the Visual Studio Installer components."
}

Write-Host "MSVC linker found: $linkExe"
