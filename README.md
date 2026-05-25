# Whiteboard Planner

Local-first whiteboard planning app built with React, TypeScript, Node.js, and file-based project storage.

## Navigation Notes

- Opening a `Project` from the home screen writes a dedicated browser history entry and enters the workspace with the Project's Pages list loaded. No Page opens by default; select a Page from the sidebar to load its board.
- The workspace left sidebar no longer shows project controls. Project renaming now happens directly in the top workspace header.
- The `Home` button now lives in the workspace sidebar header, to the right of the `Whiteboard` title.
- The workspace left sidebar includes a `Notes` box listing every markdown note filename in the current Project. Drag a note onto any Page row to place that note on that Page.
- The `Pages` and `Notes` boxes can be expanded or collapsed. Expanded boxes scroll internally once their entries would exceed about half of the available sidebar height.

## Workspace Layout

- `frontend/`: React + TypeScript + Vite web UI
- `backend/`: TypeScript + Node.js local API service
- `scripts/`: Windows preflight and bootstrap helpers

Frontend pure helper modules are grouped by responsibility. `frontend/src/tableData.ts`
and `frontend/src/canvasHelpers.ts` remain compatibility barrels, while grouped
modules under `frontend/src/tableData/` and `frontend/src/canvasHelpers/` expose
table parsing / mutation / layout / divider helpers and canvas selection / frame
layout / connector anchor / layer ordering / payload conversion helpers.

## Prerequisites

Run the Windows preflight check first:

```powershell
./scripts/preflight.ps1
```

If Node.js LTS is missing, bootstrap it:

```powershell
./scripts/bootstrap.ps1 -InstallNode
```

`node` and `npm` must be available locally.

## Development

Install workspace dependencies:

```powershell
npm install
```

For a source checkout, register the local `planvas` command once:

```powershell
npm link
```

Then start Planvas directly without building:

```powershell
planvas
```

This starts the same source-mode frontend and backend used during development
in the background, then returns control to PowerShell. Open
`http://127.0.0.1:5173` in your browser. Dev server output is written to
`backend/logs/planvas-dev.log`.

To watch the background dev log:

```powershell
Get-Content .\backend\logs\planvas-dev.log -Wait
```

You can still start frontend and backend through npm:

```powershell
npm run dev
```

This mode keeps Vite on `5173` and the TypeScript backend on `18000`.

## Optional AI Tool Plugin

Planvas includes an optional AI collaboration package at `plugins/planvas-ai/`.
It is not bundled into MSI/exe app installation. Users who want AI coding tools
to inspect or update Planvas projects can install it separately as a plugin,
extension, or skill package.

The package includes:

- Codex plugin manifest: `plugins/planvas-ai/.codex-plugin/plugin.json`
- Gemini CLI extension manifest: `plugins/planvas-ai/gemini-extension.json`
- Shared skill: `plugins/planvas-ai/skills/planvas-mcp/`
- MCP config snippets for Planvas MCP at `http://127.0.0.1:18001/sse`
- Install helper: `plugins/planvas-ai/scripts/install.ps1`

Examples:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope global
.\plugins\planvas-ai\scripts\install.ps1 -Target gemini-cli -Scope global
.\plugins\planvas-ai\scripts\install.ps1 -Target claude-code -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target github-copilot -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope project
```

See `plugins/planvas-ai/INSTALL.md` and `user_guide.md` for the full tool list.

If a previous dev session left either port busy, stop the local dev processes:

```powershell
npm run dev:stop
```

## Project Home

The app now opens on a dedicated home page. From there you can:

- create a new `Project`
- open an existing `Project` folder with the Windows native folder picker
- refresh common projects to re-check whether registered paths still exist
- remove missing registered projects from the common project list

New projects are created under `<user_home>/.planvas/project_store/`. Opened
external folders are initialized as Planvas projects when needed, then registered
in `<user_home>/.planvas/project.json`. The home list shows `project_store`
projects first, then registered projects from other paths.
Opening the same folder again reuses the same project registration by canonical
filesystem path. Projects with the same display name remain separate when their
paths differ, and copied project folders with duplicated metadata ids are
assigned a new id instead of replacing the original registration.
If the native folder picker is unavailable, the manual fallback accepts absolute
paths, `~` paths, and paths relative to `<user_home>`.

## Page JSON Export / Import

Inside the workspace top header, the current `Page` now supports:

- `Export JSON`: dump the current page viewport + board items + connectors to a
  local `.whiteboard-page.json` file
- `Export PNG`: export a `.png` snapshot automatically cropped to the area that
  contains visible board items
- `Export PPTX`: export a `.pptx` deck with the current page rendered as a
  single slide, keeping the page name plus a page-level raster snapshot fallback
- `Import JSON`: import that page snapshot into the currently opened page

Import behavior is additive: if the current page is empty it fills from the
file, and if the current page already has content the imported items are layered
on top with regenerated local ids.

Page export payloads now also include `page.item_hierarchy.roots` so downstream
tools (including MCP/agent workflows) can directly read containment trees
without rebuilding them from `parent_item_id`.

## Single-Port Local Run

Build the frontend bundle first:

```powershell
npm run build
```

Then start the backend-only server:

```powershell
npm run serve
```

Open `http://127.0.0.1:18000` in your browser. The Node.js backend will serve the built
frontend bundle from `frontend/dist` and continue exposing the API on the same
port.

