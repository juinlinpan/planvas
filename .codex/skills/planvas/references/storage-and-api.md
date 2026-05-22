# Planvas File Storage And Page XML Reference

This skill is designed for LLMs to work directly with Planvas project files. The important mental model is:

- `.pv_project/*.semantic.xml` answers "what is this page saying?"
- `.pv_project/*.presentation.xml` answers "where and how is it drawn?"
- `.pv_project/*.md` stores reusable `note_paper` bodies.
- Runtime API endpoints are compatibility tools, not the default way for an AI agent to understand or edit a page.

## 1. Path Resolution

Planvas root defaults to:

```text
<user_home>/.planvas/
```

If `WHITEBOARD_PLANVAS_ROOT` is set, use that instead.

Root layout:

```text
<planvas_root>/
  project.json
  project_store/
    <project_name>/
      .pv_project/
        metadata.json
        <page_stem>.semantic.xml
        <page_stem>.presentation.xml
        <note_file>.md
```

External projects opened by path use the same `.pv_project/` directory but may live outside `project_store/`.

Project lookup order:

1. Use a user-provided path when available.
2. Otherwise read `<planvas_root>/project.json` for registered project paths.
3. Also inspect `<planvas_root>/project_store/*/.pv_project/`.

Project data directory:

```text
<project_dir>/.pv_project/
```

## 2. Page And Note Discovery

Pages are discovered from semantic XML files:

```text
.pv_project/<page_stem>.semantic.xml
.pv_project/<page_stem>.presentation.xml
```

The page stem is the filename before `.semantic.xml`. The matching presentation file must use the same stem.

Read page metadata from the root element:

```xml
<page_semantic schema_version="2"
  id="page-1"
  project_id="project-1"
  name="Roadmap"
  sort_order="1"
  viewport_x="0"
  viewport_y="0"
  zoom="1"
  created_at="..."
  updated_at="...">
```

Project notes are discovered from:

```text
.pv_project/*.md
```

Transitional compatibility note: older/current implementation details may still mirror page records in `metadata.json`. If that array exists, keep it aligned when creating or renaming pages, but use the XML files as the page source for AI reasoning.

## 3. Semantic XML: How To Read The Board

Semantic XML contains three important regions:

```xml
<page_semantic ...>
  <objects>
    ...
  </objects>
  <links>
    ...
  </links>
</page_semantic>
```

Build these indexes first:

- `objectsById`: every `<object id="...">`.
- `linksById`: every `<link id="...">`.
- `childrenByContainer`: from `<contains><item ref="..."/></contains>`.
- `noteFiles`: from `note_paper` `<content_ref type="markdown" file="..."/>`.

### Object Types

```text
text_box     small text/content node
sticky_note  informal note/card
note_paper   markdown-backed reusable note placement
frame        large collapsible container
table        grid/matrix; cells can contain text and small objects
arrow        visible directional connector and semantic link carrier
line         visual line; semantic only when represented in <links>
```

`kind` and `category` are actual XML attributes emitted by the backend on every `<object>` element:

```text
type         kind           category
text_box     small_object   small_item
note_paper   small_object   small_item
sticky_note  sticky_object  sticky_item
frame        large_object   large_item
table        large_object   shape
arrow        link           connector
line         link           shape
```

### Minimal Object

```xml
<object id="node-1" kind="small_object" category="small_item" type="text_box">
  <title>Step A</title>
  <content>Do something</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

When reading:

- `<title>` is the display title.
- `<content>` is plain item body, except `note_paper` content is loaded from markdown.
- `<content_format>` is often `plain_text` or `markdown`.
- `<data_json>` contains type-specific structured data such as connector meaning, table data, note file references, or line routing metadata.

## 4. Markdown-Backed Notes

A `note_paper` object is a placement. Its body belongs in a markdown file:

```xml
<object id="note-1" kind="small_object" category="small_item" type="note_paper">
  <title>Decision Log</title>
  <content />
  <content_format>markdown</content_format>
  <data_json>{"noteFile":"decision-log.md"}</data_json>
  <content_ref type="markdown" file="decision-log.md" />
</object>
```

Read/write the note body here:

```text
.pv_project/decision-log.md
```

Rules:

- Multiple page placements may point to the same `.md` file.
- Editing the `.md` changes every placement that references it.
- Deleting a placement from XML must not delete the `.md` file unless the user explicitly asks to delete the project note.
- Creating a reusable project note only requires creating a `.md` file.
- Placing a note on a page requires a `note_paper` object plus a presentation item.

## 5. Frame Containment

Frames contain small items:

```xml
<object id="frame-1" kind="large_object" category="large_item" type="frame">
  <title>Sprint 12</title>
  <content />
  <content_format />
  <data_json />
  <contains>
    <item ref="note-1" />
    <item ref="task-1" />
  </contains>
</object>

<object id="note-1" parent_item_id="frame-1" kind="sticky_object" category="sticky_item" type="sticky_note">
  <title>Risk</title>
  <content>Vendor dependency</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

When editing containment, keep both signals aligned:

- Parent frame has `<contains><item ref="child-id"/></contains>`.
- Child object has `parent_item_id="frame-id"`.

## 6. Table And Cell Semantics

A table is a large semantic object. Cells are semantic containers:

```xml
<object id="table-1" kind="large_object" category="shape" type="table">
  <title>Sprint board</title>
  <content />
  <content_format />
  <data_json>{"rows":2,"cols":2}</data_json>
  <table rows="2" cols="2">
    <row id="row-0" index="0">
      <cell id="cell-todo" row="0" column="0" row_span="1" col_span="1">
        <text>Todo</text>
        <contains>
          <item ref="task-1" />
        </contains>
      </cell>
    </row>
  </table>
</object>
```

Reading rules:

