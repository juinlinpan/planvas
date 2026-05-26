# Planvas XML Write Schema

Use this reference only for direct XML fallback, schema repair, MCP implementation work, export/import persistence changes, or file-level Planvas storage edits.

For read-only analysis, use `read-page.md` instead.

## Direct Write Principle

Each page has two sibling files:

- `<page_slug>.semantic.xml`: object meaning, containment, table cells, note references, and canonical links.
- `<page_slug>.presentation.xml`: geometry, z-order, collapsed state, style JSON, and visual connector routing.

When writing XML directly, update both files together. A semantic object that renders on canvas must have a matching presentation `<item ref="...">`.

## Semantic Object Shape

```xml
<object id="ITEM_UUID"
        kind="small_object"
        category="small_item"
        type="text_box"
        created_at="2026-05-25T00:00:00.000Z"
        updated_at="2026-05-25T00:00:00.000Z">
  <title>Optional heading</title>
  <content>Body text</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

## Presentation Item Shape

```xml
<item ref="ITEM_UUID"
      x="100"
      y="200"
      width="200"
      height="80"
      rotation="0"
      z_index="1"
      is_collapsed="false">
  <style_json />
</item>
```

## Type Mapping

| type | kind | category |
| --- | --- | --- |
| `text_box` | `small_object` | `small_item` |
| `note_paper` | `small_object` | `small_item` |
| `sticky_note` | `sticky_object` | `sticky_item` |
| `frame` | `large_object` | `large_item` |
| `table` | `large_object` | `shape` |
| `arrow` | `link` | `connector` |
| semantic `line` | `link` | `shape` |

## note_paper Write Shape

```xml
<object id="NOTE_UUID" kind="small_object" category="small_item" type="note_paper">
  <title />
  <content />
  <content_format>markdown</content_format>
  <data_json>{"note_file":"sprint-notes.md"}</data_json>
  <content_ref type="markdown" file="sprint-notes.md" />
</object>
```

Write the markdown body to `.pv_project/sprint-notes.md`. Do not store the markdown body in Page XML.

## frame Containment

```xml
<contains>
  <item ref="CHILD_UUID" />
</contains>
```

Frames may contain only `small_object` children. Remove stale child refs when deleting or moving children.

## table Cell Containment

```xml
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
```

Table cells may contain only `small_object` children in the MVP schema.
The first row and first column are pivot axes. Table size is the pivot row count
by pivot column count. For merged cells, keep `row_span` / `col_span` for API
compatibility and also list every covered pivot axis in `row_refs` and
`column_refs`, for example `row_refs="row-1 row-2"`.
Do not write per-segment divider offsets (`colDividerPositions`,
`rowDividerPositions`, `colDividerBreaks`, or `rowDividerBreaks`) for semantic
pivot-grid tables. Cell borders must align to pivot axes; otherwise the cell
cannot be assigned to stable row / column refs.

## Links

The canonical link record:

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

Derived object connections:

```xml
<connections>
  <connection to="TARGET_UUID" by="LINK_UUID" role="outgoing" />
  <connection from="SOURCE_UUID" by="LINK_UUID" role="incoming" />
</connections>
```

Rebuild `<connections>` from `<links>` when writing. Do not treat `<connections>` as canonical.

## Consistency Checklist

1. Preserve existing ids unless creating new objects.
2. Generate UUID v4 for new object/link ids.
3. Add/update/remove semantic `<object>` and matching presentation `<item ref>`.
4. Keep frame and table cell `<contains>` synchronized.
5. Keep `<links>` canonical and rebuild derived `<connections>`.
6. Remove links pointing to deleted objects.
7. Update root and changed object `updated_at` timestamps.
8. Write semantic and presentation XML atomically.

## Atomic Write Pattern

```typescript
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

async function writeAtomic(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${randomUUID()}.xml`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, targetPath);
}
```

## XML Escaping

| Character | Escaped form |
| --- | --- |
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` in attributes | `&quot;` |
| `'` in attributes | `&apos;` |

## Slug and Timestamp Rules

- Use ISO 8601 timestamps from `new Date().toISOString()`.
- Use lowercase, digits, and hyphens for page/note slugs.
- Append `-2`, `-3`, etc. for duplicate slugs.
