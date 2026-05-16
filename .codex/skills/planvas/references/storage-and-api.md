# Planvas Storage And API Reference

## File Storage

Planvas is local-first. The project is the **current workspace directory**; all project data lives under `.pv_project/` within it:

```text
<workspace_root>/
  .pv_project/
    metadata.json
    <page_name>.semantic.xml
    <page_name>.presentation.xml
    <note_name>.md
```

`metadata.json` contains:

```ts
{
  project: {
    id: string;
    name: string;
    theme_color: "default" | "sage" | "sunset" | "ocean";
    default_style_json: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  };
}
```

Pages are discovered by scanning sibling XML files. A page stored as `roadmap.xml` is persisted as `roadmap.semantic.xml` and `roadmap.presentation.xml`.

## Semantic XML

The semantic file is the AI-readable source of truth for board meaning:

```xml
<page_semantic id="..." project_id="..." name="..." sort_order="0" viewport_x="0" viewport_y="0" zoom="1" created_at="..." updated_at="..." schema_version="2">
  <objects>
    <object id="..." kind="small_object" type="text_box">
      <title>...</title>
      <content>...</content>
    </object>
  </objects>
  <links>
    <link id="..." type="arrow" connector_item_id="..." from="..." to="...">
      <label>...</label>
      <meaning>dependency</meaning>
    </link>
  </links>
</page_semantic>
```

Object kinds:

- `large_object`: `frame`, `table`
- `small_object`: `text_box`, `sticky_note`, `note_paper`
- `link`: `line`, `arrow` when they express a relationship

Containment:

- `frame` may include `<contains><item ref="..."/></contains>`.
- `table` contains rows and cells; each `table_cell` can include text and small-object refs.
- The item `parent_item_id` API field maps to frame containment.
- Table cells use stable cell ids inside table JSON and semantic XML.

Relationships:

- `links/link` is canonical.
- `connection` elements on objects are AI-friendly derived indexes and must match canonical links.
- Common `meaning` values include `dependency`, `blocked_by`, `workflow_transition`, `reference`, and `related`.
- Decorative lines with no endpoint, label, or semantic meaning may be presentation-only.

Markdown notes:

```xml
<object id="..." kind="small_object" type="note_paper">
  <title>...</title>
  <content_ref type="markdown" file="note.md" />
</object>
```

Read or update `.pv_project/note.md` for the note body. Do not persist the markdown body inside Page XML content.

## Presentation XML

Read presentation only for visual tasks. It stores geometry, z-order, collapse state, styles, and connector route data:

```xml
<page_presentation id="..." project_id="..." name="..." sort_order="0" viewport_x="0" viewport_y="0" zoom="1" created_at="..." updated_at="..." schema_version="2">
  <items>
    <item ref="..." x="80" y="80" width="240" height="120" z_index="1" />
  </items>
</page_presentation>
```

When editing files offline, update presentation for any change that affects canvas placement, size, z-order, collapsed state, style, or connector routing.

## Runtime API

Default backend: `http://127.0.0.1:18000`

Responses are wrapped as `{ "data": ... }`; errors are `{ "error": { "code", "message", "details" } }`.

Core endpoints:

```http
GET    /healthz
GET    /projects
POST   /projects
POST   /projects/open-path
POST   /projects/open-dialog
GET    /projects/{project_id}
PATCH  /projects/{project_id}
DELETE /projects/{project_id}
GET    /projects/{project_id}/pages
POST   /projects/{project_id}/pages
POST   /projects/{project_id}/pages/reorder
GET    /projects/{project_id}/notes
PATCH  /projects/{project_id}/notes/{note_file}.md
DELETE /projects/{project_id}/notes/{note_file}.md
GET    /pages/{page_id}
PATCH  /pages/{page_id}
DELETE /pages/{page_id}
POST   /pages/{page_id}/duplicate
PATCH  /pages/{page_id}/viewport
GET    /pages/{page_id}/board-data
PUT    /pages/{page_id}/board-state
GET    /pages/{page_id}/board-items
POST   /board-items
GET    /board-items/{item_id}
PATCH  /board-items/{item_id}
DELETE /board-items/{item_id}
GET    /pages/{page_id}/connectors
POST   /connectors
GET    /connectors/{connector_id}
PATCH  /connectors/{connector_id}
DELETE /connectors/{connector_id}
```

