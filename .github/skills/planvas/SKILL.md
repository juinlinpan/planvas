---
name: planvas
description: Work with local-first Planvas whiteboard projects and page files. Use when reading or writing Planvas pages, placing items, drawing diagrams, adding arrows, or summarizing page content.
---

# Planvas

## Core Rule

Edit Planvas pages by reading and writing XML files directly. Do not call the HTTP API. The semantic XML (`<page>.semantic.xml`) is the source of truth for board content; the presentation XML (`<page>.presentation.xml`) stores geometry and style.

When making code or project changes inside a Planvas source checkout, also follow the repository's `AGENTS.md`, `spec.md`, and `todo_list.md`.

## Canvas Write Contract

When adding or changing what appears on a Planvas page:

- Write to `.pv_project/<stem>.semantic.xml` for objects and links.
- Write to `.pv_project/<stem>.presentation.xml` for positions, sizes, colors, and z-order.
- Do not create standalone `.md` files as the result of a canvas change.
- Create or edit `.md` files only for `note_paper` note bodies referenced by `<content_ref type="markdown" file="...">`.
- `metadata.json` stores only project-level settings; discover Pages from sibling XML files and Notes from sibling `.md` files.
- If no target page exists, create both XML files and place the Page identity plus viewport metadata on the XML root attributes.

For visual work, use these item types: `text_box` / `sticky_note` / `note_paper` for text; `frame` for grouped regions; `table` for grids; `arrow` or `line` for connectors.

## Project Location

The project is the **current workspace directory**. All project data lives under `.pv_project/`:

```text
<workspace_root>/
  .pv_project/
    metadata.json
    <page_name>.semantic.xml
    <page_name>.presentation.xml
    <note_name>.md
```

## Workflow

1. **Read `metadata.json`** for project-level settings only.
  - Find Pages by scanning `.pv_project/*.semantic.xml`.
  - The XML stem is the backing page stem: `roadmap` -> `roadmap.semantic.xml` + `roadmap.presentation.xml`.
  - If the page does not exist, choose a new file stem and create both XML files.

2. **Read existing XML** before writing anything.
   - Read `<stem>.semantic.xml` to know current objects and links.
   - Read `<stem>.presentation.xml` to know current geometry.
   - Preserve all existing `id` values; do not remove or reassign them.

3. **Write `<stem>.semantic.xml`**.
   - Keep all existing `<object>` and `<link>` elements.
   - Append or update only the new or changed entries.
   - Assign a stable unique `id` to every new object (e.g. `obj-setup-1`, `con-1`).
   - Express directional relationships as `<link>` elements with a `meaning` attribute.

4. **Write `<stem>.presentation.xml`**.
   - Every `<object>` in the semantic file must have a matching `<item ref="...">` entry.
   - Set `x`, `y`, `width`, `height`, `z_index` for each item.
   - Keep connector items minimal (`width="0" height="0"`) with `style_json` for stroke and head size.

5. **Validate**.
   - Re-read both files and confirm they are well-formed XML.
   - Confirm every semantic object `id` has a matching `ref` in the presentation file.
   - Report the count of objects and links written.

## XML Format

### semantic.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<page_semantic id="<page_id>" schema_version="2">
  <objects>
    <object id="obj-setup-1" kind="small_object" type="text_box">
      <title>System Requirements</title>
      <content>Node 18+, npm 9+</content>
    </object>
    <object id="obj-frame-1" kind="large_object" type="frame">
      <title>Setup</title>
      <contains>
        <item ref="obj-setup-1"/>
      </contains>
    </object>
    <object id="obj-note-1" kind="small_object" type="note_paper">
      <title>Release Notes</title>
      <content_ref type="markdown" file="release-notes.md" />
    </object>
  </objects>
  <links>
    <link id="lnk-1" type="arrow" connector_item_id="con-1" from="obj-setup-1" to="obj-install-1">
      <label>then</label>
      <meaning>workflow_transition</meaning>
    </link>
  </links>
</page_semantic>
```

### presentation.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<page_presentation id="<page_id>" schema_version="2">
  <items>
    <item ref="obj-frame-1"  x="40"  y="40"  width="400" height="300" z_index="1"
          is_collapsed="false"
          style_json="{&quot;backgroundColor&quot;:&quot;#e8f4f8&quot;}" />
    <item ref="obj-setup-1" x="80"  y="100" width="200" height="80"  z_index="2"
          style_json="{&quot;backgroundColor&quot;:&quot;#d6e4fa&quot;,&quot;textColor&quot;:&quot;#1f2937&quot;}" />
    <item ref="obj-note-1"  x="320" y="100" width="200" height="120" z_index="3" />
    <item ref="con-1"       x="0"   y="0"   width="0"   height="0"   z_index="10"
          style_json="{&quot;strokeWidth&quot;:3,&quot;arrowHeadSize&quot;:14}" />
  </items>
</page_presentation>
```

## Object Types

| kind | type | Use for |
|---|---|---|
| `small_object` | `text_box` | Labels, diagram nodes, short text |
| `small_object` | `sticky_note` | Callout notes |
| `small_object` | `note_paper` | Long markdown notes (body in `.md` file) |
| `large_object` | `frame` | Grouped regions, swim lanes |
| `large_object` | `table` | Grids |
| `connector` | `arrow` | Directional relationships |
| `connector` | `line` | Decorative or non-directional |

Arrow `meaning` values: `dependency`, `blocked_by`, `workflow_transition`, `reference`, `related`.

## Adding a New Page

1. Read `metadata.json` to get the project id and project-level settings.
2. Create `my-new-page.semantic.xml` and `my-new-page.presentation.xml` in `.pv_project/`.
3. Put the Page metadata on the root attributes of both XML files, including `id`, `project_id`, `name`, `sort_order`, `viewport_x`, `viewport_y`, `zoom`, `created_at`, and `updated_at`.

## References

Read `references/storage-and-api.md` for exact field definitions and XML schema details.