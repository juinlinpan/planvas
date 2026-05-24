# Whiteboard Planning App Spec

## Desktop Runtime Update Notes

- The product roadmap is desktop-first for local personal planning, with a later optional team/server edition.
- Desktop runtime uses Tauri 2 as the shell for the existing React + TypeScript UI.
- The first Tauri desktop shell may launch the existing Vite frontend and Node local API in development to avoid regressing the current Planvas file storage behavior.
- The near-term desktop architecture keeps the Node local API as the shared backend for local web and desktop modes.
- The current desktop shell auto-starts the bundled Node backend JavaScript when the local API is not already healthy, while still relying on a locally installed `node.exe` runtime.
- On Windows, any Node backend process started by the desktop shell should be tied to the desktop app lifecycle so it exits when the desktop process closes.
- The intended packaged desktop path is to launch the Node local API as a Tauri sidecar so the desktop executable starts its backend automatically.
- Moving local filesystem operations from the Node HTTP API into Tauri Rust commands is a later option, not a required desktop MVP step.
- The frontend must not spread `.planvas`, `.pv_project`, folder picker, or reveal-folder assumptions through canvas/UI components; local filesystem details belong behind an API adapter.
- The future team/server edition should use the shared React UI and data contract, but its backend is separate server infrastructure with HTTP/WebSocket APIs, permissions, team workspaces, and collaborative sync.
- Server/team project creation and permission logic is intentionally out of scope for the desktop MVP.

## Persistence Update Notes

- The project no longer uses SQLite as the canonical persistence layer.
- The backend must store project data as files under a Planvas root.
- The default Planvas root is `<user_home>/.planvas/`.
- The Planvas root must contain `project.json`, an index of common project paths.
- The Planvas root must contain `project_store/`; newly created projects are stored as `<user_home>/.planvas/project_store/<project_name>/`.
- A `Project` is a working directory that may live either under `project_store/` or at an external user-selected path.
- Each Project directory must contain `.pv_project/` as a Planvas data directory.
- Project metadata must live at `.pv_project/metadata.json`.
- `.pv_project/metadata.json` must store only project-level settings and timestamps; it must not persist page lists, note lists, or per-page viewport state.
- Each Page must be stored as two XML files inside `.pv_project/`: `<page_name>.semantic.xml` and `<page_name>.presentation.xml`.
- Page discovery must come from the `.pv_project/` XML files, and Project note discovery must come from `.pv_project/*.md`.
- Renaming a Page must also rename its sibling XML files to match the new Page name, while preserving the Page id and board content.
- Page XML v2 must separate AI-readable semantic data from visual presentation data at the file level.
- Page XML v2 semantic files must describe the information inside the board and the relationships between board objects.
- Page XML v2 presentation files must describe geometry, z-order, color, patterns, shape styling, and connector routing.
- Page-level viewport fields such as `viewport_x`, `viewport_y`, and `zoom` must be stored on the Page XML root attributes rather than in `.pv_project/metadata.json`.
- AI and automation workflows, including Jira ticket creation, should be able to read page meaning from the semantic file plus referenced markdown files without reading presentation data.
- Page XML v2 semantic objects are grouped as `large_object`, `small_object`, `sticky_object`, and `link`.
- `frame` and `table` are `large_object` types.
- `text_box` and `note_paper` are `small_object` types.
- `sticky_note` is a standalone `sticky_object` type. It is not a `small_object` or `large_object` and must not be contained by frames or tables.
- `line` and `arrow` are `link` types only when they express a relationship; purely decorative lines may remain presentation-only.
- `frame` can contain `small_object` children directly through semantic containment.
- `table` is a `large_object`, but each `table_cell` is the semantic container that can contain `small_object` children.
- Semantic links are the canonical source of truth for object-to-object relationships.
- Object-level `connections` entries may exist as AI-friendly indexes, but they must be generated from or validated against canonical semantic links.
- Markdown files placed directly under `.pv_project/` are project note files and must be represented as `note_paper` notes by the system.
- `note_paper` body content must be stored in `.md` files under `.pv_project/`; Page XML stores only the board item placement and a markdown file reference.
- Creating a `note_paper` on a Page must create a corresponding `.md` file under `.pv_project/`.
- The workspace left sidebar must include a Notes box listing all `.pv_project/*.md` project notes by filename.
- Dragging a note from the left Notes box onto any Page row must create a `note_paper` placement on that Page referencing the same `.md` file.
- The left sidebar Pages and Notes boxes must be individually expandable/collapsible. When expanded, each box grows downward but must not exceed half of the available vertical sidebar space; excess entries scroll inside that box.
- The existing HTTP API may stay stable while the repository implementation reads and writes `.pv_project/metadata.json` and Page XML files.
- Opening an external Project path must initialize missing `.pv_project/` / `.pv_project/metadata.json` files when the path is new, and must only add the path to `project.json` when the path is already a Planvas project.
- Project listing must refresh path existence and sort `project_store/` projects before other registered paths.

## Navigation Update Notes

