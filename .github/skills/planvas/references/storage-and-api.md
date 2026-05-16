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

### Required `<object>` attributes

Every `<object>` in the semantic file **must** carry all of these attributes — omitting any one causes a 500 error when the backend parses the file:

| Attribute | Required | Notes |
|-----------|----------|-------|
| `id` | ✓ | stable unique id |
| `page_id` | ✓ | the page's uuid |
| `parent_item_id` | ✓ | `""` when top-level, frame id when contained |
| `kind` | ✓ | `small_object`, `large_object`, or `link` |
| `category` | ✓ | `small_item`, `large_item`, `shape`, or `connector` |
| `type` | ✓ | `text_box`, `sticky_note`, `note_paper`, `frame`, `table`, `line`, `arrow` |
| `created_at` | ✓ | ISO-8601 with timezone, e.g. `2026-01-01T00:00:00+00:00` |
| `updated_at` | ✓ | ISO-8601 with timezone |

`category` must be consistent with `type`:
- `shape`: `line`, `table`
- `small_item`: `text_box`, `sticky_note`, `note_paper`
- `large_item`: `frame`
- `connector`: `arrow`

### Connector items belong in `<objects>` too

`arrow` connectors appear **both** in `<objects>` (as a regular object with `kind="link"`, `category="connector"`, `type="arrow"`) **and** as a `<link>` inside `<links>`. Putting them only in `<links>` and omitting them from `<objects>` will cause the board to load with 0 connector items even though the link records exist.

### Full semantic XML example

```xml
<page_semantic id="{page_id}" schema_version="2">
  <objects>
    <!-- regular node -->
    <object id="node-1" page_id="{page_id}" parent_item_id=""
            kind="small_object" category="small_item" type="text_box"
            created_at="2026-01-01T00:00:00+00:00" updated_at="2026-01-01T00:00:00+00:00">
      <title>Step A</title>
      <content>Do something</content>
      <content_format />
      <data_json />
    </object>
    <!-- arrow connector — must also appear in <objects> -->
    <object id="con-1" page_id="{page_id}" parent_item_id=""
            kind="link" category="connector" type="arrow"
            created_at="2026-01-01T00:00:00+00:00" updated_at="2026-01-01T00:00:00+00:00">
      <title />
      <content />
      <content_format />
      <data_json />
    </object>
  </objects>
  <links>
    <link id="lnk-1" type="arrow" connector_item_id="con-1" from="node-1" to="node-2">
      <label />
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

Read presentation only for visual tasks. It stores geometry, z-order, collapse state, styles, and connector route data.

### Required `<item>` attributes and children

Every `<item>` **must** have these attributes — omitting `rotation` causes a 500 error:

| Attribute | Required | Notes |
|-----------|----------|-------|
| `ref` | ✓ | matches `<object id>` in the semantic file |
| `x` | ✓ | canvas x position in px |
| `y` | ✓ | canvas y position in px |
| `width` | ✓ | px |
| `height` | ✓ | px |
| `rotation` | ✓ | degrees, use `0` when not rotated |
| `z_index` | ✓ | integer stacking order |
| `is_collapsed` | — | `false` by default |

`style_json` is a **child element**, not an attribute. Do not write it as `style_json="{...}"` — the backend ignores attribute-form style_json and the item renders with no style:

```xml
<!-- correct -->
<item ref="node-1" x="80" y="80" width="240" height="120" rotation="0" z_index="1">
  <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
</item>

<!-- WRONG — style is silently ignored -->
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
- Keep `metadata.json.pages[].file` aligned with XML filenames.
- Keep `note_paper` `content_ref` filenames aligned with existing `.md` files.
- Keep canonical links and object connection indexes consistent.
- Re-read the page after edits and check XML remains well-formed.