- Cell ids are stable references.
- `<text>` is the cell's own text.
- Cell `<contains>` points to small objects embedded in the cell.
- Detailed row heights, column widths, merged cells, and embedded item layout may also be mirrored in `data_json`.

## 7. Links: The Canonical Relationship Graph

Use `<links>` as the source of truth for relationships:

```xml
<links>
  <link id="link-1"
        type="arrow"
        connector_item_id="arrow-1"
        from="task-1"
        to="frame-1"
        from_anchor="right"
        to_anchor="left">
    <label>blocks</label>
    <meaning>blocked_by</meaning>
  </link>
</links>
```

Rules:

- `from` and `to` may reference objects or stable table cell ids.
- `connector_item_id` should reference an `arrow` object in `<objects>` when the relationship has a visible connector.
- `label` is display text.
- `meaning` should be explicit when possible: `dependency`, `blocked_by`, `workflow_transition`, `reference`, or `related`.
- Object-level `<connections>` are derived indexes for quick reading. Validate them against `<links>` instead of treating them as independent truth.

Visible connector object:

```xml
<object id="arrow-1" kind="link" category="connector" type="arrow">
  <title />
  <content>blocks</content>
  <content_format>plain_text</content_format>
  <data_json>{"meaning":"blocked_by"}</data_json>
</object>
```

## 8. Presentation XML: Layout And Style

Presentation XML answers layout/styling questions:

```xml
<page_presentation ...>
  <items>
    <item ref="node-1" x="120" y="120" width="220" height="90" rotation="0" z_index="10" is_collapsed="false">
      <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
    </item>
  </items>
</page_presentation>
```

Rules:

- Every visible semantic object needs a matching `<item ref="object-id">`.
- `x`, `y`, `width`, `height` are canvas pixels.
- `rotation` is required; use `0` when unrotated.
- `z_index` controls stacking.
- `is_collapsed` is important for `frame`.
- `style_json` must be a child element. Do not write it as an XML attribute.

Read presentation only when:

- The user asks where something is.
- The task needs to create a visible object.
- The task changes size, position, z-order, collapse state, color, stroke, fill, or route.

## 9. Creating A Page Directly

Create both files with the same stem.

`Roadmap.semantic.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<page_semantic schema_version="2" id="page-roadmap" project_id="project-1" name="Roadmap" sort_order="1" viewport_x="0" viewport_y="0" zoom="1" created_at="2026-01-01T00:00:00.000Z" updated_at="2026-01-01T00:00:00.000Z">
  <objects>
  </objects>
  <links>
  </links>
</page_semantic>
```

`Roadmap.presentation.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<page_presentation schema_version="2" id="page-roadmap" project_id="project-1" name="Roadmap" sort_order="1" viewport_x="0" viewport_y="0" zoom="1" created_at="2026-01-01T00:00:00.000Z" updated_at="2026-01-01T00:00:00.000Z">
  <items>
  </items>
</page_presentation>
```

If `metadata.json` contains a legacy/current `pages` list, add a matching record there too. If it does not, do not invent page-list state.

## 10. Creating A Simple Diagram Directly

Semantic:

```xml
<objects>
  <object id="frontend" kind="small_object" category="small_item" type="text_box">
    <title>Frontend</title>
    <content>React UI</content>
    <content_format>plain_text</content_format>
    <data_json />
  </object>
  <object id="backend" kind="small_object" category="small_item" type="text_box">
    <title>Backend</title>
    <content>Node API</content>
    <content_format>plain_text</content_format>
    <data_json />
  </object>
  <object id="arrow-frontend-backend" kind="link" category="connector" type="arrow">
    <title />
    <content>calls</content>
    <content_format>plain_text</content_format>
    <data_json>{"meaning":"workflow_transition"}</data_json>
  </object>
</objects>
<links>
  <link id="link-frontend-backend" type="arrow" connector_item_id="arrow-frontend-backend" from="frontend" to="backend" from_anchor="right" to_anchor="left">
    <label>calls</label>
    <meaning>workflow_transition</meaning>
  </link>
</links>
```

Presentation:

```xml
<items>
  <item ref="frontend" x="120" y="120" width="180" height="80" rotation="0" z_index="1" is_collapsed="false">
    <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
  </item>
  <item ref="backend" x="420" y="120" width="180" height="80" rotation="0" z_index="2" is_collapsed="false">
    <style_json>{"backgroundColor":"#dcfce7","textColor":"#14532d"}</style_json>
  </item>
  <item ref="arrow-frontend-backend" x="0" y="0" width="0" height="0" rotation="0" z_index="3" is_collapsed="false">
    <style_json>{"strokeWidth":3,"arrowHeadSize":14}</style_json>
  </item>
</items>
```

## 11. Validation Checklist

After editing:

- XML is well-formed.
- Every semantic object id is unique.
- Every presentation `ref` points to a semantic object.
- Every visible semantic object has a presentation item.
- Every `contains/item ref` points to an existing object.
- Child `parent_item_id` agrees with frame containment.
- Every link id is unique.
- Every link endpoint points to an existing object or cell id.
- Every visible link with `connector_item_id` has a matching `arrow` object and presentation item.
- Every `note_paper` `content_ref` file exists unless intentionally creating a placeholder.
- `style_json` and `data_json` are valid JSON when non-empty.

## 12. API Fallback

Use runtime API only when the user specifically wants live app/API behavior or direct file edits are not appropriate.

Default backend:

```text
http://127.0.0.1:18000
```

Most useful fallback calls:

```http
GET /healthz
GET /projects
GET /pages/{page_id}/board-data
PUT /pages/{page_id}/board-state
GET /projects/{project_id}/notes
```

When using `PUT /pages/{page_id}/board-state`, send the complete board state, not just the changed items.