- The workspace left page sidebar and right inspector must both support collapse / expand toggles while keeping a visible restore handle.
- Opening a `Project` from the dedicated home screen must create a browser history entry, enter the workspace, and load the Project's Pages list without opening any Page by default.
- The home screen left action area must show `Create Project` and `Open Project`; the previous project JSON import action is removed from the home screen.
- `Create Project` should open an app modal for project naming instead of using a browser prompt.
- `Open Project` should use the Windows native folder picker when available and fall back to manual path entry only if the picker is unavailable; manual paths may be absolute, `~`-based, or relative to `<user_home>`.
- `Open Project` must identify already-opened projects by canonical filesystem path, not by Project name. Opening the same path again must reuse the same Project registration.
- If two different Project paths have the same Project name, they must remain separate Common Projects.
- If a copied Project folder has duplicated metadata ids, opening the copied path must assign that path a new Project id instead of replacing the original path's registration.
- The home screen project list is `Common Projects`: first projects under `project_store/`, then registered projects from other paths.
- The home screen must provide `Refresh` to re-check whether registered project paths still exist.
- After Refresh marks a registered project path as missing, the home screen must provide a remove button that deletes only the `project.json` entry.
- Entering a Project from the home screen must not keep or auto-open any previous Page selection; no Page should be selected until the user chooses one or the URL explicitly names one.
- Entering a Project workspace from the home screen must refresh that Project's Pages and Notes from disk even when it is the same Project id that was previously selected.
- The workspace left sidebar should stay focused on page navigation and should not render a project details panel.
- The workspace sidebar header should show a top row with `Planvas` and `Home`, then a divided project summary row with `Project`, the current project name, and a settings icon button.
- Project settings should open from that sidebar header settings button in a modal that uses about 70% of the viewport width on desktop.
- All project-level controls should live in that settings modal: project rename, theme color, export, and delete.
- Basic page name editing should happen inline from a pencil icon beside each page in the left page list.
- Page delete action should stay beside each page in the left page list, using a refreshed icon treatment instead of the previous trash shape.
- Project delete action should be shown under the project name controls and must open a confirmation dialog that requires typing `delete {project_name}` before deletion; after deletion the app returns to the home screen.
- Project management should include a `Change theme color` dropdown above `Delete project`; the selected theme is stored on the project and changes non-canvas workspace chrome so users can visually distinguish projects.
- The workspace should no longer render an inline `Manage` panel in the left sidebar once those controls move into the project settings modal.
- Canceling a browser file picker during Project or Page export should be treated as a normal cancellation and must not show an error banner.
- The left sidebar should render page rename and delete action buttons beside each page row, while duplicate remains out of the sidebar.
- The workspace `Home` button belongs in the sidebar header, positioned to the right of the `Planvas` title.
- Clicking `嚗??啣? Page` should create a new page immediately with auto-generated name `untitled_n` (no prompt dialog).

## Toolbar Menu Update Notes

- The top toolbar should follow an Office-like menu pattern where `檔案` and `編輯` open dropdown menus after clicking the menu name.
- `檔案` dropdown should contain `import` and `export` entries instead of direct always-visible buttons.
- `export` should open a right-side submenu on hover so future formats can be extended without changing menu hierarchy.
- The `export` submenu should be planned around multiple targets: existing `JSON`, quick-share `PNG`, presentation-oriented `PPTX`, and a read-only `Viewer` deliverable.
- New export targets should reuse a shared snapshot source so format-specific output does not diverge from the persisted page / project model.
- Canvas utility controls must live in the expandable canvas header ribbon, not in a separate right-upper floating strip.
- The expanded header ribbon groups `檔案`, `編輯`, and `檢視`; `檢視` contains `magnet`, `zoom`, and `格線` controls.
- The draggable toolbar should keep tool shortcuts only (selection and item creation tools), while non-tool utility controls move to the expandable canvas header ribbon.

## Zoom And Grid Update Notes

- The left workspace page list must reflect the active page zoom immediately while the user changes zoom in the canvas.
- The toolbar must expose a zoom utility cluster with `-`, `+`, a current zoom readout in `x.x` format, and a `1.0x` reset action.
- The zoom reset action defaults to `1.0x`, and a compact adjacent control must let the user adjust the reset target in `0.1x` increments such as `0.5x` or `1.5x`.
- `magnet` should be enabled by default when the canvas loads.
- `magnet` snaps item edges to the background grid lines while moving or resizing.
- When `magnet` is enabled, newly created items and freeform `line` / `arrow` points should also snap to the background grid unless they attach to an item anchor.
- Holding `Alt` while moving or resizing should temporarily pause `magnet`.
- Canvas should render clearly visible `X=0` and `Y=0` zero-axis guide lines above the background layer.

## Item Content Display Update Notes

- `note_paper` read mode should not show a dedicated `Markdown` badge above the content.
- When a `text_box` becomes too small to show all text, it should keep showing as much text as fits without introducing a scrollbar.
- When a `note_paper` becomes too small to show all markdown content, the body area should scroll instead of clipping the whole note.
- When a `note_paper` has very limited space, the read view should prioritize the first Markdown `#` heading before showing lower-priority body blocks.
- On the Page, `note_paper` must let the user toggle between expanded markdown content and a title-only view that shows just the first Markdown `#` heading, or the first non-empty line when no H1 exists.
- `note_paper` content is markdown-file-backed: the frontend may continue using the API `content` field, but persistence must write the markdown body to `.pv_project/<note>.md` and reload the API `content` field from that file.
- The right inspector must let users edit the `.md` filename for a selected `note_paper`; changing it renames the markdown backing file and updates the Page XML reference.
- Project notes are reusable across Pages: placing a note from the left Notes box creates another board item placement that references the selected markdown file instead of duplicating note text into Page XML.
- The Notes box must refresh after markdown-backed notes are created, renamed, updated, or deleted through the canvas or inspector so it reflects the Project's current note files.
- When the user returns focus to the workspace or the browser tab becomes visible again, the frontend must refresh `.pv_project/*.md` project notes from disk and update visible `note_paper` placements that reference those files.
- External `.md` file refresh must not overwrite an actively edited in-app note draft.
- Deleting a `note_paper` from a Page deletes only that Page placement. It must not delete the backing `.md` file or remove the note from the left Notes box.
- The same `.md` note may appear multiple times on the same Page and on multiple Pages. All placements share the same backing file, so content or filename changes update every placement that references that note.

