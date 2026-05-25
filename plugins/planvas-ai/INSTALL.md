# Planvas AI Plugin Installation

This package is optional. It is not installed by the Planvas MSI/exe flow.

Prerequisite: run Planvas backend so the MCP server is available at `http://127.0.0.1:18001/sse`.

## Quick Install

From the repository root:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope global
.\plugins\planvas-ai\scripts\install.ps1 -Target gemini-cli -Scope global
.\plugins\planvas-ai\scripts\install.ps1 -Target antigravity-cli -Scope global
.\plugins\planvas-ai\scripts\install.ps1 -Target claude-code -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target github-copilot -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope project
```

Install for every supported target:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target all -Scope project
```

## Tool-Specific Notes

### Codex

Project skill install:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope project
```

Global skill/plugin copy:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope global
```

The Codex plugin manifest is at `.codex-plugin/plugin.json` and points to `skills/` plus `.mcp.json`.

### Gemini CLI

Install as a Gemini CLI extension from the local path:

```powershell
gemini extensions install .\plugins\planvas-ai
```

Or copy it directly:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target gemini-cli -Scope global
```

The extension manifest is `gemini-extension.json`.

### Antigravity CLI

Install the shared extension files and MCP snippet:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target antigravity-cli -Scope global
```

If your Antigravity version uses a different plugin directory, copy `plugins/planvas-ai` there manually and merge `adapters/antigravity/mcp_config.snippet.json` into Antigravity's MCP config.

### Claude Code

Use Claude Code's MCP command:

```powershell
claude mcp add --transport sse planvas http://127.0.0.1:18001/sse
```

Then install the skill into the project:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target claude-code -Scope project
```

This creates `.claude/skills/planvas-mcp` and `.mcp.json`.
If `.mcp.json` already exists, the installer merges or replaces only the `planvas` server entry.

### GitHub Copilot

Install the project skill and VS Code MCP config:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target github-copilot -Scope project
```

This creates `.github/skills/planvas-mcp`, `.github/instructions/planvas-ai.instructions.md`, and merges the `planvas` server into `.vscode/mcp.json`.

### OpenCode

Install a project skill:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope project
```

For global use:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope global
```

If you manually edit `opencode.json`, merge the contents of `adapters/opencode/opencode.snippet.json`.
