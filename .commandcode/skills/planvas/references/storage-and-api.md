# Planvas Storage And API Reference

## File Storage

The project is the **current workspace directory**; all project data lives under `.pv_project/` within it:

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

The `file` field is the page backing stem used to find sibling XML variants. A page stored as `roadmap` is persisted as `roadmap.semantic.xml` and `roadmap.presentation.xml`.

## Semantic XML

The semantic file is the AI-readable source of truth for board meaning:

```xml
<page_semantic id="..." schema_version="2">
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
- `connector`: `arrow`, `line`

Containment:

- `frame` may include `<contains><item ref="..."/></contains>`.
- `table` contains rows and cells; each `table_cell` can include text and small-object refs.

Relationships:

- `links/link` is canonical.
- `connection` elements on objects are derived indexes and must match canonical links.
- Common `meaning` values: `dependency`, `blocked_by`, `workflow_transition`, `reference`, `related`.
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

Stores geometry, z-order, collapse state, styles, and connector route data:

```xml
<page_presentation id="..." schema_version="2">
  <items>
    <item ref="..." x="80" y="80" width="240" height="120" z_index="1" />
  </items>
</page_presentation>
```

Update presentation for any change that affects canvas placement, size, z-order, collapsed state, style, or connector routing.

## Editing Guidance

- Preserve all existing `id` values when updating a page; do not remove or reassign them.
- Keep `metadata.json.pages[].file` aligned with XML filenames.
- Keep `note_paper` `content_ref` filenames aligned with existing `.md` files.
- Keep canonical `<link>` elements and object `<connection>` indexes consistent.
- Re-read both XML files after writing and confirm they are well-formed.