## Table And Small-Item Sizing Update Notes

- `table` must support up to `20 x 20` cells.
- `table` edge controls must allow adding a row above or below the current table, and adding a column to the left or right of the current table.
- Adding a `table` row or column from an outer edge must grow the table outward in that direction while preserving the existing cells' pixel sizes and positions.
- Deleting a `table` row or column must remove that row or column, delete any `small_item` children contained by the removed cells, and close the remaining cells together.
- When a `table` changes size or row / column structure, surviving `small_item` children must follow their containing cell through the table cell layout, not keep absolute canvas positions.
- Every `table` cell must stay at least as large as the minimum `text_box` size.
- Clicking the toolbar `table` tool opens a fixed-origin table insertion preview that expands away from the toolbar dock: down-right for top/left toolbars, up-right for bottom toolbars, and down-left for right toolbars. Clicking the `table` tool again cancels the pending table insertion.
- The minimum `text_box`, `sticky_note`, and `table` cell size should be `48 x 48`, matching two default text line-heights while staying aligned to the canvas grid.
- Every board item minimum size, including `line`, `arrow`, and dynamic `table` minimum sizes, must stay aligned to whole canvas grid units.
- When `magnet` is enabled, dragging internal `table` row and column divider lines must snap those divider lines to the canvas grid. Holding `Alt` temporarily disables this table-divider snapping.

## Item Context Menu Update Notes

- After left-clicking to select a board item, right-clicking that item must open an item context menu.
- The item context menu must provide basic item actions: `cut`, `copy`, `paste`, and `delete`.
- Item z-order actions should be provided in the item context menu: `move forward`, `move backward`, `bring to front`, and `send to back`.
- The right inspector should no longer render dedicated z-order action buttons.
- Right-clicking an unselected item may first move selection onto that item, then open the same item context menu.
- Right-clicking empty canvas space should keep a lighter canvas context menu that exposes `paste` only.
- Context-menu actions must stay aligned with the existing keyboard shortcuts so both entry points trigger the same behavior.

## Inspector Tab Update Notes

- The right inspector must expose two top-level tabs: `樣式` and `文字`.
- The `樣式` tab contains object-level controls such as position, size, object/background/line colors, item text content, table cell text content, markdown filename, frame collapse controls, and table item layout.
- The `文字` tab contains typography controls such as font size, bold/italic text style, text alignment, table label font size, table cell text alignment, and line/arrow label placement.
- Line and arrow label text content belongs in `樣式`; label font size and label placement belong in `文字`.
- Table cell fill/text colors and cell text content belong in `樣式`; table/cell typography and text alignment belong in `文字`.

## Line Text Update Notes

- `line` supports an optional text label stored in the board item `content` field.
- Double-clicking a `line` enters inline text editing for that label.
- The right inspector must let users place `line` text at front, center, or back along the line.
- The right inspector must let users place `line` text above, middle, or below the line.
- The right inspector must let users choose whether `line` text stays horizontal or follows the line slope.
- `line` text editing and all text-related settings must be grouped together in the inspector.
- `line` text background defaults to transparent and can be changed from the inspector.
- `line` text size and text color can be changed from the inspector.
- `arrow` head size defaults to a compact `14px` so labels and nearby board content remain readable.
- The inspector commits `arrow` head size edits after the user finishes the field instead of clamping every intermediate keystroke.
- Legacy connector-arrow placements must be migrated into segment-arrow geometry on load; the frontend should not keep a separate legacy arrow renderer.

## Frame Exit Interaction Update Notes

- Dragging a `small_item` fully outside its parent `frame` must detach it from the frame while preserving the user's dropped canvas position.
- Dragging a `small_item` only partially out of its parent `frame` may use the frame eject behavior to place it just outside the nearest frame edge.

## Table Text Layout And Inspector Update Notes

- `table` 支援儲存格文字水平對齊（左 / 中 / 右）與垂直對齊（上 / 中 / 下）設定；預設為水平置中、垂直置中；Inspector 顯示對應的對齊、字型大小與文字顏色控制項。
- 在 Inspector 選取整張 `table` 並調整文字樣式時，表格內所有儲存格文字必須立即套用相同字型大小、文字顏色、粗體與斜體；表格儲存格內嵌的 `small_item` 也必須同步套用這些文字樣式。
- `text_box` 支援文字水平對齊（左 / 中 / 右）與垂直對齊（上 / 中 / 下）設定；預設為水平置中、垂直置中。
- `note_paper` 內文以 Markdown 儲存；Inspector 顯示尺寸控制；在 Page 上可切換展開全文或只顯示第一個 Markdown H1 標題；在 `frame` 縮回時只顯示第一個 Markdown H1 標題。
- 在 Inspector 中選取 `table` 時，應顯示「列 × 欄」尺寸標籤與新增/刪除列欄的操作按鈕；點擊表格儲存格文字區域時進入 inline 編輯模式，不透過 Inspector 面板介入文字輸入。
- 在 Inspector 中選取 `table` 時，應顯示 optional「名子」欄位；輸入後才在表格左上方顯示小標籤，未輸入或舊 Page 缺少 `name` 時不顯示。
- `table` 名稱標籤支援獨立字級設定；使用者可在 Inspector 調整標籤字級，也可在 Page 上雙擊標籤進行現場編輯。
- `table` 的新增 row / col 邊緣按鈕必須保持容易點擊，控制層不得被表格內容裁切。

## Minimap And New-Page Viewport Update Notes

