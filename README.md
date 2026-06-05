# Planvas

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
If `18000` is already serving a healthy Planvas backend, the dev backend wrapper
reuses it instead of starting another backend process.

## Optional AI Tool Plugin

Planvas includes an optional AI collaboration package at `plugins/planvas-ai/`.
It is not bundled into MSI/exe app installation. Users who want AI coding tools
to inspect or update Planvas projects can install it separately as a plugin,
extension, or skill package.

The package includes:

- Codex plugin manifest: `plugins/planvas-ai/.codex-plugin/plugin.json`
- Gemini CLI extension manifest: `plugins/planvas-ai/gemini-extension.json`
- Shared skill: `plugins/planvas-ai/skills/planvas-skill/`
- MCP config snippets for Planvas MCP at `http://127.0.0.1:18001/sse`
- Install helper: `plugins/planvas-ai/scripts/install.ps1`

Examples:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target gemini-cli -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target claude-code -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target github-copilot -Scope project
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope project
```

See `plugins/planvas-ai/INSTALL.md` and `user_guide.md` for the full tool list.

Users can also install from inside the app: open a Project, go to Project
Settings, choose `Connect to your AI agent`, select the tool, then use `Copy`
or `Run`. This Project Settings flow installs into the selected Project path
rather than a user-global directory.

If a previous dev session left either port busy, stop the local dev processes:

```powershell
npm run dev:stop
```

## Local Web Launcher

For company environments that may block unsigned desktop executables, Planvas
also supports a browser-based local launcher. It uses the same Node local
backend and opens the built web app in your default browser:

```powershell
npm run web:start
```

Windows users can also double-click:

```text
scripts\start-web.bat
```

The launcher reuses an existing backend if `http://127.0.0.1:18000/healthz`
already responds. Otherwise it builds the app, opens the browser, and runs the
Node backend in the launcher console. Closing that console stops the local
backend.

## Desktop Development

Planvas now includes a Tauri 2 desktop shell for the local-first desktop path.
The first desktop implementation preserves the current React UI and Node local
API behavior while the Rust command backend is migrated incrementally.

Start the desktop app in development:

```powershell
npm run desktop:dev
```

The desktop dev/build scripts now auto-detect the installed MSVC linker and
Rust cargo bin directories, so you should not need to prepend PATH manually in
normal use.

If this machine does not have MSVC `link.exe`, this command exits before
starting Vite/backend and points you to the local web launcher instead. That is
expected on non-admin company machines.

On Windows, Tauri needs the Visual Studio C++ build tools, Windows SDK, and a
Rust toolchain. If `npx tauri info` reports that MSVC or Rust is missing, run:

```powershell
npm run desktop:setup
```

Accept the Windows UAC prompt when it appears, then restart your terminal.
If Visual Studio Build Tools is already installed but `where.exe link` still
finds nothing, run the same setup command again. The setup script now repairs an
existing Build Tools install by adding the missing C++ workload. It also installs
`rustup` when `cargo` / `rustc` are not available yet.

Build the desktop shell:

```powershell
npm run desktop:build
```

During this phase, Tauri loads the Vite frontend from `5173` and the frontend
continues to call the local API on `18000`. The intended desktop packaging path
is to bundle and launch the same Node local backend as a Tauri sidecar, so web
and desktop modes keep one backend implementation. The current desktop shell now
auto-starts the bundled backend JavaScript with the packaged Node runtime when
`127.0.0.1:18000` is not already healthy. Rust commands remain a future option
for local filesystem operations, not the required near-term path.

On Windows, any backend process that the desktop shell starts itself is now tied
more tightly to the desktop app lifecycle and should stop when that desktop app
process exits.

