# Planvas Storage And API Reference

## File Storage

Planvas is local-first. The default root is `<user_home>/.planvas/`, unless `WHITEBOARD_PLANVAS_ROOT` overrides it.

Root layout:

```text
<user_home>/.planvas/
  project.json
  project_store/
    <project_name>/
      .pv_project/
        metadata.json
        <page_name>.semantic.xml
        <page_name>.presentation.xml
        <note_name>.md
```

`project.json` has `version: 1` and a `projects[]` index with `project_id`, `path`, `storage_kind`, `sort_order`, `added_at`, and `last_seen_at`.

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
  pages: Array<{
    id: string;
    project_id: string;
    name: string;
    sort_order: number;
    viewport_x: number;
    viewport_y: number;
    zoom: number;
    created_at: string;
    updated_at: string;
    file?: string;
  }>;
}
```

The `file` field is the page backing stem used to find sibling XML variants. A page stored as `roadmap.xml` is persisted as `roadmap.semantic.xml` and `roadmap.presentation.xml`.

## Semantic XML

The semantic file is the AI-readable source of truth for board meaning.

### `<object>` required attributes

Only two attributes are required when writing XML directly:

| Attribute | Required | Notes |
|-----------|----------|-------|
| `id` | ✓ | stable unique id |
| `type` | ✓ | `text_box`, `sticky_note`, `note_paper`, `frame`, `table`, `line`, `arrow` |
| `parent_item_id` | only when inside a frame | the frame's id |

Everything else (`page_id`, `kind`, `category`, `created_at`, `updated_at`) is **auto-derived by the backend** and must not be specified to keep XML minimal. The backend rejects nothing by omission for these fields.

### Connector items belong in `<objects>` too

`arrow` connectors appear **both** in `<objects>` (as `<object id="..." type="arrow">`) **and** as a `<link>` inside `<links>`. Putting them only in `<links>` causes the board to load with 0 visible connectors.

### Minimal semantic XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<page_semantic schema_version="2" id="{page_id}" ...>
  <objects>
    <object id="node-1" type="text_box">
      <title>Step A</title>
      <content>Do something</content>
      <content_format />
      <data_json />
    </object>
    <!-- frame with children -->
    <object id="grp-1" type="frame">
      <title>Group</title>
      <content />
      <content_format />
      <data_json />
      <contains>
        <item ref="child-1" />
      </contains>
    </object>
    <object id="child-1" parent_item_id="grp-1" type="text_box">
      <title>Inside frame</title>
      <content />
      <content_format />
      <data_json />
    </object>
    <!-- arrow — must appear here AND in <links> -->
    <object id="con-1" type="arrow">
      <title />
      <content>label</content>
      <content_format />
      <data_json />
    </object>
  </objects>
  <links>
    <link id="lnk-1" type="arrow" connector_item_id="con-1"
          from="node-1" to="grp-1" from_anchor="" to_anchor="">
      <label>label</label>
    </link>
  </links>
</page_semantic>
```

Containment:

- `frame` may include `<contains><item ref="..."/></contains>`.
- `table` contains rows and cells; each `table_cell` can include text and small-object refs.
- The item `parent_item_id` API field maps to frame containment.
- Table cells use stable cell ids inside table JSON and semantic XML.

Relationships:

- `links/link` is canonical.
- `connection` elements on objects are AI-friendly derived indexes and must match canonical links.
- Common `meaning` values: `dependency`, `blocked_by`, `workflow_transition`, `reference`, `related`.

Markdown notes:

```xml
<object id="..." type="note_paper">
  <title>...</title>
  <content_ref type="markdown" file="note.md" />
</object>
```

Read or update `.pv_project/note.md` for the note body. Do not persist the markdown body inside Page XML content.

## Presentation XML

Read presentation only for visual tasks. It stores geometry, z-order, collapse state, styles, and connector route data.

### `<item>` required attributes and children

| Attribute | Required | Notes |
|-----------|----------|-------|
| `ref` | ✓ | matches `<object id>` in the semantic file |
| `x` | ✓ | canvas x position in px |
| `y` | ✓ | canvas y position in px |
| `width` | ✓ | px |
| `height` | ✓ | px |
| `rotation` | ✓ | degrees; use `0` when not rotated |
| `z_index` | ✓ | integer stacking order |
| `is_collapsed` | — | `false` by default |

`style_json` must be a **child element**, not an attribute:

```xml
<!-- correct -->
<item ref="node-1" x="80" y="80" width="240" height="120" rotation="0" z_index="1">
  <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
</item>

<!-- WRONG — style silently ignored -->
<item ref="node-1" x="80" y="80" width="240" height="120" rotation="0" z_index="1"
      style_json="{&quot;backgroundColor&quot;:&quot;#d6e4fa&quot;}" />
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
  page_id: string;          // auto-filled from URL if omitted
  parent_item_id: string | null;
  category: string;         // auto-derived from type if omitted
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
  is_collapsed: boolean;    // defaults to false if omitted
  style_json: string | null;
  data_json: string | null;
  created_at: string;       // defaults to now if omitted
  updated_at: string;       // defaults to now if omitted
}
```

Item types and what they are:

- `text_box`, `sticky_note`, `note_paper` — text content nodes
- `frame` — collapsible group container
- `table` — grid
- `arrow` — directional connector (also needs a `connector_link` entry)
- `line` — decorative non-directional line

## Creating Canvas Diagrams And Icons

If the requested result should appear on a Planvas page, write board data. Do not create an unrelated markdown file to describe the drawing.

Use this API sequence when the backend is available:

```http
GET /pages/{page_id}/board-data
PUT /pages/{page_id}/board-state
```

The `PUT` payload must include every current board item and connector link, plus the new/updated objects. Minimal required fields for each item:

```json
{
  "board_items": [
    {
      "id": "node-1",
      "type": "text_box",
      "title": "Frontend",
      "content": "React UI",
      "x": 120, "y": 120, "width": 180, "height": 80,
      "rotation": 0, "z_index": 10,
      "style_json": "{\"backgroundColor\":\"#d6e4fa\"}"
    },
    {
      "id": "con-1",
      "type": "arrow",
      "x": 0, "y": 0, "width": 0, "height": 0,
      "rotation": 0, "z_index": 1
    }
  ],
  "connector_links": [
    {
      "id": "lnk-1",
      "connector_item_id": "con-1",
      "from_item_id": "node-1",
      "to_item_id": "node-2"
    }
  ]
}
```

Omitted fields are auto-filled: `page_id` from the URL, `category` from `type`, `is_collapsed` → `false`, `created_at`/`updated_at` → current time.

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
- Keep `metadata.json.pages[].file` aligned with XML filenames.
- Keep `note_paper` `content_ref` filenames aligned with existing `.md` files.
- Keep canonical links and object connection indexes consistent.
- Re-read the page after edits and check XML remains well-formed.
