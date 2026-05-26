# Planvas MCP Tools

Use this reference when calling Planvas MCP tools or changing projects, pages, markdown notes, board items, or connector links through MCP.

Server name: `planvas-mcp`

Default SSE endpoint: `http://127.0.0.1:18001/sse`

## Discovery

- `planvas_list_projects`: list all projects with id, name, path, and sort order.
- `planvas_list_pages`: input `{ "project_id": "..." }`; list pages in a project.
- `planvas_read_page`: input `{ "page_id": "..." }`; return board items and connector links as JSON.
- `planvas_list_notes`: input `{ "project_id": "..." }`; list project markdown notes.
- `planvas_read_note`: input `{ "project_id": "...", "note_file": "name.md" }`; read a markdown note.

## Note Writes

- `planvas_write_note`: input `{ "project_id": "...", "note_file": "name.md", "content": "..." }`; create or atomically overwrite a markdown note.

Rules:

- `note_file` must be a plain `.md` filename, not a path.
- Notes are project-level shared files under `.pv_project/`.
- Updating a note updates all placements that reference that file.

## Page Writes

- `planvas_create_page`: input `{ "project_id": "...", "name": "..." }`; create an empty page.
- `planvas_delete_page`: input `{ "page_id": "..." }`; delete the page and its XML files. Irreversible.

## Board Item Writes

- `planvas_add_item`: add one board item. Required: `page_id`, `type`.
- `planvas_update_item`: update an existing board item by full replacement. Required: `item_id`, `page_id`, `type`, `x`, `y`, `width`, `height`.

Supported item types:

- `text_box`
- `sticky_note`
- `note_paper`
- `frame`
- `table`
- `arrow`
- `line`

Common item fields:

- `title`
- `content`
- `content_format`
- `data_json`
- `parent_item_id`
- `x`
- `y`
- `width`
- `height`
- `rotation`
- `z_index`
- `is_collapsed`
- `style_json`
- `category`

Category inference:

- `frame` -> `large_item`
- `table`, `line` -> `shape`
- `sticky_note` -> `sticky_item`
- `arrow` -> `connector`
- otherwise -> `small_item`

## Connector Links

- `planvas_add_link`: add a connector link between items. Required: `page_id`, `connector_item_id`. Optional: `from_item_id`, `to_item_id`, `from_anchor`, `to_anchor`.
- `planvas_remove_link`: input `{ "link_id": "..." }`; remove a connector link.

Use anchors such as `center`, `top`, `right`, `bottom`, or `left` when known.

Relationship workflow:

1. Read the page and identify endpoint item ids.
2. Create or identify an `arrow` item.
3. Call `planvas_add_link` with the arrow item id and endpoint ids.
4. Read the page again to verify the connector link.