- Canvas 應在角落顯示 mini map；使用者可點擊 mini map 上任意位置以跳轉至對應畫布區域。
- Mini map 應顯示當前 viewport 的位置框，使用者可拖曳 viewport 框來平移畫布。
- Mini map 應能正確顯示已縮回的 `frame` 物件之代表內容，不得因縮回狀態顯示錯誤範圍。
- 切換到 Page 時，若 Page 有既有物件，初始 viewport 應設定為讓所有物件適合在 80% 的畫布可見範圍內；若 Page 為空，使用預設縮放。

## Cross-Page Copy and Paste Update Notes

- Clipboard data must be stored in `window.localStorage` (or memory fallback if `window.localStorage` is unavailable) to allow copy-pasting of whiteboard items across different pages (and different projects).
- Clipboard entries store the original item IDs and the full payloads of the selected items (retaining hierarchy like parent frame IDs).
- When pasting, the paste count is incremented, and items are offset on the target page based on the paste count to avoid visual overlap.
- When copying new items, the paste count is reset to 0.
- When copy-pasting objects, any parent-child frame containment relationships between the copied objects must be preserved by mapping parent IDs to their newly pasted equivalent IDs.

## 1. 專案背景

這是一個為了替代公司無法採購的商業軟體而自行開發的本機優先白板工具。

主要使用情境：

- brainstorming
- sprint 工作分配
- roadmap 規劃
- 專案頁面式整理

產品方向是 local-first，重點在單人規劃效率，而不是第一版就做多人協作平台。

## 2. 技術架構

### Frontend

採用 **React + TypeScript**。

原因：

- Canvas、drag-drop、multi-select 等複雜互動需要 React 元件化渲染 UI
- TypeScript 保證嚴格型別與 API 合約一致性

### Backend

採用 **TypeScript + Node.js**。

原因：

- TypeScript 讓 backend 與 frontend 共用型別定義與 API 合約
- Node.js 適合提供輕量 HTTP API 並直接存取本機檔案系統

### Persistence

採用 **Planvas file storage**。

原因：

- 適合 local-first 的使用情境
- 不依賴資料庫
- 適合 MVP 優先的實作方式

## 3. 範圍

### In Scope

- Project 管理
- 每個 Project 下支援多個 Page 的白板功能
- Page 的新增、讀取、更新、刪除
- Board item 的新增、讀取、更新、刪除
- 多種白板物件工具
- Planvas file storage 持久化
- 持久化測試與冒煙測試

### Out of Scope

- 多人協作
- 權限控管
- 雲端同步
- 行動裝置支援
- 外掛系統

## 4. 資料模型

### 4.1 基本架構

- 一個 App 可以開啟多個 `Project`
- 一個 `Project` 底下有多個 `Page`
- 一個 `Page` 底下有多個白板物件

### 4.2 白板物件分類

#### `shape`

- `line`
- `table`

#### `small_item`

- `text_box`
- `note_paper`

#### `sticky_item`

- `sticky_note`

#### `large_item`

- `frame`

#### `connector`

- `arrow`

## 5. 功能規格

### 5.1 Project

每個 Project 支援的操作：

- 顯示首頁清單並開啟
- 開啟外部 Project 資料夾
- 建立 Project
- 匯出 JSON 快照
- 重新命名 Project
- 刪除 Project
- 切換 Project 主題色彩
- 匯出 Project 為 viewer 靜態頁面
- 開啟 Project 設定

Project 資料欄位：

- `id`
- `name`
- `theme_color`
- `default_style_json`
- `created_at`
- `updated_at`
- `sort_order`

Project theme color rules:

- `theme_color` defaults to `default`.
- Supported values are `default`, `sage`, `sunset`, and `ocean`.
- The theme applies to workspace chrome outside the canvas, including the sidebar, workspace header, toolbar, and inspector surfaces.
- Canvas content, canvas item styling, and canvas grid/background controls remain independent from project theme color.

Project default item style rules:

- `default_style_json` stores Project-level defaults for canvas item styling. Missing or empty values use app defaults.
- Project settings must let users change defaults for all object text color, small-object fill color, large-object fill color, link stroke color, and link text color.
- `text_box` and `note_paper` use the small-object fill default when the item has no item-level fill override. `sticky_note` keeps its own sticky color default when it has no item-level fill override.
- `frame` and `table` use the large-object fill default when the item has no item-level fill override.
- `line` and `arrow` use the link stroke default and link text default when the item has no item-level style override.
- Item-level style settings remain more specific than Project defaults; clearing an item style returns that item to the Project defaults.

Project 匯出備註：

- 支援匯出所有 Page 為 JSON 快照。
- JSON 匯出包含完整的 Project JSON 備份，匯入時可建立新 Project。
- 匯入後的 Page、board item、connector 均取得新的 id，不沿用 Planvas file storage 的舊有 id。

Project 匯出 / 靜態頁面備註：

- viewer 靜態頁面包含 Project 的所有 Page 及其物件的唯讀快照。
- viewer 不依賴原始 whiteboard app 的 backend，不需要 server；頁面載入時直接讀取嵌入的快照。
- viewer 封裝為 self-contained snapshot；資料不依賴外部服務，不同步即時更新。
- viewer 支援基本互動：page pan / zoom、frame 展開收折、捲動文字，但不提供編輯與拖拽。
- viewer 必須能在 `file://` 協議下直接開啟，不需要額外 server。

### 5.2 Page

每個 Project 可建立多個 Page：

- 建立 Page
- 重新命名 Page
- 刪除 Page
- 複製 Page
- 匯出單一 Page 為 JSON 快照
- 匯出單一 Page 為 PNG
- 匯出單一 Page 為 PPTX
- 從 JSON 匯入 Page 物件，建立新 Page；保留 Page 內物件的相對位置
- 切換 Page 時更新 viewport
- 開啟 Page

Page 資料欄位：

