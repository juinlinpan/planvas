# Backend Service

TypeScript + Node.js local API service for Planvas.

The local web launcher and Tauri desktop shell both use this service as the
local API. The near-term desktop packaging path is to launch the same Node
backend as a Tauri sidecar so web and desktop modes share one implementation.
Rust commands remain a future option for local filesystem operations, while a
future server edition can keep using an HTTP/WebSocket backend with different
team and permission semantics.

## Storage Layout

Project data is file based. By default the service stores projects under:

- Planvas root: `<user_home>/.planvas/`
- Project index: `<user_home>/.planvas/project.json`
- Default project store: `<user_home>/.planvas/project_store/`
- New project directory: `<user_home>/.planvas/project_store/<project_name>/`
- External project directory: any user-selected writable folder registered in `project.json`
- Project data directory: `<project_directory>/.pv_project/`
- Project metadata: `<project_directory>/.pv_project/metadata.json` for project-level settings only
- Page files: `<project_directory>/.pv_project/<page_name>.semantic.xml` and `<project_directory>/.pv_project/<page_name>.presentation.xml`
- Markdown note files: `<project_directory>/.pv_project/<note_name>.md`
- Logs: `<backend_root>/logs/app.log`
- Logs: `<backend_root>/logs/backend.log`

Set `WHITEBOARD_PLANVAS_ROOT` if you want project files to live somewhere else.
Set `WHITEBOARD_BACKEND_ROOT` if you want logs and backend runtime files to use a
different writable directory.

Set `WHITEBOARD_FRONTEND_DIST` if the built frontend bundle is not located at
`../frontend/dist`.

## Run

```powershell
npm install
npm run dev --workspace backend
```

On startup the service creates any missing `.planvas`, `project_store`, and
`logs/` directories and fails fast if the configured roots or files are not
writable.

Runtime diagnostics are written to `<backend_root>/logs/app.log`. The backend
records slow HTTP requests, event loop lag, uncaught exceptions, and unhandled
promise rejections so local stalls and backend exits can be diagnosed from the
log after a run.

`POST /projects` creates new projects under `project_store`. `POST
/projects/open-dialog` opens the Windows native folder picker and registers the
selected path, creating `.pv_project/` and `.pv_project/metadata.json` only when
they are missing. `POST /projects/open-path` remains available as the manual
path fallback; it accepts absolute paths, `~` paths, and paths relative to
`<user_home>`.
`GET /projects` refreshes path existence and returns `project_store` projects
before other registered paths.
`DELETE /projects/{project_id}` removes a missing registered path from
`project.json`; existing external project folders are not deleted.
Project path registration is keyed by canonical filesystem path rather than
Project name. Opening the same folder again refreshes the existing entry, while
different folders with the same name remain separate. If a copied folder carries
a duplicated metadata id, the opened copy receives new Project, Page, board
item, and connector ids so the original registration is not replaced and later
Page or note writes stay inside the copied folder.

`note_paper` board items are markdown-file-backed. The HTTP API continues to
send and accept the `content` field, while persistence writes that body to
`.pv_project/<note_name>.md` and stores only a markdown file reference in the
Page XML. Markdown files placed directly under `.pv_project/` are exposed as
Project notes for the frontend sidebar. When the frontend updates
`data_json.noteFile` for a `note_paper`, the repository moves the backing
markdown content to that filename and updates every Page placement that
referenced the previous filename.

`GET /projects/{project_id}/notes` returns every `.md` file under the Project's
`.pv_project/` directory with its title, markdown body, backing filename, and
file mtime. The frontend uses this project-level list for the left sidebar
Notes box and creates Page placements that reference the same markdown file.
Note refresh checks compare filename, title, and markdown body; mtime-only
changes do not require a user refresh. Page board-state saves may send
`note_paper.content` as `null` for unchanged markdown-backed notes, and the
repository preserves the existing `.md` body in that case. Deleting a
`note_paper` board item removes only that placement; markdown note files are not
deleted by Page item deletion. If a placement renames its `data_json.noteFile`,
the repository moves the backing file and updates all Page placements that
referenced the previous filename.

Page XML is written in the release-versioned Planvas layout. The repository
keeps the HTTP API shape stable, but persists each page as two sibling files:
`<page_name>.semantic.xml` and `<page_name>.presentation.xml`. The semantic file
stores board object content, frame containment, table cell containment, markdown
note references, canonical links, and generated per-object `connections`
indexes. The presentation file stores item geometry, z-order, collapsed state,
styling, and other canvas rendering details.
The Page XML root `schema_version` is managed independently as an integer (`v1~n` format) and is set to `"5"`. When the backend opens a legacy `schema_version="2"` Page, a release-based schema like `"0.1.3"`, or older versions, it parses the legacy XML and rewrites the semantic and presentation siblings with the current schema version 5.
Table semantic XML uses a pivot-grid model: the first row is the column axis,
the first column is the row axis, and each cell includes the covered pivot row
and column refs. Merged cells still keep `row_span` / `col_span`, but AI tools
can rely on the explicit pivot refs instead of inferring meaning from visual
grid-line alignment.
The backend strips per-segment table divider offsets before writing Page XML,
because a cell boundary that does not align to the pivot axes cannot be mapped
to a stable semantic cell.

`metadata.json` no longer stores volatile `updated_at`, page lists, note lists,
or page viewport fields. The backend derives Pages from the sibling XML files,
derives Project notes from `.pv_project/*.md`, and keeps `viewport_x`,
`viewport_y`, and `zoom` on each Page XML root.

If `frontend/dist/index.html` exists, the backend also serves the built frontend
bundle from `/` so the app can run on a single local port after `npm run build`.

## Validation

```powershell
npm run typecheck --workspace backend
npm run test --workspace backend
```
