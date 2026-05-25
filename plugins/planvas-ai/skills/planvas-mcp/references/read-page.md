# Read Planvas Pages

Use this reference for read-only work: finding projects/pages, reading page meaning, summarizing a board, drafting tickets from a page, or analyzing relationships.

Do not load MCP write/API details for read-only work unless the user asks to change Planvas data.

## Project Layout

Default Planvas root: `<user_home>/.planvas/`

```text
<planvas_root>/
  project.json
  project_store/
    <project_name>/
      .pv_project/
        metadata.json
        <page_slug>.semantic.xml
        <page_slug>.presentation.xml
        <note_file>.md
```

External projects may live outside `project_store/`; their paths are listed in `project.json`.

## What To Read

- Read `<page_slug>.semantic.xml` for board meaning.
- Read referenced `.md` files for `note_paper` body content.
- Read `<page_slug>.presentation.xml` only when visual layout, size, z-order, collapsed state, style, or connector routing matters.

For ticket/story updates, semantic XML plus referenced markdown notes is normally enough.

## Semantic Root

```xml
<page_semantic schema_version="0.1.3"
               id="PAGE_UUID"
               project_id="PROJECT_UUID"
               name="Page Name"
               sort_order="0"
               viewport_x="0"
               viewport_y="0"
               zoom="1"
               created_at="2026-05-25T00:00:00.000Z"
               updated_at="2026-05-25T00:00:00.000Z">
  <objects>
  </objects>
  <links>
  </links>
</page_semantic>
```

## Object Types

| type | kind | category | Content source |
| --- | --- | --- | --- |
| `text_box` | `small_object` | `small_item` | `<content>` |
| `note_paper` | `small_object` | `small_item` | `.md` file referenced by `data_json` and `content_ref` |
| `sticky_note` | `sticky_object` | `sticky_item` | `<content>` |
| `frame` | `large_object` | `large_item` | `<title>` and `<contains>` |
| `table` | `large_object` | `shape` | `<table>` plus `data_json` |
| `arrow` | `link` | `connector` | paired `<link>` record |
| `line` | `link` or presentation-only | `shape` | paired `<link>` only when semantic |

## Common Object Forms

### text_box

```xml
<object id="TEXT_UUID" kind="small_object" category="small_item" type="text_box">
  <title>Optional heading</title>
  <content>Body text</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

### sticky_note

```xml
<object id="STICKY_UUID" kind="sticky_object" category="sticky_item" type="sticky_note">
  <title />
  <content>Sticky text</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

`sticky_note` is standalone and is not contained by frames or tables.

### note_paper

```xml
<object id="NOTE_UUID" kind="small_object" category="small_item" type="note_paper">
  <title />
  <content />
  <content_format>markdown</content_format>
  <data_json>{"note_file":"sprint-notes.md"}</data_json>
  <content_ref type="markdown" file="sprint-notes.md" />
</object>
```

Read the body from `<project_dir>/.pv_project/sprint-notes.md`. The same markdown file may be referenced by multiple placements.

### frame

```xml
<object id="FRAME_UUID" kind="large_object" category="large_item" type="frame">
  <title>Frame label</title>
  <content />
  <content_format />
  <data_json />
  <contains>
    <item ref="CHILD_UUID" />
  </contains>
</object>
```

Frames contain `small_object` children only.

### table

```xml
<object id="TABLE_UUID" kind="large_object" category="shape" type="table">
  <title>Sprint board</title>
  <content />
  <content_format />
  <data_json>{"rows":2,"cols":2}</data_json>
  <table rows="2" cols="2" semantic_model="pivot_grid" pivot_row="0" pivot_column="0">
    <pivot_rows>
      <pivot_row id="row-0" index="0" header_cell="cell-0-0" />
      <pivot_row id="row-1" index="1" header_cell="cell-1-0" />
    </pivot_rows>
    <pivot_columns>
      <pivot_column id="col-0" index="0" header_cell="cell-0-0" />
      <pivot_column id="col-1" index="1" header_cell="cell-0-1" />
    </pivot_columns>
    <row id="row-0" index="0">
      <cell id="cell-0-0" row="0" column="0" row_span="1" col_span="1" row_refs="row-0" column_refs="col-0">
        <text>Todo</text>
        <contains>
          <item ref="TEXT_UUID" />
        </contains>
      </cell>
    </row>
  </table>
</object>
```

Table cells may contain `small_object` children. Tables use pivot-grid
semantics: the first row is the column axis and the first column is the row
axis. A merged cell lists every covered pivot row and column in `row_refs` and
`column_refs`, so reason over those refs instead of visual divider alignment.
If a visual table had local divider offsets, persistence normalizes them away
because semantic cells must align to the pivot row / column axes.

## Links and Relationships

The canonical relationship lives in `<links>`:

```xml
<link id="LINK_UUID"
      type="arrow"
      connector_item_id="ARROW_UUID"
      from="SOURCE_UUID"
      to="TARGET_UUID"
      from_anchor="center"
      to_anchor="center">
  <label>optional label</label>
  <meaning>dependency</meaning>
</link>
```

Object-level `<connections>` entries are derived indexes. Use `<links>` as the source of truth.

Common `meaning` values: `dependency`, `blocked_by`, `workflow_transition`, `reference`, `related`.

## XML Unescaping

| Escaped | Actual |
| --- | --- |
| `&amp;` | `&` |
| `&lt;` | `<` |
| `&gt;` | `>` |
| `&quot;` | `"` |
| `&apos;` | `'` |