- `id`
- `project_id`
- `name`
- `viewport_x`
- `viewport_y`
- `zoom`
- `created_at`
- `updated_at`
- `sort_order`

Page 匯出備註：

- JSON 匯出包含 `board_items[].parent_item_id` 以描述物件父子關係及 `item_hierarchy`；children 均已展開序列化。
- `item_hierarchy` 比 `parent_item_id` 更易讓 MCP / agent 解析物件樹狀結構。
- PNG 匯出必須可見度良好，不受瀏覽器截圖尺寸限制。
- PNG 匯出僅包含實際有物件的範圍，不包含過多空白。
- PPTX 匯出應讓每個 Page 對應一個 slide；盡量保留 Page 的視覺版面與物件相對位置。
- PPTX 匯出應盡量向量化；`table` 使用 PowerPoint 原生表格；`frame` 使用分組矩形加標題欄；其餘物件使用向量幾何或文字方塊。
- PPTX 匯出不保證 100% 精確還原每個樣式，但需保留足夠辨識度。
- 任何白板物件在 PPTX 無法向量化時，以 item-level rasterized snapshot 作為 fallback；系統應盡量避免 fallback 的觸發。
- PNG、PPTX、viewer 匯出均使用統一的快照來源，確保各格式不因來源差異而偏離持久化的 page / Project 模型。

### 5.3 白板互動

每個 Page 上的互動：

- 物件建立、移動、resize
- z-index 管理
- 多選
- 右鍵選單
- Undo / Redo
- 磁鐵對齊
- 選取後可針對 7 種操作開啟物件相關選單（在合理位置浮出）
- 複選後可一次操作的選單以交集行為為準

### 5.4 白板物件清單

白板上可放置的物件：

- `line`
- `table`
- `text_box`
- `sticky_note`
- `note_paper`
- `frame`
- `arrow`

### 5.5 `line`

- `line` / `arrow` 共用 freeform segment 機制；端點可附著 connector anchor；純裝飾線可不附著任何 connector，拖曳端點時沿 freeform 路徑延伸。
- 若已連接 connector anchor，`line` 端點可拖離而自動 detach；保留 freeform segment 的手動操控。
- `line` 可設定顏色、線寬、線段樣式（實線、虛線、點線）等屬性；角落樣式可選直角或圓角；Inspector 顯示對應的樣式控制項。
- `line` 支援文字標籤；標籤文字支援即時編輯，連線的方向不影響標籤判讀方向。
- 連線路徑中間可設置中繼 segment 點，依序連接各段端點。
- 文字標籤位置可在路徑中央附近。
- 支援路徑手動彎折。

### 5.6 `table`

- 建立時先以 `1 × 1` 的最小尺寸起始，拖曳後擴充至指定的 `n × m`；建立後仍可新增 / 移除列欄。
- 支援的 connector anchor 位置同其他物件。
- 資料結構：`TableData`，包含 `colWidths`（每欄寬度陣列）、`rowHeights`（每列高度陣列）、`cells`（`TableCellData | null` 二維陣列）。
- 支援儲存格 `rowSpan` / `colSpan`，合併儲存格時相應縮減獨立儲存格。
- 支援儲存格內嵌入 `small_item`（`embed` 物件，帶 type / content / styleJson）。
- 表格的欄寬列高以絕對像素計算，不依賴 zoom；儲存格數值為視覺像素大小。
- 表格支援列欄操作按鈕，滑鼠懸停時顯示 `+` 按鈕以新增 row 或 col。
- 表格支援 optional `name` 欄位；預設不設定名稱，既有 Page 的 `table` 若沒有 `name` 必須照常載入且不顯示額外標籤。
- 當使用者在 Inspector 的「名子」欄位輸入文字時，表格左上方顯示一個小標籤；清空或缺少 `name` 時不顯示標籤。
- 表格名稱標籤支援 optional `labelFontSize` 欄位；缺少時使用預設標籤字級；雙擊既有標籤可在 Page 上 inline 編輯名稱。
- 新增 row / col 的 `+` 按鈕必須有足夠點擊範圍，不得因位於表格邊界外而被裁切到難以點擊。
- 支援儲存格文字編輯。
- 儲存格合併操作在拖選多格後於右鍵選單呈現，系統計算合理的 `rowSpan` / `colSpan` > 1。
- 合併後的儲存格顯示合併前各格的文字拼接 / 空格分隔。
- 新增欄列時，預設儲存格的 `embed` 為空。
- 表格支援列欄刪除操作。
- Inspector 顯示選中的 row/col 的 resize 控制以及對應的文字樣式選項。
- 儲存格支援嵌入 `small_item`：`text_box`、`note_paper`；不支援嵌入 `sticky_note` 或 `frame`；物件必須透過 `embed` 機制存在，不可以 item 形式直接嵌入。
- 儲存格內多個 `small_item` 的排列方向可設定為上下分或左右分；預設為上下分。`table` 可設定整張表格的預設格內排列方向，每個儲存格也可單獨設定；當表格層級與儲存格層級都有設定時，以較晚設定者為有效設定。
- 欄列 resize 時，若儲存格內有 `small_item` 物件，儲存格邊界隨之調整；`small_item` 的相對位置不超出 cell bounds 的情況下會隨之平移。
- 已嵌入物件可以選取、拖拽或刪除；拖出 table 範圍後，物件脫離 embed 獨立存在於畫布上。
- 資料序列化時，以 `string[][]` 格式輸出文字內容，供快速存取。
- Inspector 顯示目前選取的儲存格之文字對齊與樣式；在鎖定模式下不顯示 inline 操作。
- **欄寬列高的記憶機制**：系統必須在新增欄列、resize 時同步更新分隔線位置，不依賴 CSS 自動計算。
- 分隔線機制：系統使用整數索引位置表記錄每條分隔線的絕對位置（像素值）；`colDividerBreaks` / `rowDividerBreaks` 記錄合併儲存格邊界，供合併時跳過部分分隔線使用。
- table 的欄列數計算必須準確，不可因儲存格合併而誤算數量或錯誤渲染邊框。
- table 的選取行為有多層級：選取整個 table、選取某行 / 列、選取某儲存格；Inspector 顯示對應層級的操作。
- 選取 table 儲存格時，按 `Delete` / `Backspace` 或使用右鍵選單的刪除必須依選取範圍執行：若選取範圍完整覆蓋一或多個 row，刪除該 row；若完整覆蓋一或多個 column，刪除該 column；若只選取零散儲存格，則只清除已選取儲存格的內容與內嵌項目，不刪除整個 table 物件。刪除 row / column 後，未刪除儲存格的像素大小必須維持不變，table 總高度或總寬度縮減；刪除中間 row / column 後，相鄰的上下 row 或左右 column 必須接合。

