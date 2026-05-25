# Planvas AI

Use the bundled `planvas-mcp` skill when the user asks to inspect, summarize, or update local Planvas whiteboard projects.

For read-only page analysis or ticket updates, load only `skills/planvas-mcp/references/read-page.md`.
For MCP tool calls, load `skills/planvas-mcp/references/mcp-tools.md`.
For direct XML fallback or schema repair, load `skills/planvas-mcp/references/xml-write-schema.md`.

The Planvas MCP server is normally available at `http://127.0.0.1:18001/sse` while the Planvas backend is running.
