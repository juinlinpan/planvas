---
name: planvas
description: Work with local-first Planvas whiteboard projects and page files. Use when Codex needs to create or open Planvas projects, start the Planvas app, inspect AI-readable Page XML semantic files, read markdown-backed note_paper notes, edit page content through the local API or project files, draw diagrams/icons on Planvas pages, summarize/planning from pages, or export/share Planvas project information.
---

# Planvas

## Core Rule

Prefer the Planvas semantic layer for AI work. Read `<project>/.pv_project/<page>.semantic.xml` and referenced `.md` notes first. Read `<page>.presentation.xml` only when the user asks about visual layout, geometry, colors, z-order, connector routes, or canvas placement.

When making code or project changes inside a Planvas source checkout, follow that repository's `AGENTS.md`, `spec.md`, and `todo_list.md` before editing.

## Canvas Write Contract

When the user asks to draw, place, diagram, make icons, add boxes, add arrows, adjust a page visually, or otherwise change what appears on a Planvas canvas, do not create a standalone `.md` explanation file as the output. The output must be a Planvas page change:

- Prefer the runtime API and write a complete board state with `PUT /pages/{page_id}/board-state`.
- If working offline, update the target page's sibling XML files under `.pv_project/`: semantic XML for objects/links and presentation XML for geometry/style.
- Create or edit `.md` files only for `note_paper` note bodies, and only when the page XML references that markdown file through `content_ref` / `data_json.noteFile`.
- Do not write diagram content into repo-root markdown, random documentation folders, or unrelated files unless the user explicitly asks for documentation instead of a canvas change.
- If no target page exists, create a Page first through the API or metadata/XML pair, then place the objects on that Page.

For visual work, create Planvas board items. Use `text_box`, `sticky_note`, or `note_paper` for text; `frame` for grouped regions; `table` for grids; `line` or `arrow` for connectors; and styled small `text_box` / `sticky_note` items for simple icon labels or diagram nodes. Keep visual geometry in presentation data, not in markdown prose.

## Project Location

The project is the **current workspace directory**. The `.pv_project/` folder inside it holds all project data:

```text
<workspace_root>/
  .pv_project/
    metadata.json
    <page_name>.semantic.xml
    <page_name>.presentation.xml
    <note_name>.md
```

Do not look for projects in any other location. The workspace root is the project root.

## Workflow

1. Locate the project directory.
   - The project directory is always the current workspace root.
   - Verify `.pv_project/metadata.json` exists; if not, treat the workspace root as a new project to initialize.
   - Do not look for projects outside the current workspace.

2. Select the right access mode.
   - Use the HTTP API when the Planvas backend is running and the task mutates project/page data.
   - Use direct file reads for summaries, audits, planning, or offline inspection.
   - Use direct file edits only when the backend is unavailable or the user explicitly wants offline edits; preserve XML structure and stable ids.
   - For drawing or icon/diagram creation, treat this as a mutating page-data task, not as note/document generation.

3. Understand pages from semantic files.
   - Read metadata to map page ids, names, sort order, viewport, and backing filenames.
   - Read each selected page's `.semantic.xml`.
   - For `note_paper`, follow `<content_ref type="markdown" file="...">` into `.pv_project/<file>.md`.
   - Use `links/link` as the canonical relationship graph.
   - Treat object-level `connections` as derived indexes.

4. Edit carefully.
   - Prefer `PUT /pages/{page_id}/board-state` for full board updates.
   - A board-state write must include all existing `board_items` and `connector_links`, not just the new objects.
   - Keep ids stable unless creating genuinely new objects.
   - Keep semantic relationships in `links/link`; do not invent relationships only in `connections`.
   - For `note_paper`, update the `.md` file body; Page XML stores the note reference, not the markdown body.
   - For AI-generated `arrow` items, keep arrow heads compact unless the user asks otherwise; prefer `style_json` with `arrowHeadSize` around `14` and normal `strokeWidth` around `3`.
   - If visual placement changes, update the presentation file/API fields as well as semantic content.

5. Validate the result.
   - Re-read the page through the API or files.
   - Confirm semantic XML, presentation XML, metadata, and markdown note files agree.
   - For source-checkout changes, run the smallest relevant test/build command available.

## App Startup

In a Planvas source checkout with dependencies installed:

```powershell
planvas
```

This starts the frontend at `http://127.0.0.1:5173` and backend at `http://127.0.0.1:18000`.

Useful checks:

```powershell
GET http://127.0.0.1:18000/healthz
GET http://127.0.0.1:18000/projects
```

If the `planvas` command is unavailable in a source checkout, use `npm run dev` or register it with `npm link`.

## Common Tasks

Create a project:

```http
POST /projects
{ "name": "Roadmap", "theme_color": "default" }
```

Open/register an existing folder:

```http
POST /projects/open-path
{ "path": "C:\\path\\to\\project" }
```

Read page board data:

```http
GET /pages/{page_id}/board-data
```

Replace a page board state:

```http
PUT /pages/{page_id}/board-state
{ "board_items": [...], "connector_links": [...] }
```

Add canvas content, icons, or diagrams:

```text
1. GET /pages/{page_id}/board-data
2. Append/update board_items and connector_links in memory.
3. PUT /pages/{page_id}/board-state with the full updated arrays.
4. Re-read board-data or XML to verify the Page changed.
```

List project notes:

```http
GET /projects/{project_id}/notes
```

Update a markdown-backed note:

```http
PATCH /projects/{project_id}/notes/{note_file}.md
{ "content": "# Heading\n\nBody" }
```

## References

Read `references/storage-and-api.md` when you need exact storage fields, item categories, XML semantics, or endpoint details.
