# Backend Service

TypeScript + Node.js local API service for Whiteboard Planner.

## Storage Layout

Project data is file based. By default the service stores projects under:

- Planvas root: `<user_home>/.planvas/`
- Project index: `<user_home>/.planvas/project.json`
- Default project store: `<user_home>/.planvas/project_store/`
- New project directory: `<user_home>/.planvas/project_store/<project_name>/`
- External project directory: any user-selected writable folder registered in `project.json`
- Project data directory: `<project_directory>/.pv_project/`
- Project metadata: `<project_directory>/.pv_project/metadata.json`
- Page files: `<project_directory>/.pv_project/<page_name>.xml`
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
update timestamp. The frontend uses this project-level list for the left
sidebar Notes box and creates Page placements that reference the same markdown
file. Deleting a `note_paper` board item removes only that placement; markdown
note files are not deleted by Page item deletion. If a placement renames its
`data_json.noteFile`, the repository moves the backing file and updates all
Page placements that referenced the previous filename.

Page XML is written in the Planvas v2 layout. The repository keeps the HTTP API
shape stable, but persists each page as two sibling files:
`<page_name>.semantic.xml` and `<page_name>.presentation.xml`. The semantic file
stores board object content, frame containment, table cell containment, markdown
note references, canonical links, and generated per-object `connections`
indexes. The presentation file stores item geometry, z-order, collapsed state,
styling, and other canvas rendering details.

If `frontend/dist/index.html` exists, the backend also serves the built frontend
bundle from `/` so the app can run on a single local port after `npm run build`.

## Validation

```powershell
npm run typecheck --workspace backend
npm run test --workspace backend
```
