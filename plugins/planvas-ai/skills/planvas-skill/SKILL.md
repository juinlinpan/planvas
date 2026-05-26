---
name: planvas-skill
description: Control local Planvas whiteboard projects through the planvas-mcp server. Use when the AI needs to inspect, summarize, create, or update Planvas projects, pages, markdown notes, board items, connector links, or AI-readable whiteboard structure through MCP tools.
---

# Planvas Skill

## Overview

Use the `planvas-skill` skill to collaborate with the local Planvas whiteboard app. Prefer MCP tools for live project/page/note/item updates, and prefer direct file reads only when the MCP server is unavailable or when inspecting implementation details.

Default server endpoint: `http://127.0.0.1:18001/sse`. The app backend starts the MCP server with the normal backend process.

Load only the reference needed for the task:

- Read `references/read-page.md` when finding projects/pages, reading a page, summarizing board content, or using a page to update external tickets.
- Read `references/mcp-tools.md` when calling Planvas MCP tools or changing projects/pages/notes/items/links through MCP.
- Read `references/xml-write-schema.md` only for direct XML fallback, schema repair, MCP implementation work, or file-level persistence changes.

## Workflow

1. Confirm the backend/MCP server is running when MCP tools are expected. If tools are unavailable, ask the user to start Planvas or run the backend.
2. Discover context before editing:
   - List projects.
   - List pages for the target project.
   - Read the target page before modifying board items or links.
   - List/read notes when working with `note_paper` or project notes.
3. If the request is read-only analysis, load `references/read-page.md` and avoid loading write/API references unless the task changes Planvas data.
4. If the request changes Planvas data through MCP, load `references/mcp-tools.md`.
5. If the request involves direct XML writes, schema repair, export/import behavior, or MCP implementation internals, load `references/xml-write-schema.md`.
6. Prefer semantic intent over visual-only edits. When the user asks for summaries, planning, Jira/story drafting, or relationship analysis, use page board data and markdown notes rather than presentation XML.
7. Before destructive actions, confirm the target explicitly. Deleting pages is irreversible. Removing a `note_paper` board item removes only the placement, while deleting/overwriting a markdown note changes the shared project note file.
8. After writes, read back the affected page or note to verify the persisted state.

## Planvas Model Rules

- Projects are local directories with a `.pv_project/` data folder.
- Pages are stored as paired release-versioned Page XML files: `<page>.semantic.xml` and `<page>.presentation.xml`.
- Markdown notes live directly under `.pv_project/*.md`.
- `note_paper` content is shared markdown-file-backed content. Page data stores a note file reference, not the markdown body.
- A single `.md` note can be placed multiple times on one or more pages.
- `frame` and `table` are large objects.
- `text_box` and `note_paper` are small objects.
- `sticky_note` is a standalone sticky object; do not place it inside frames or tables.
- `arrow` and semantic `line` records express links/relationships.
- The semantic XML is the canonical source for object meaning, containment, table cells, markdown note references, and links.
- The presentation XML is the canonical source for geometry, z-order, collapsed state, style JSON, and connector routing.

## Editing Guidance

- Use `planvas_write_note` for markdown note creation or overwrite. The filename must be a plain `.md` filename with no path separators.
- Use `planvas_add_item` for new board objects. Let the server infer `category` unless there is a specific compatibility reason to set it.
- Use `planvas_update_item` as a full replacement. First read the page, preserve fields the user did not ask to change, then submit all required fields.
- To add a semantic relationship, create or identify an `arrow` item first, then call `planvas_add_link` with that connector item id and the endpoint item ids.
- Keep object ids stable. Do not fabricate ids for existing items; read the page and use returned ids.
- For layout creation, use simple grid-aligned coordinates and sizes unless the user specifies a visual layout.
- When MCP tools are unavailable and direct XML editing is required, update the semantic and presentation XML together and follow `references/xml-write-schema.md`.

## Common Tasks

---

### Summarize a Project or Page

List projects, identify the target project, list pages, read the relevant page, then read referenced markdown notes. Summarize objects, frame/table containment, and connector relationships separately.

### Add a Markdown-Backed Note

Write the `.md` note file first, then add a `note_paper` item whose `data_json` references the note file if the current MCP/API shape requires it. Read the page afterward to verify the placement.

### Create Planning Structure

For sprint or roadmap boards, prefer `frame` for sections, `note_paper` for longer shared notes, `sticky_note` for quick standalone ideas, and `arrow` plus `planvas_add_link` for dependencies or flow.

## Safety

- Never delete a page unless the user clearly asked for that exact page to be deleted.
- Do not overwrite shared markdown notes without checking whether multiple placements may reference the same file.
- Do not bypass MCP by editing `.pv_project` XML directly unless MCP is unavailable or the user specifically asks for file-level repair.
- When editing XML directly, use atomic temp-file then rename writes and escape XML text/attributes correctly.