## Backend Storage

Project content is stored as regular files. By default the backend creates:

- `<user_home>/.planvas/project.json`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/metadata.json` containing only project-level settings
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/<page_name>.semantic.xml`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/<page_name>.presentation.xml`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/<note_name>.md`
- `backend/logs/app.log`
- `backend/logs/backend.log`

`backend/logs/app.log` also records backend diagnostics for slow HTTP requests,
event loop lag, uncaught exceptions, and unhandled promise rejections.

Projects opened from other folders use the same `.pv_project/` data directory
inside the selected folder, with metadata, page XML files, and markdown note
files under it. Their paths are tracked in `project.json`.

`metadata.json` stores only project-level settings and timestamps. Page lists
are derived from the sibling Page XML files, Project notes are derived from
`.pv_project/*.md`, and each Page XML root stores that Page's viewport fields.

Page XML uses the v2 Planvas layout. Each page is stored as a semantic XML file
and a presentation XML file. The semantic file stores board objects, frame
containment, table cell containment, markdown note references, canonical links,
and derived object connection indexes. AI and automation should read this file
plus referenced markdown files. The presentation file stores geometry, z-order,
collapsed state, styles, and visual routing data needed to restore the canvas.

Markdown files placed directly in `.pv_project/` are treated as `note_paper`
notes. Creating or editing a `note_paper` still uses the normal app UI and API,
but the backend stores the markdown body in a sibling `.md` file; Page XML keeps
the semantic note reference plus the visual board placement. Select a
`note_paper` and use the right inspector's `Markdown file` field to rename the
backing `.md` file. The workspace sidebar lists those project notes and supports
dragging a note onto any Page row to add a placement that references the same
markdown file. The note list refreshes after markdown-backed notes are created,
renamed, updated, or deleted in the canvas. It also refreshes from disk when
the workspace regains focus or the browser tab becomes visible, so external
edits to `.pv_project/*.md` files are reflected in the sidebar and on visible
`note_paper` placements. Deleting a note from a Page removes only that board
placement; the `.md` file remains in the Project and stays in the left Notes
list. The same note file can be placed multiple times on one Page or across
Pages, and every placement reads and writes the same backing markdown file.

You can override the project storage root with `WHITEBOARD_PLANVAS_ROOT`:

```powershell
$env:WHITEBOARD_PLANVAS_ROOT = "D:\planvas-projects"
npm run dev:backend
```

You can override the backend root for logs and runtime files with
`WHITEBOARD_BACKEND_ROOT`:

```powershell
$env:WHITEBOARD_BACKEND_ROOT = "C:\whiteboard-runtime"
npm run dev:backend
```

Startup validates that the backend root, Planvas root, `logs/`, and required log
files are writable. If a configured path is invalid, the backend exits with a
clear initialization error instead of failing later during runtime.

If the frontend build output lives somewhere else, override it with
`WHITEBOARD_FRONTEND_DIST` before running `npm run serve`:

```powershell
$env:WHITEBOARD_FRONTEND_DIST = "C:\whiteboard-build\dist"
npm run serve
```

## Smoke Test

Run a basic local smoke pass that builds the frontend bundle and verifies backend
startup plus static asset serving:

```powershell
npm run smoke
```

Use `./scripts/smoke.ps1 -SkipBuild` if you already have a fresh `frontend/dist`.

## Backup

Create a timestamped local backup of the Planvas project files and log files:

```powershell
npm run backup
```

By default backups land in `./backups/whiteboard-backup-<timestamp>/`. You can
override the Planvas root, backend root, or output directory:

```powershell
./scripts/backup.ps1 -PlanvasRoot D:\planvas-projects -BackendRoot C:\whiteboard-runtime -OutputDir D:\whiteboard-backups
```

## Validation

```powershell
npm run lint
npm run typecheck
npm run format -- --check
npm run build
npm run test --workspace backend
npm run smoke
```

Backend health endpoint:

`GET http://127.0.0.1:18000/healthz`
