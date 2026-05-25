param(
  [ValidateSet('codex', 'gemini-cli', 'antigravity-cli', 'claude-code', 'github-copilot', 'opencode', 'all')]
  [string[]] $Target = @('all'),
  [ValidateSet('project', 'global')]
  [string] $Scope = 'project',
  [string] $ProjectPath = (Get-Location).Path,
  [string] $McpUrl = 'http://127.0.0.1:18001/sse'
)

$ErrorActionPreference = 'Stop'

$PluginRoot = Split-Path -Parent $PSScriptRoot
$SkillSource = Join-Path $PluginRoot 'skills\planvas-mcp'

function Copy-Directory($Source, $Destination) {
  if (!(Test-Path $Source)) {
    throw "Missing source: $Source"
  }
  New-Item -ItemType Directory -Force (Split-Path -Parent $Destination) | Out-Null
  if (Test-Path $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  Copy-Item -Path $Source -Destination $Destination -Recurse -Force
}

function Write-JsonFile($Path, $Object) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $Path) | Out-Null
  $Object | ConvertTo-Json -Depth 16 | Set-Content -Path $Path -Encoding UTF8
}

function Merge-McpServer($Path, $RootKey, $ServerName, $ServerConfig) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $Path) | Out-Null
  if (Test-Path $Path) {
    $Json = Get-Content -Raw $Path | ConvertFrom-Json
  } else {
    $Json = [pscustomobject]@{}
  }
  if ($null -eq $Json.PSObject.Properties[$RootKey]) {
    $Json | Add-Member -MemberType NoteProperty -Name $RootKey -Value ([pscustomobject]@{})
  }
  $Root = $Json.$RootKey
  if ($null -ne $Root.PSObject.Properties[$ServerName]) {
    $Root.PSObject.Properties.Remove($ServerName)
  }
  $Root | Add-Member -MemberType NoteProperty -Name $ServerName -Value $ServerConfig
  $Json | ConvertTo-Json -Depth 16 | Set-Content -Path $Path -Encoding UTF8
}

function New-PlanvasMcpConfig {
  [pscustomobject]@{
    type = 'sse'
    url = $McpUrl
  }
}

function New-PlanvasVsCodeMcpConfig {
  [pscustomobject]@{
    type = 'sse'
    url = $McpUrl
  }
}

function Install-Codex {
  if ($Scope -eq 'global') {
    Copy-Directory $SkillSource (Join-Path $HOME '.codex\skills\planvas-mcp')
    Copy-Directory $PluginRoot (Join-Path $HOME '.codex\plugins\planvas-ai')
  } else {
    Copy-Directory $SkillSource (Join-Path $ProjectPath '.agents\skills\planvas-mcp')
  }
}

function Install-Gemini {
  if ($Scope -eq 'global') {
    Copy-Directory $PluginRoot (Join-Path $HOME '.gemini\extensions\planvas-ai')
  } else {
    Copy-Directory $PluginRoot (Join-Path $ProjectPath '.gemini\extensions\planvas-ai')
  }
}

function Install-Antigravity {
  if ($Scope -eq 'global') {
    Copy-Directory $PluginRoot (Join-Path $HOME '.gemini\antigravity-cli\extensions\planvas-ai')
    Merge-McpServer (Join-Path $HOME '.gemini\antigravity\mcp_config.json') 'mcpServers' 'planvas' (New-PlanvasMcpConfig)
  } else {
    Copy-Directory $PluginRoot (Join-Path $ProjectPath '.antigravitycli\extensions\planvas-ai')
  }
}

function Install-Claude {
  Copy-Directory $SkillSource (Join-Path $ProjectPath '.claude\skills\planvas-mcp')
  Merge-McpServer (Join-Path $ProjectPath '.mcp.json') 'mcpServers' 'planvas' (New-PlanvasMcpConfig)
}

function Install-Copilot {
  Copy-Directory $SkillSource (Join-Path $ProjectPath '.github\skills\planvas-mcp')
  New-Item -ItemType Directory -Force (Join-Path $ProjectPath '.github\instructions') | Out-Null
  Copy-Item -Path (Join-Path $PluginRoot 'adapters\copilot\planvas-ai.instructions.md') -Destination (Join-Path $ProjectPath '.github\instructions\planvas-ai.instructions.md') -Force
  Merge-McpServer (Join-Path $ProjectPath '.vscode\mcp.json') 'servers' 'planvas' (New-PlanvasVsCodeMcpConfig)
}

function Install-OpenCode {
  if ($Scope -eq 'global') {
    Copy-Directory $SkillSource (Join-Path $HOME '.config\opencode\skills\planvas-mcp')
  } else {
    Copy-Directory $SkillSource (Join-Path $ProjectPath '.opencode\skills\planvas-mcp')
    Copy-Item -Path (Join-Path $PluginRoot 'AGENTS.md') -Destination (Join-Path $ProjectPath 'AGENTS.planvas-ai.md') -Force
  }
}

$ResolvedTargets = if ($Target -contains 'all') {
  @('codex', 'gemini-cli', 'antigravity-cli', 'claude-code', 'github-copilot', 'opencode')
} else {
  $Target
}

foreach ($Name in $ResolvedTargets) {
  switch ($Name) {
    'codex' { Install-Codex }
    'gemini-cli' { Install-Gemini }
    'antigravity-cli' { Install-Antigravity }
    'claude-code' { Install-Claude }
    'github-copilot' { Install-Copilot }
    'opencode' { Install-OpenCode }
  }
  Write-Host "Installed Planvas AI for $Name ($Scope)."
}
