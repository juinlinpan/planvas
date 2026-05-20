---
name: planvas
description: Work with local-first Planvas whiteboard project files. Use when inspecting Planvas pages or notes, explaining Page XML, editing semantic XML/presentation XML, creating pages, creating markdown-backed notes, or making board changes directly through .pv_project XML and .md files.
---

# Planvas

## Core Rule

**Files are the primary interface.** Prefer direct `.pv_project/*.semantic.xml`, `.pv_project/*.presentation.xml`, and `.pv_project/*.md` reads/writes. Use the HTTP API only when the user explicitly asks for runtime API behavior, the running app must immediately reflect a change, or file-level editing is blocked.

**Read semantic XML before anything else.** `<page>.semantic.xml` contains the board meaning: objects, titles, text, note references, frame containment, table cell containment, and canonical links. Read `<page>.presentation.xml` only for layout, geometry, z-order, color/style, collapse state, or connector routing.

**Markdown is only note body storage.** A `note_paper` placement lives in Page XML and points to a `.md` file. Project notes are discovered from `.pv_project/*.md`. Do not create standalone markdown explanations when the user asked to build or change a board.

## Project Paths

Default Planvas root:

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

`WHITEBOARD_PLANVAS_ROOT` may override `<user_home>/.planvas/`. External projects follow the same `.pv_project/` layout but may live anywhere on disk.

## Workflow

### 1. Locate The Project

- If the user gives a project directory, use it directly and verify `.pv_project/metadata.json`.
- Otherwise inspect `<planvas_root>/project.json`, then `<planvas_root>/project_store/`.
- The real project data directory is always `<project_dir>/.pv_project/`.

### 2. Discover Pages And Notes

- Pages are the stems of `*.semantic.xml` files under `.pv_project/`.
- A page stem `Roadmap` maps to `Roadmap.semantic.xml` and `Roadmap.presentation.xml`.
- Read page id/name/viewport attributes from the `<page_semantic ...>` root.
- Notes are `.pv_project/*.md` files.
- Some transitional projects may still list pages in `metadata.json`; if present, keep it aligned, but do not treat it as the source of board meaning.

### 3. Read A Page Graph

1. Read `<page>.semantic.xml`.
2. Build an object map from `<objects>/<object id="..." type="...">`.
3. Follow `note_paper` references to `.pv_project/<note>.md`.
4. Read containment:
   - `frame`: `<contains><item ref="..."/></contains>` plus child `parent_item_id`.
   - `table`: `<table>/<row>/<cell>`; each cell can contain text and item refs.
5. Read relationships from `<links>/<link>`. This is the canonical graph.
6. Treat object `<connections>` as a derived AI-friendly index; it must agree with `<links>`.

### 4. Write XML/MD Directly

For content, create or update semantic XML. For placement and style, create or update presentation XML. For `note_paper` body text, create or update the referenced `.md` file.

Minimum semantic object:

```xml
<object id="node-1" type="text_box">
  <title>Step A</title>
  <content>Do something</content>
  <content_format>plain_text</content_format>
  <data_json />
</object>
```

Minimum presentation item:

```xml
<item ref="node-1" x="120" y="120" width="220" height="90" rotation="0" z_index="10" is_collapsed="false">
  <style_json>{"backgroundColor":"#d6e4fa","textColor":"#1f2937"}</style_json>
</item>
```

Rules:

- Every semantic `<object id>` needs a matching presentation `<item ref>`.
- `style_json` is a child element, not an attribute.
- `type` determines category: `text_box`, `sticky_note`, `note_paper` are small items; `frame` is a large item; `table` is a shape/large semantic object; `arrow` is a connector; `line` is usually presentation-only unless it carries meaning.
- For `note_paper`, store the body in `.md` and keep the Page XML as a placement/reference.
- Re-read edited XML to verify it is well-formed and ids/refs match.

### 5. Create Pages And Notes

To create a page, add both sibling files:

```xml
<?xml version="1.0" encoding="utf-8"?>
<page_semantic schema_version="2" id="page-1" project_id="project-1" name="Roadmap" sort_order="1" viewport_x="0" viewport_y="0" zoom="1" created_at="2026-01-01T00:00:00.000Z" updated_at="2026-01-01T00:00:00.000Z">
  <objects>
  </objects>
  <links>
  </links>
</page_semantic>
```

```xml
<?xml version="1.0" encoding="utf-8"?>
<page_presentation schema_version="2" id="page-1" project_id="project-1" name="Roadmap" sort_order="1" viewport_x="0" viewport_y="0" zoom="1" created_at="2026-01-01T00:00:00.000Z" updated_at="2026-01-01T00:00:00.000Z">
  <items>
  </items>
</page_presentation>
```

To create a reusable note, create `.pv_project/<note_name>.md`. To place it on a page, add a `note_paper` object with `<content_ref type="markdown" file="<note_name>.md" />` and a matching presentation item.

## Reference

For detailed path rules, graph interpretation, XML examples, table/cell structure, note handling, and API fallback guidance, read [`references/storage-and-api.md`](./references/storage-and-api.md).