Directly opening the packaged desktop executable should now start the backend
automatically on a clean Windows machine, without requiring Node.js to be
installed separately. Packaged backend startup logs are written under
`%LOCALAPPDATA%\Planvas\backend-runtime\logs\`.

## Release

GitHub Actions builds the Windows desktop installer when a `v*` tag is pushed.
The release version is manually maintained in one place:
`app.version.json`.

`npm run version:sync` copies that version into every file that needs release
metadata:

- `package.json`
- `frontend/package.json`
- `backend/package.json`
- `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` for the `planvas-desktop` package
- `backend/src/mcp.ts`
- `plugins/planvas-ai/gemini-extension.json`

`npm run version:check` verifies that those files still match
`app.version.json`. The GitHub release workflow runs the sync step and also
fails if the pushed tag does not match `v{app.version.json.version}`.

```powershell
npm run version:sync
npm run typecheck
npm run test --workspace frontend
npm run test --workspace backend
npm run build
git push origin main
git tag v0.1.8
git push origin v0.1.8
```

The release workflow creates a GitHub Release for the tag and uploads the NSIS
installer from `src-tauri/target/release/bundle/nsis/`.

## Project Home

The app now opens on a dedicated home page. From there you can:

- create a new `Project`
- open an existing `Project` folder with the Windows native folder picker
- refresh common projects to re-check whether registered paths still exist
- remove missing registered projects from the common project list
- save or update the local host name shown in the `host name: {name}` row
- copy this server's cloud publish URL for use from another Planvas instance

New projects are created under `<user_home>/.planvas/project_store/`. Opened
external folders are initialized as Planvas projects when needed, then registered
in `<user_home>/.planvas/project.json`. The home list shows `project_store`
projects first, then registered projects from other paths.
Opening the same folder again reuses the same project registration by canonical
filesystem path. Projects with the same display name remain separate when their
paths differ, and copied project folders with duplicated metadata ids are
assigned new Project, Page, board item, and connector ids instead of replacing
the original registration or resolving edits back to the source folder.
If the native folder picker is unavailable, the manual fallback accepts absolute
paths, `~` paths, and paths relative to `<user_home>`.

The local user profile is stored in `<user_home>/.planvas/user.json`. The user
name is used for the Home greeting and for the owner folder when publishing a
Project to a company-hosted Planvas server.

## Company Cloud Publish

Project Settings includes a `Publish` panel. Paste a publish URL copied from a
company-hosted Planvas Home screen, then click `Publish` to upload the selected
local Project as a one-way snapshot. The upload includes
`.pv_project/metadata.json`, Page semantic XML, Page presentation XML, and
project markdown notes.

On the cloud server, uploaded Projects are stored under
`<cloud_planvas_root>/project_store/<user_name>/<project_name>/`. The user and
Project folder names are filesystem-safe slugs. If a Project name already exists
inside the same user folder, the uploaded folder receives a serial suffix such
as `Roadmap_2` or `Roadmap_3`.

Cloud publish does not pull Projects back down, overwrite local Projects, merge
later changes, or provide collaborative editing.

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
- `<user_home>/.planvas/user.json`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/`
- `<user_home>/.planvas/project_store/<user_name>/<published_project_name>/.pv_project/` for Projects uploaded to a company cloud server
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

`metadata.json` stores only stable project-level settings and creation metadata;
it does not store volatile `updated_at`. Page lists are derived from the sibling
Page XML files, Project notes are derived from `.pv_project/*.md`, and each Page
XML root stores that Page's viewport fields.

Page XML uses the release-versioned Planvas layout. Each page is stored as a
semantic XML file and a presentation XML file. The semantic file stores board objects, frame
containment, table cell containment, markdown note references, canonical links,
and derived object connection indexes. AI and automation should read this file
plus referenced markdown files. The presentation file stores geometry, z-order,
collapsed state, styles, and visual routing data needed to restore the canvas.
The Page XML root `schema_version` is managed independently as an integer (`v1~n` format) and is set to `"5"`. Opening a legacy `schema_version="2"` page, a release-based schema like `"0.1.3"`, or older versions will migrate and rewrite them to the current version 5 schema.
Tables are written as pivot grids in the semantic file: the first row defines
the column axis, the first column defines the row axis, and each cell records
the pivot row / column refs it covers. This keeps merged Gantt-style cells
readable to AI tools even when visual divider lines are not aligned.
Per-segment divider offsets are not persisted for pivot-grid tables; cell
borders must align to the pivot axes so every cell belongs to a clear set of
rows and columns.

Markdown files placed directly in `.pv_project/` are treated as `note_paper`
notes. Creating or editing a `note_paper` still uses the normal app UI and API,
but the backend stores the markdown body in a sibling `.md` file; Page XML keeps
the semantic note reference plus the visual board placement. Select a
`note_paper` and use the right inspector's `Markdown file` field to rename the
backing `.md` file. The workspace sidebar lists those project notes and supports
dragging a note onto any Page row to add a placement that references the same
markdown file. The note list refreshes after markdown-backed notes are created,
renamed, updated, or deleted in the canvas. When the workspace regains focus or
the browser tab becomes visible, Planvas checks whether `.pv_project/*.md`
content differs from the current in-app note snapshot and marks the Notes
refresh button only when a real filename/title/body change exists. Routine Page
autosaves do not rewrite unchanged markdown bodies, so moving or resizing a
`note_paper` cannot overwrite an external `.md` edit. Deleting a note from a
Page removes only that board placement; the `.md` file remains in the Project
and stays in the left Notes list. The same note file can be placed multiple
times on one Page or across Pages, and every placement reads and writes the same
backing markdown file.

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