### 5.7 `text_box`

- 支援的 connector anchor 位置同其他物件。
- 支援即時 inline 文字編輯。
- 可在 `frame` 內顯示完整文字。

### 5.8 `sticky_note`

- 支援的 connector anchor 位置同其他物件。
- 支援即時 inline 文字編輯（字元數受限）。
- 支援文字樣式設定，包含文字顏色、字級、粗體、斜體與對齊設定。
- `sticky_note` 是獨立便利貼物件，不屬於 `small_item` 或 `large_item`。
- `sticky_note` 不可被 `frame` 或 `table` 容納，亦不參與 `frame` 縮回摘要。
- 新建 `sticky_note` 預設放在目前最前一層圖層。
- `sticky_note` 視覺樣式需在右上角顯示三角形摺痕。

### 5.9 `note_paper`

- 內文格式為 Markdown。
- 顯示模式切換：檢視模式以 Markdown 渲染；編輯模式開啟原始文字編輯器。
- 在 `frame` 縮回時只顯示第一個 Markdown H1 標題。

### 5.10 `frame`

- 支援的 connector anchor 位置同其他物件，支援 resize。
- 可包含 `small_item` 物件。
- 支援展開 / 縮回。
- 縮回時 `small_item` 以縮圖或摘要顯示。
- 展開後可顯示所有物件的完整內容。
- 縮回時不可拖出 `frame` 的 `small_item`。
- 若物件與 `frame` 重疊面積超過 25%，物件即自動被 `frame` 吸附；物件進入 frame 時進入 focus mode。
- 在 focus mode 中可滾動顯示，切換出當前 `frame`。
- 跨 frame 拖拽物件時，若拖放位置距離另一個 `frame` 中心在 60% 範圍內，判定為進入該 `frame`。
- 物件從 `frame` 外面進入時，只要拖入邊界即觸發。
- 捲動時若 `small_item` 的中心點在某個 `frame` 範圍之外，判定為離開 `frame`；離開後物件移至 `frame` 邊界之外並脫離。
- `frame` 縮回時，拖入的物件會等 `frame` 展開後再合理顯示。
- 跨 frame 拖拽物件時，若物件處於另一 `frame` 的邊緣，應顯示輔助提示線，說明物件的 `frame` 歸屬。
- 物件從 `frame` 外往 `frame` 拖入時，若在邊緣懸停，`frame` 應展開顯示內容。

### 5.11 `arrow`

- 若已連接 connector anchor，`arrow` 端點可拖離而自動 detach；保留 freeform segment 的手動操控；legacy connector arrow 不再另行渲染。
- `arrow` 同樣共用 freeform segment 機制；端點方向可設定箭頭樣式（雙向、單向、無箭頭）；支援折線、曲線等路由模式。
- `arrow` 支援文字標籤；標籤文字支援即時編輯，連線的方向不影響標籤判讀方向。
- 連線路徑中間可設置中繼 segment 點，依序連接各段端點。

### 5.12 磁鐵對齊

白板應有磁鐵對齊功能：

- 物件邊緣的吸附
- 物件與 `frame` 邊緣的對齊
- 顯示對齊輔助線
- 對齊精準度設定
- 關閉 `magnet` 時物件自由移動不吸附
- 按住 `Alt` 鍵可臨時停用 `magnet`

### 5.13 Connector Anchor（連接點）

適用於 `line` 與 `arrow` 的連接點規則：

- 拖曳端點靠近其他物件時，自動顯示可連接的 anchor 點。
- 可連接的物件類型：`text_box`、`sticky_note`、`note_paper`、`frame`、`table`。
- `line` / `arrow` 端點可吸附至任一物件的 connector anchor。
- 吸附範圍約 24px。
- Anchor 方向分為：`top`、`right`、`bottom`、`left`。
- 連線端點的吸附資料儲存在 segment 的 `data_json` 中：`{ itemId: string, anchor: string }`。
- 移動已連接的物件時，相連 segment 端點自動跟隨移動。

## 6. 實作計畫

建議實作順序：

1. 先顯示首頁讓使用者建立 / 開啟 Project
2. 開啟既有的 Project；支援建立 / 匯出快照 Project
3. 切換 Project 後建立一個預設的第一個 Page
4. 在 Page 上建立 `frame`、`note`、`table`、`arrow`
5. 儲存到資料庫
6. 儲存到 Planvas file storage

## 7. UX 注意事項