Board item fields:

```ts
{
  id: string;
  page_id: string;
  parent_item_id: string | null;
  category: string;
  type: string;
  title: string | null;
  content: string | null;
  content_format: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  is_collapsed: boolean;
  style_json: string | null;
  data_json: string | null;
  created_at: string;
  updated_at: string;
}
```

Common categories and types:

- `shape`: `line`, `table`
- `small_item`: `text_box`, `sticky_note`, `note_paper`
- `large_item`: `frame`
- `connector`: `arrow`

## Creating Canvas Diagrams And Icons

If the requested result should appear on a Planvas page, write board data. Do not create an unrelated markdown file to describe the drawing.

Use this API sequence when the backend is available:

```http
GET /pages/{page_id}/board-data
PUT /pages/{page_id}/board-state
```

The `PUT` payload must include every current board item and connector link, plus the new/updated objects:

```json
{
  "board_items": [
    {
      "id": "node-frontend",
      "page_id": "page-1",
      "parent_item_id": null,
      "category": "small_item",
      "type": "text_box",
      "title": "Frontend",
      "content": "React UI",
      "content_format": "plain_text",
      "x": 120,
      "y": 120,
      "width": 180,
      "height": 80,
      "rotation": 0,
      "z_index": 10,
      "is_collapsed": false,
      "style_json": "{\"backgroundColor\":\"#d6e4fa\",\"textColor\":\"#1f2937\"}",
      "data_json": null,
      "created_at": "2026-01-01T00:00:00+00:00",
      "updated_at": "2026-01-01T00:00:00+00:00"
    }
  ],
  "connector_links": []
}
```

Use existing ids and timestamps for unchanged items. Generate stable unique ids for new items. Put visual coordinates, size, z-order, collapse state, and style in the board item/presentation data. Put meaning, labels, containment, and relationships in semantic XML or connector links.

For simple icons, prefer Planvas-native objects instead of external image files:

- Use a compact `text_box` or `sticky_note` with a short label such as `API`, `DB`, `UI`, or `Auth`.
- Use `frame` for grouped modules.
- Use `arrow` for relationships; set `style_json` to keep arrow heads readable, for example `{"strokeWidth":3,"arrowHeadSize":14}`.
- Use `line` for non-directional visual dividers.

Create markdown only for `note_paper` bodies. A diagram node with text should usually be a `text_box`, `sticky_note`, `frame`, or `table` entry, not a `.md` file.

For generated arrows, keep visual defaults readable:

```json
{ "strokeWidth": 3, "arrowHeadSize": 14 }
```

Use a larger `arrowHeadSize` only when the user explicitly wants visual emphasis.

Connector link fields:

```ts
{
  id: string;
  connector_item_id: string;
  from_item_id: string | null;
  to_item_id: string | null;
  from_anchor: string | null;
  to_anchor: string | null;
}
```

`arrow` endpoints may connect to `text_box`, `sticky_note`, `note_paper`, and `frame`.

## Editing Guidance

Prefer API writes because the repository regenerates semantic and presentation XML consistently.

Use `PUT /pages/{page_id}/board-state` when changing multiple objects or relationships in one operation. Include every current board item and connector link, not just the edited subset.

Use direct XML/markdown edits only for offline project manipulation. When doing this:

- Back up or diff files first.
- Preserve ids, timestamps, and page filename stems where possible.
- Keep page root attributes aligned across the semantic and presentation XML files.
- Keep `note_paper` `content_ref` filenames aligned with existing `.md` files.
- Keep canonical links and object connection indexes consistent.
- Re-read the page after edits and check XML remains well-formed.
