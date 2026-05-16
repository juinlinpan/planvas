---
name: planvas
description: Work with local-first Planvas whiteboard projects and pages. Use when creating or opening Planvas projects, adding objects or diagrams to a page, reading page content, writing board state via the API, editing semantic XML or presentation XML files offline, managing note_paper markdown notes, or exporting page data.
---

# Planvas

## Core Rule

**Read semantic XML first.** The `<page>.semantic.xml` file describes what is on the board — objects, titles, content, containment, connector links. Read `<page>.presentation.xml` only when the user asks about visual layout, geometry, colors, z-order, or connector routes.

**Write canvas content, not markdown.** When the user asks to draw, add boxes, add arrows, or make a diagram, the output must be a Planvas board change — not a new `.md` explanation file. Use `PUT /pages/{page_id}/board-state` when the backend is running. If no target page exists, create one first.

---

## Project Layout

```text
<user_home>/.planvas/
  project.json                   ← common project index
  project_store/
    <project_name>/
      .pv_project/
        metadata.json
        <page_name>.semantic.xml
        <page_name>.presentation.xml
        <note_name>.md
```

External projects (opened via path) follow the same `.pv_project/` structure but live anywhere on disk.

---

## Workflow

### 1 — Locate the project

- If the user gives a path, use it directly and verify `.pv_project/metadata.json` exists.
- Otherwise inspect `<user_home>/.planvas/project.json` or `project_store/`.

### 2 — Choose access mode

| Situation | Mode |
|-----------|------|
| Backend running, mutating data | HTTP API |
| Read-only inspection / audit | Direct file read |
| Backend unavailable | Direct file edit |

### 3 — Read the page

1. Read `metadata.json` to find the page id and backing filename.
2. Read `<page_name>.semantic.xml`.
3. For `note_paper` objects, follow `<content_ref type="markdown" file="...">` to `.pv_project/<file>.md`.
4. `links/link` is the canonical relationship graph. `connections` on objects are derived indexes.

### 4 — Write board state (API)

```http
GET /pages/{page_id}/board-data
PUT /pages/{page_id}/board-state
```

The `PUT` payload must include **all** current `board_items` and `connector_links`, not just new ones. Read first, then merge, then write.

Minimal required fields per item:

```json
{
  "id": "node-1",
  "type": "text_box",
  "title": "Step A",
  "content": "...",
  "x": 120, "y": 120, "width": 200, "height": 80,
  "rotation": 0, "z_index": 10
}
```

Auto-filled by backend when omitted: `page_id` (from URL), `category` (from type), `is_collapsed` → `false`, `created_at`/`updated_at` → now.

Arrow connectors need a matching entry in `connector_links`:

```json
{
  "board_items": [
    { "id": "con-1", "type": "arrow", "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0, "z_index": 1 }
  ],
  "connector_links": [
    { "id": "lnk-1", "connector_item_id": "con-1", "from_item_id": "node-1", "to_item_id": "node-2" }
  ]
}
```

### 5 — Write board state (offline XML)

Edit `<page_name>.semantic.xml` and `<page_name>.presentation.xml` directly when the backend is unavailable.

Semantic `<object>` — only three attributes matter:

```xml
<object id="node-1" type="text_box">
  <title>Step A</title>
  <content>...</content>
  <content_format />
  <data_json />
</object>

<!-- child of a frame: add parent_item_id -->
<object id="child-1" parent_item_id="grp-1" type="text_box">
  ...
</object>

<!-- arrow: MUST appear here AND in <links> -->
<object id="con-1" type="arrow">
  <title /><content /><content_format /><data_json />
</object>
```

Presentation `<item>` — `rotation` is required even if zero; `style_json` is a **child element**, never an attribute:

```xml
<item ref="node-1" x="120" y="120" width="200" height="80" rotation="0" z_index="10">
  <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
</item>
```

### 6 — Validate

Re-read the page through the API or XML to confirm the change is correct.

---

## Item Types

| Type | Use for |
|------|---------|
| `text_box` | short label, node, card |
| `sticky_note` | informal note |
| `note_paper` | long markdown-backed note |
| `frame` | collapsible group / swimlane |
| `table` | grid / matrix |
| `arrow` | directional connector (requires connector_link) |
| `line` | decorative non-directional line |

For simple icons, use compact `text_box` / `sticky_note` with a short label (`API`, `DB`, `UI`). Arrow style hint: `{"strokeWidth":3,"arrowHeadSize":14}`.

---

## App Startup (source checkout)

```powershell
planvas
```

Starts frontend at `http://127.0.0.1:5173` and backend at `http://127.0.0.1:18000`.

Quick checks:

```http
GET http://127.0.0.1:18000/healthz
GET http://127.0.0.1:18000/projects
```

---

## Common API Calls

```http
POST   /projects                           create project
POST   /projects/open-path                 register existing folder
GET    /projects/{id}/pages                list pages
POST   /projects/{id}/pages               create page
GET    /pages/{page_id}/board-data         read full board
PUT    /pages/{page_id}/board-state        replace full board
GET    /projects/{id}/notes                list note files
PATCH  /projects/{id}/notes/{file}.md      update note body
```

---

## Reference

For exact XML schema, all API endpoint details, and field descriptions: read [`references/storage-and-api.md`](./references/storage-and-api.md).