- 首頁載入完成後立即顯示 Project 清單，不依賴非必要的 API 延遲
- 切換 Project / Page 時保持畫面穩定，避免閃爍或版面位移
- 不保留過多彈窗層級
- 錯誤訊息簡潔並告知修正方向
- 鍵盤快捷鍵：`Delete`、`Ctrl/Cmd + C`、`Ctrl/Cmd + X`、`Ctrl/Cmd + V`、`Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`
- 白板物件選取時，滑鼠懸停應在合理位置顯示「移動」、「縮放」、「刪除」、「旋轉」等輔助 handle，不遮蓋物件內容本身
- 白板背景應跟隨瀏覽器視窗尺寸調整，不出現不必要的滾動條
- 白板右鍵選單應清晰展示「新增」與「貼上」兩個主要操作

## 8. 資料結構

### 8.1 `projects`

- `id`
- `name`
- `theme_color`
- `default_style_json`
- `sort_order`
- `created_at`
- `updated_at`

### 8.2 `pages`

- `id`
- `project_id`
- `name`
- `sort_order`
- `viewport_x`
- `viewport_y`
- `zoom`
- `created_at`
- `updated_at`

### 8.3 `board_items`

- `id`
- `page_id`
- `parent_item_id`
- `category`
- `type`
- `title`
- `content`
- `content_format`
- For `note_paper`, `content` is an API/runtime field only. Page XML must not persist the markdown body in `<content>`; it must store the markdown filename in `data_json.noteFile` and read/write the body from `.pv_project/*.md`.
- Project-level note lists are derived from `.pv_project/*.md` and exposed through `GET /projects/{project_id}/notes`.
- Page XML may contain multiple `note_paper` placements referencing the same `data_json.noteFile`; the markdown file is the single source of truth.
- `x`
- `y`
- `width`
- `height`
- `rotation`
- `z_index`
- `is_collapsed`
- `style_json`
- `data_json`
- `created_at`
- `updated_at`

備註：

- `parent_item_id` 用於描述物件的父子關係，通常代表 `frame` 的 child item。
- `line` 與 `arrow` 的連接 / 起訖資料存在 `data_json`。
- `x`、`y`、`width`、`height` 為視覺像素座標與尺寸。

### 8.4 `connector_links`

- `id`
- `connector_item_id`
- `from_item_id`
- `to_item_id`
- `from_anchor`
- `to_anchor`

`connector_links` 是線段物件的端點連接資料；目前的 MVP 中，`arrow` 與 `line` 以 `data_json` 的 `startConnection` / `endConnection` 欄位記錄端點連接，此表為後續強化 API 的備用架構。

## 9. 系統架構

### 9.1 模組

- `frontend-web-ui`: React + TypeScript + Vite
- `backend-service`: TypeScript Node.js
- `persistence`: Planvas project directory, `.pv_project/metadata.json`, and Page XML files

### 9.2 開發伺服器位址

- Frontend dev server: `http://127.0.0.1:5173`
- Backend dev server: `http://127.0.0.1:18000`
- Health endpoint: `GET http://127.0.0.1:18000/healthz`
- Source checkout launch command: `planvas` starts the unbuilt source-mode frontend and backend after dependencies are installed.

### 9.3 模組職責分工

Frontend：

- 白板 UI
- drag / resize / select / magnet
- Project / Page 管理
- API 資料綁定與同步

Backend：

- Project / Page CRUD
- board item CRUD
- connector CRUD
- Page board state replace API（Undo / Redo 所使用）
- Planvas file storage 實作
- 靜態頁面匯出處理

## 10. 目錄結構

以下為本專案各目錄用途說明；backend 目錄結構不包含 Planvas project 的資料。

### 10.1 Backend Root

後端根目錄為 `backend/`。Backend root remains responsible for logs; Planvas project files live under `<user_home>/.planvas/` unless `WHITEBOARD_PLANVAS_ROOT` overrides it.

### 10.2 Planvas file storage 目錄結構

Planvas file storage 預設根目錄：

`<user_home>/.planvas/`

新建 Project 預設儲存在：

`<user_home>/.planvas/project_store/<project_name>/`

外部開啟的 Project 可位於使用者選定路徑，但仍必須包含 `.pv_project/` 資料目錄。

### 10.3 Log 目錄結構

Log 儲存路徑：

- `<backend_root>/logs/app.log`
- `<backend_root>/logs/backend.log`

## 11. 效能需求

- App 啟動應在 5 秒以內完成初始載入
- 300 個白板物件的 Page 不應有明顯卡頓
- 所有操作在啟用自動儲存時應自動防抖存檔至 Planvas file storage，或支援手動儲存存檔
- 儲存操作不應阻塞 UI 渲染
- Backend must log slow HTTP requests, event loop lag, uncaught exceptions, and unhandled promise rejections to `<backend_root>/logs/app.log` so local performance stalls and crashes can be diagnosed after the fact.
- Frontend write paths that update multiple board items as one user action should prefer one `PUT /pages/{page_id}/board-state` persistence call over parallel per-item `PATCH /board-items/{id}` calls, because each per-item write rewrites the Page XML files.
- Creating board items should update the canvas optimistically before the backend persistence round trip completes. If persistence fails, the temporary item is removed and the error is logged.
- Autosave can be toggled on/off via a dedicated button next to `magnet` in the Canvas Ribbon. The autosave preference is persisted in `localStorage`. When enabled, item and viewport updates are debounced and saved in a single bulk write rather than high-frequency individual requests.
- The frontend should keep a per-Page in-memory board cache after the first successful `GET /pages/{page_id}/board-data`; switching back to a cached Page should restore from memory instead of re-fetching board data unless the Page is explicitly refreshed or invalidated.
- Canvas item, connector, and viewport state changes must update the per-Page in-memory cache immediately so Page switching preserves the latest local working state while debounced persistence is still pending.
- Pending viewport autosave must flush when the Canvas unmounts for Page switches or view changes, rather than only canceling the debounce timer.
- Markdown note editing should autosave about every 5 seconds, flush immediately when the browser window/tab is left, and flush when leaving the markdown editor view. Returning to a Page or focusing the window should only refresh project notes and update their visible content in memory; it must not clear the page board cache, reload the page list, or remount the active Page.
- The backend exposes `POST /pages/{page_id}/regulate` as a schema-aware maintenance endpoint. It rereads the current Page XML, normalizes existing `sticky_note` objects to the standalone `sticky_item` / `sticky_object` schema, clears stale sticky containment, removes stale table cell child references, removes connector links pointing to missing items, normalizes item category / table parent references according to the current schema, and rewrites the Page as well-formed Page XML v2.
- The canvas header exposes a refresh-style regulate action beside the autosave and `magnet` controls; clicking it calls the regulate endpoint for the current Page and reloads the returned board data.
- Any future Page XML schema change must update the regulate function in the same change so maintenance repair behavior stays aligned with the canonical schema.

## 12. MVP 範圍

MVP 必要功能：

- Project / Page 管理
- 首頁顯示 Project JSON 匯出
- `text_box`、`sticky_note`、`note_paper`
- `frame`
- `arrow`
- magnet 磁鐵對齊
- Planvas file storage 持久化
- 持久化測試與冒煙測試

延後實作：

- Markdown rich preview
- table 複雜操作
- Undo / Redo 進階歷史
- viewer 匯出
- 多人協作

## 13. 驗收測試

驗收測試包含以下情境：

1. 首頁載入後建立新 Project，驗證能開啟 Project 並進入 Page
2. 匯出 Project 的 JSON 快照，並匯入建立新 Project
3. 在 Project 下建立多個 Page，含 `text_box`、`sticky_note`、`note_paper`、`frame`、`arrow`
4. Page 上的物件支援 resize、移動、多選
5. `frame` 支援展開 / 縮回，縮回後正確顯示摘要
6. `line` 與 `arrow` 支援 draw.io 風格的起點 / 終點建立，及端點拖拽重設
7. magnet 磁鐵對齊正常運作
8. 資料儲存後重新啟動，以 Planvas file storage 確認資料持久化
9. 前端與 backend 均能存取 `GET /healthz`
10. 多選後可批量刪除、複製、貼上等操作
11. 匯出單一 Page 為 PNG
12. 匯出單一 Page 為 PPTX（含 page-by-slide 版面）
13. 匯出 Project 為靜態 viewer，可在瀏覽器中閱覽各 Page

## 14. 實作順序

1. 先確認端對端健康狀態，驗證通過 `GET /healthz`
2. Planvas file storage 與 backend CRUD 實作
3. Frontend app shell 與 Project / Page 管理
4. 白板基本物件渲染與互動
5. 物件拖拽調整
6. magnet 磁鐵對齊
7. Planvas file storage 持久化完整驗收測試

## 15. Page XML v2 Semantic Storage

Page XML v2 must split each page into two sibling files:

- `<page_name>.semantic.xml`: AI-readable board meaning, including object content, containment, table cell structure, and canonical links.
- `<page_name>.presentation.xml`: visual rendering data, including position, size, rotation, z-order, colors, fill patterns, shape details, and connector routes.

The semantic file is the preferred source for AI, automation, Jira ticket generation, summaries, and project reasoning. Those workflows should not need to read the presentation file unless they are answering a visual layout question.

Semantic object kinds:

- `large_object`: `frame`, `table`
- `small_object`: `text_box`, `note_paper`
- `sticky_object`: `sticky_note`
- `link`: `line`, `arrow` when the connector expresses a semantic relationship

Containment rules:

- `frame` may contain `small_object` children directly. `sticky_object` children are not allowed.
- `table` is a `large_object`; its cells are nested semantic containers.
- `table_cell` may contain `small_object` children.
- A `table_cell` should have a stable id so semantic links and presentation layout can reference the cell.
- MVP table cells should contain only `small_object` children. `sticky_object` and nested `large_object` children are not allowed.

Relationship rules:

- `links/link` in the semantic file is the canonical source of truth for relationships between objects or cells.
- Each link must have a stable `id`, `type`, `from`, and `to`.
- Links may include `label` and `meaning`; `meaning` should use explicit values such as `dependency`, `blocked_by`, `workflow_transition`, `reference`, or `related`.
- `line` records without object endpoints, labels, or explicit semantic meaning may stay presentation-only.
- Objects and cells may include `connections` entries such as `<connection to="item-b" by="link-a" role="outgoing" />` as AI-friendly indexes.
- Object-level `connections` must be derived from or validated against canonical links so the same relationship does not drift between two sources.

Example target semantic file:

```xml
<page_semantic id="page-1" schema_version="2">
  <objects>
    <object id="frame-1" kind="large_object" type="frame">
      <title>Sprint 12</title>
      <contains>
        <item ref="note-1" />
        <item ref="note-2" />
      </contains>
      <connections>
        <connection to="table-1" by="link-a" role="outgoing" />
      </connections>
    </object>

    <object id="table-1" kind="large_object" type="table">
      <title>Sprint board</title>
      <table>
        <row id="row-1" index="0">
          <cell id="cell-1" row="0" column="0">
            <text>Todo</text>
            <contains>
              <item ref="note-3" />
            </contains>
          </cell>
        </row>
      </table>
    </object>
  </objects>

  <links>
    <link id="link-a" type="arrow" from="frame-1" to="table-1">
      <label>feeds into</label>
      <meaning>dependency</meaning>
    </link>
  </links>
</page_semantic>
```

Example target presentation file:

```xml
<page_presentation id="page-1" schema_version="2">
  <items>
    <item ref="frame-1" x="80" y="80" width="640" height="420" z_index="1" />
  </items>
</page_presentation>
```
