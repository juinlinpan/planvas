# Whiteboard Planner Todo List

## Persistence Redesign Notes

- [x] Replace SQLite-backed repository persistence with file-based Planvas project storage.
- [x] Add default Planvas root resolution at `<user_home>/.planvas/`, with `WHITEBOARD_PLANVAS_ROOT` override.
- [x] Store each Project as a working directory containing `.pv_project/metadata.json` and two XML files per Page under `.pv_project/`.
- [x] Rename Page XML sibling files when the user renames a Page, preserving the Page id and board content.
- [x] Treat `.pv_project/*.md` files as project note files and surface them as `note_paper` notes.
- [x] Store `note_paper` markdown bodies in `.pv_project/*.md` files while keeping Page XML limited to placement data and a markdown file reference.
- [x] Add a left-sidebar Notes box that lists all project markdown notes.
- [x] Let users drag a note from the left Notes box onto any Page row to create a `note_paper` placement on that Page.
- [x] Make Pages and Notes sidebar boxes expandable/collapsible with internal scrolling capped to half the sidebar height.
- [x] Refresh the sidebar Notes box after markdown-backed note create, update, rename, and delete operations.
- [x] Make Page note deletion remove only the board placement while preserving the Project `.md` note file.
- [x] Allow the same Project note file to be placed multiple times on one Page and across multiple Pages.
- [x] Propagate note filename changes across all Page placements that reference the same `.md` file.
- [x] Add `<user_home>/.planvas/project.json` as the common project path index.
- [x] Add `<user_home>/.planvas/project_store/<project_name>/` as the default location for newly created projects.
- [x] Add `.pv_project/` data directory creation for initialized Project directories.
- [x] Add Project path opening / registration for external folders without recreating existing Planvas metadata.
- [x] Refresh Project listing so missing registered paths are detected and `project_store` projects are shown before other paths.
- [x] Preserve existing backend HTTP API shapes while replacing the underlying storage engine.
- [x] Update backend tests for Planvas storage initialization and restart persistence.
- [x] Replace DB access with a filesystem repository.
- [x] Add backend diagnostics for slow HTTP requests, event loop lag, uncaught exceptions, and unhandled promise rejections.
- [x] Reduce common multi-item save pressure by batching table-style and table-absorb changes through a single board-state write instead of parallel per-item writes.
- [x] Make board item creation optimistic so newly created items appear immediately while backend persistence finishes in the background.
- [x] Stop routine project-note refreshes from remounting the current Canvas, avoiding white flashes after note creation.
- [x] Add a frontend per-Page board cache so switching back to an already loaded Page restores board data from memory instead of re-fetching it.
- [x] Keep the per-Page board cache synchronized with live item, connector, and viewport changes.
- [x] Flush pending viewport autosave on Canvas unmount instead of dropping the last debounced pan / zoom update.
- [x] Move item and viewport autosave debounce to second-level timing to reduce high-frequency write pressure.
- [x] Change Markdown editor saving to 5-second autosave plus immediate flush on window/tab leave and editor view switch, without remounting the current Page on note refresh.
- [x] Add a Page XML regulate maintenance endpoint and canvas refresh action near `magnet` to rewrite current-schema Page XML, normalize `sticky_note` into standalone `sticky_item` / `sticky_object`, and remove stale table child references.

## Page XML v2 Semantic Storage Notes

- [x] Define the Page XML v2 schema with separate `<page_name>.semantic.xml` and `<page_name>.presentation.xml` files.
- [x] Move AI-readable board meaning into the semantic file, including object content, frame containment, table cell containment, and canonical links.
- [x] Keep geometry, z-order, colors, fill patterns, shape details, and connector route points in the presentation file.
- [x] Model semantic object kinds as `large_object`, `small_object`, and semantic `link`.
- [x] Treat `frame` and `table` as `large_object` types.
- [x] Treat `text_box` and `note_paper` as `small_object` types.
- [x] Treat `sticky_note` as standalone `sticky_object`, outside `small_object` and `large_object` containment.
- [x] Treat `line` and `arrow` as semantic `link` records when they express a relationship.
- [ ] Optionally keep decorative lines presentation-only in a later cleanup.
- [x] Add semantic `frame` containment for direct `small_object` children.
- [x] Add stable `table_cell` ids and semantic table cell containment for `small_object` children.
- [x] Make semantic `links/link` records the canonical source of truth for relationships between objects or table cells.
- [x] Generate or validate object-level `connections` indexes from canonical links so AI can quickly inspect incoming and outgoing relations.
- [x] Preserve markdown-backed `note_paper` behavior by storing semantic note content as `content_ref type="markdown"` with the `.md` filename.
- [x] Write new Page XML as v2 only; legacy v1 Page XML migration is intentionally out of scope for this change.
- [x] Implement Page XML v2 writer output and reader round-trip for the existing HTTP API shape.
- [x] Add tests for frame containment, table cell containment, semantic link canonical data, derived object connections, presentation-only lines, and markdown content references.
- [ ] Update JSON export / import and future AI-readable snapshots to prefer the semantic layer while preserving current API compatibility.

## Navigation Update Notes

- [x] Make the workspace left page sidebar and right inspector collapsible with a persistent restore handle.
- [x] Opening a project from the home screen now creates a browser history entry and loads the workspace page list without auto-opening a page.
- [x] The workspace left sidebar stays focused on page navigation and no longer shows a project details panel.
- [x] Rework the sidebar header into a `Planvas` / `Home` top row plus a divided `Project` summary row with a settings icon trigger.
- [x] Move all project controls into a dedicated settings modal that uses about 70% viewport width on desktop.
- [x] Move page rename into a pencil action beside each page row.
- [x] Refresh the page delete button beside each page row with a cleaner icon treatment.
- [x] Project delete now appears under the project name controls and requires typing `delete {project_name}` before returning to the home screen.
- [x] Added a project-level `Change theme color` dropdown above `Delete project`, with `default`, `sage`, `sunset`, and `ocean` themes persisted on each project.
- [x] Added Project Settings defaults for object text color, small-object fill color, large-object fill color, link stroke color, and link text color.
- [x] Remove the old inline `Manage` panel from the left sidebar after moving project controls into the modal.
- [x] Treat browser file picker cancellation during Project / Page export as a normal cancel without showing an error banner.
- [x] Keep duplicate out of the left sidebar while allowing page rename and delete icon buttons there.
- [x] The workspace `Home` button now sits beside the `Planvas` heading.
- [x] Home now shows `Create Project`, `Open Project`, and `Refresh`; project JSON import is removed from the home screen.
- [x] `Create Project` now uses an app modal instead of a browser prompt.
- [x] `Open Project` uses the Windows native folder picker, with manual path entry as fallback.
- [x] Manual `Open Project` paths can be absolute, `~`-based, or relative to `<user_home>`.
- [x] Make `Open Project` dedupe by canonical filesystem path instead of Project name, preserving separate projects with the same name.
- [x] Keep copied Project folders with duplicated metadata ids from replacing the original Project registration.
- [x] Home project list is grouped into `project_store` projects first and other registered paths second.
- [x] Home missing-path projects can be removed from `project.json` after Refresh.
- [x] Re-entering a Project from Home refreshes that Project's Pages and Notes from disk even when the selected Project id did not change.
- [x] Clicking `嚗??啣? Page` now creates `untitled_n` directly without a prompt dialog.

## Toolbar Menu Update Notes

- [x] Rework top toolbar into Office-like `檔案` / `編輯` clickable dropdown menus.
- [x] Move page `import` / `export` under the `檔案` dropdown.
- [x] Add hover-triggered right submenu under `export` to host current and future formats.
- [x] Keep `magnet` and `zoom` controls pinned to the far-right side of the toolbar.
- [x] Replace the right-upper floating utility strip with the expandable canvas header ribbon.
- [x] Group `檔案`, `編輯`, and `檢視` in the expanded header ribbon, with `magnet` / `zoom` / `格線` under `檢視`.
- [x] Keep the draggable toolbar focused on tool buttons only.

## Export And Read-Only Sharing Planning Notes

- [ ] Keep `JSON` export as the shared canonical snapshot source for future export targets.
- [x] Add `PNG` export for quick sharing, cropped to the visible item bounds instead of the whole canvas.
- [x] Add `PPTX` export with an initial `one page => one slide` mapping and defined raster fallback boundaries.
- [x] Change PPTX export to editable native objects: `table` -> PowerPoint table, `frame` -> footer rectangle + title textbox, others -> textbox with original colors where possible.
- [ ] Add a project-level read-only `viewer` export that recipients can open without installing the app or backend.
- [ ] Make the read-only `viewer` self-contained (prefer single HTML or equivalent packaging) so recipients are not required to run a local server.
- [ ] Reuse shared layout / summary rules across `PNG`, `PPTX`, and `viewer` outputs so frame summaries, text truncation, and hierarchy stay consistent.
- [ ] Add validation coverage for export cancellation, rendering fidelity basics, and generated viewer navigation.

## Zoom And Grid Update Notes

- [x] Keep the left page list zoom indicator in sync with live canvas zoom changes.
- [x] Add toolbar zoom controls for `-`, `+`, current zoom readout, and reset to `1.0x`.
- [x] Add a compact zoom reset-target control so reset can be changed in `0.1x` increments, for example `0.5x` or `1.5x`.
- [x] Keep `magnet` enabled by default when the canvas loads.
- [x] Remove nearby-item alignment and keep `magnet` for background-grid edge snapping during move / resize.
- [x] Snap newly created items and freeform `line` / `arrow` points to the background grid when `magnet` is enabled.
- [x] Add clear `X=0` / `Y=0` zero-axis guide lines on the canvas.

## Item Content Display Update Notes

- [x] Remove the `Markdown` badge from `note_paper` read mode.
- [x] Keep `text_box` read mode scrollbar-free and let it show as much text as the current size allows.
- [x] Make `note_paper` read mode scroll its body when markdown content overflows.
- [x] Prioritize the first Markdown `#` heading when a `note_paper` is too small to show both title and body comfortably.
- [x] Let `note_paper` placements toggle on the Page between expanded markdown content and a title-only H1 summary view.
- [x] Back `note_paper` content with `.md` files under `.pv_project/` instead of storing markdown text inside Page XML.
- [x] Let the right inspector rename the markdown backing file for a selected `note_paper`.
- [x] Add project-level note listing API and sidebar drag placement for markdown-backed notes.
- [x] Refresh `.pv_project/*.md` project notes from disk when the workspace regains focus or the tab becomes visible, and update visible `note_paper` placements that reference changed files.
- [x] Preserve active in-app markdown drafts when an external note refresh arrives.

## Table And Small-Item Sizing Update Notes

- [x] Raise the `table` dimension cap from `12 x 12` to `20 x 20`.
- [x] Make every `table` cell respect the minimum `text_box` size.
- [x] Make toolbar table insertion preview expand away from the current toolbar dock and allow a second table-tool click to cancel insertion.
- [x] Let table edge controls add rows above or below and columns to the left or right.
- [x] Set the minimum `text_box`, `sticky_note`, and `table` cell size to `48 x 48`, matching two default text line-heights while staying grid-aligned.
- [x] Verify every board item minimum size, including `line`, `arrow`, and dynamic `table` minimum sizes, stays aligned to whole canvas grid units.
- [x] Snap internal `table` row and column divider dragging to the canvas grid when `magnet` is enabled, with `Alt` as the temporary bypass.

## Item Context Menu Update Notes

- [x] Split the canvas right-click menu into dedicated item and canvas variants.
- [x] Show `cut`, `copy`, `paste`, and `delete` when right-clicking a selected board item.
- [x] Add `move forward`, `move backward`, `bring to front`, and `send to back` into the selected-item right-click menu.
- [x] Remove z-index layer action buttons from the right inspector panel.
- [x] Keep canvas right-click focused on `paste` so empty-space context actions stay minimal.
- [x] Reuse the existing clipboard/delete handlers so right-click actions match keyboard shortcuts.
- [x] Cover the new context-menu action visibility and viewport clamping with tests.

## Inspector Tab Update Notes

- [x] Add top-level `樣式` and `文字` tabs to the right inspector.
- [x] Keep object size, object/background/line colors, item text content, table cell content, markdown filename, and frame collapse controls in `樣式`.
- [x] Move font size, bold/italic text style, text alignment, table label font size, table cell text alignment, and line/arrow label placement into `文字`.
- [x] Update Inspector tests for the tabbed layout and font-size editing from the `文字` tab.

## Line Text Update Notes

- [x] Let `line` store an optional text label in `content`.
- [x] Let users double-click a `line` to edit its text label inline.
- [x] Add right-inspector controls for `line` text front / center / back placement.
- [x] Add right-inspector controls for `line` text top / middle / bottom placement.
- [x] Add right-inspector controls for horizontal or slope-following `line` text direction.
- [x] Group `line` text editing and text-related settings together in the inspector.
- [x] Add right-inspector controls for `line` text background, text color, and font size.
- [x] Keep the default `line` text background transparent.
- [x] Reduce default `arrow` head size to a compact `14px` and make the inspector commit arrow-head-size edits after field completion so intermediate number entry does not jump.
- [x] Remove the separate legacy connector-arrow renderer and migrate old connector-arrow placements into segment-arrow geometry on load.

## Frame Exit Interaction Update Notes

- [x] Preserve a dragged item's dropped position when it fully leaves its parent `frame`.
- [x] Keep frame eject positioning only for partial frame exits.

## Table Text Layout And Inspector Update Notes

- [x] 讓 `table` 儲存格與 `text_box` 支援文字水平對齊（左/中/右）與垂直對齊（上/中/下）設定，預設為水平置中、垂直置中
- [x] 讓選取整張 `table` 時的字型大小、文字顏色、粗體與斜體設定同步套用到所有儲存格文字與格內 `small_item`
- [x] 讓 `text_box` 在 read mode 下移除捲動列，盡可能顯示多行文字
- [x] 讓 `note_paper` read mode 支援 Markdown 溢出捲動，內容過小時優先顯示 Markdown H1 標題，並可在 Page 上切換成只顯示標題
- [x] 在 Inspector 中為 `table` 新增「鎖定欄」欄位，可設定各欄位隱藏與顯示行為
- [x] 在 Inspector 中為 `table` 新增 optional「名子」欄位，輸入後才在表格左上方顯示小標籤，並保持未命名舊 Page 相容
- [x] 在 Inspector 中為 `table` 名稱標籤新增獨立字級控制，並套用到 Page 上方標籤顯示
- [x] 改善 `table` 新增 row / col 邊緣按鈕的可點擊範圍

## Minimap And New-Page Viewport Update Notes

- [x] 在 Canvas 畫布右下角加入 mini map，以縮圖方式呈現整體畫布內容
- [x] mini map 內以矩形顯示目前 viewport 位置與比例
- [x] mini map 支援點擊與拖拉，可快速移動到畫布任意位置
- [x] 新增 Page 後將 viewport 初始化至覆蓋 80% 畫布內容的最適縮放比例

## Cross-Page Copy and Paste Update Notes

- [x] Implement localStorage-backed clipboard helpers for cross-page copying and pasting.
- [x] Update canvas copy, cut, paste, and check actions to read and write from localStorage with a memory fallback.
- [x] Ensure that pasting offsets items to prevent visual overlap.
- [x] Ensure that copy-pasting objects preserves parent-child frame containment relationships.

請參考 `spec.md` 的完整需求說明與驗收條件，以下 MVP Todo 排列依建議實作順序，已完成項目以 [x] 標記。

## MVP Todo

### 1. 專案設定與初始化

- [x] 建立基本專案結構：`frontend/` 與 `backend/` 資料夾
- [x] 建立 React + TypeScript + Vite 前端架構
- [x] 建立 TypeScript + Node.js backend 架構
- [x] 建立 root scripts：`npm run dev`、`dev:frontend`、`dev:backend`、`build`、`lint`、`format`、`typecheck`、`check`
- [x] Add `planvas` as a source checkout launch command that starts the unbuilt frontend and backend after dependencies are installed.
- [x] 確認前端 dev port `5173` 與 backend dev port `18000`
- [x] 建立 `GET /healthz` 基礎健康檢查端點
- [x] 建立 lint / formatter / type check 設定
- [x] 建立 Windows preflight / bootstrap scripts：確認 Node.js LTS 版本與執行環境前置條件

### 2. 後端儲存與日誌設定

- [x] Initialize `.planvas` project storage and `logs/` runtime output.
- [x] Planvas file storage uses `<user_home>/.planvas/project_store/<project_name>/.pv_project/metadata.json` for newly created projects, while external projects may live at user-selected paths with page XML files under `.pv_project/`.
- [x] 設定 log 輸出目錄至 `<backend_root>/logs/`
- [x] 確認後端重啟後資料不遺失
- [x] 確認日誌路徑格式與輸出符合規範

### 3. Planvas File Storage

- [x] Store Project records in `<project_name>/.pv_project/metadata.json`.
- [x] Keep `.pv_project/metadata.json` limited to project-level settings and derive Pages / Notes live from `.pv_project/` contents.
- [x] Store each Page's `viewport_x`, `viewport_y`, and `zoom` on that Page XML root instead of `metadata.json`.
- [x] Store board item semantic and presentation data inside each Page's two XML files.
- [x] Store `note_paper` bodies in sibling markdown files and keep only `data_json.noteFile` references in Page XML.
- [x] Store connector links inside each Page semantic XML file.
- [x] Keep page / item / connector ids stable inside metadata and XML files.
- [x] Add `POST /pages/{page_id}/regulate` to repair Page XML v2 using the current schema: normalize existing `sticky_note` objects to standalone `sticky_item` / `sticky_object`, remove stale table child refs, normalize table child parent links, drop connector links with missing endpoints, and rewrite semantic / presentation XML.
- [x] Replace DB access with a filesystem repository.
- [x] 確認各 API 回應欄位包含 `project_id`、`page_id`、`parent_item_id`

### 4. Backend API

- [x] 實作 Project CRUD API
- [x] 實作 Page CRUD API
- [x] 實作 board item CRUD API
- [x] 實作 connector CRUD API
- [x] 實作 Page viewport API
- [x] 實作 Page 全頁讀取 API
- [x] 實作 Page board state replace API（供 Undo / Redo 使用）
- [x] 統一 success response format
- [x] 統一 error format

### 5. 前端 App 外殼

- [x] 建立基礎 app layout
- [x] 實作路由：包含進入 Project 頁面、建立、開啟、主頁
- [x] 實作 Project / Page 導航
- [x] 確認導航切換有正確狀態更新
- [x] 實作前端錯誤邊界處理
- [x] 實作全局 toast 通知機制
- [x] 正確處理後端 API 無回應或逾時：顯示錯誤提示
- [x] 正確處理白板載入前的初始狀態：顯示 loading 狀態
- [x] 串接 backend API
- [x] 確認頁面路由跳轉與 API 串接完整運作

### 6. Project / Page UI

- [x] 建立基礎首頁佈局與 Project 入口
- [x] 新增 Project
- [x] 匯出 Project JSON snapshot
- [x] 重新命名 Project
- [x] 刪除 Project
- [x] 確認切換後頁面正確顯示 Project 列表
- [x] 新增 Page
- [x] 重新命名 Page
- [x] 刪除 Page
- [x] 複製 Page
- [x] 將原本 toolbar 上的 Page JSON export / import 功能改為下拉選單
- [x] 支援匯入 Page JSON 並貼到現有 Page，包含詢問是否覆蓋現有 Page
- [x] Page JSON export 包含 `item_hierarchy` 巢狀結構，確保 import 時可正確還原 `parent_item_id` 關係
- [x] 確認切換後頁面正確顯示 Page 列表
- [x] 切換 Page

### 7. 白板互動基礎

- [x] 建立白板互動狀態機
- [x] 支援物件選取
- [x] 支援多選物件，以框選涵蓋所有物件，包含群組操作
- [x] 支援 viewport 拖曳平移
- [x] 支援物件移動
- [x] 支援物件縮放
- [x] 支援 z-index 調整
- [x] 支援複製 / 貼上
- [x] 支援多選框選，框選後可對群組執行選取 / 複製 / 移動 / 刪除
- [x] 支援 Delete
- [x] 支援 Undo / Redo
- [x] 支援物件樣式設定

### 8. 白板物件建立

- [x] 定義 item type 與 category 分類規則
- [x] 定義各類物件的共用基礎 item model
- [x] 建立 toolbar 物件建立工具列
- [x] 建立工具列拖拉建立物件 / 點擊建立流程
- [x] 支援建立 `line`
- [x] 支援建立 `table`
- [x] 支援建立 `text_box`
- [x] 支援建立 `sticky_note`
- [x] 支援建立 `note_paper`
- [x] 支援建立 `frame`
- [x] 支援建立 `arrow`

### 9. `shape`

- [x] 確認 `line` / `arrow` 線段支援多錨點折線、弧線、曲線，以及正確的中間點拖拉邏輯
- [x] 確認連接器吸附錨點讓 `line` / `arrow` 脫離後保持 freeform segment 路徑
- [x] `line` / freeform `arrow` 線段點位可自由調整，拖拉中間點可新增節點，並合併相鄰共線點
- [x] segment 拖拉中間點靠近吸附錨點時自動連接；端點靠近後可重新 detach 並保持路徑
- [x] 實作 `line`
- [x] 支援 `line` 垂直 / 水平角度鎖定
- [x] 支援 `line` 多段連線格式
- [x] 支援 `line` 線段樣式
- [x] 實作 `table`
- [x] 支援儲存格 / 表頭格式（透過 Inspector，點擊儲存格可 inline 編輯）
- [x] 支援儲存格內 table 內嵌物件
- [x] 支援 table 線段樣式
- [x] **重構 table v2**：支援彈性儲存格（`colWidths`/`rowHeights`/merge spans）
- [x] 支援大型 `table` 處理：表格超過最小格子尺寸時允許 `1 × 1` 空格顯示，可切分顯示 / 固定框架涵蓋 `n × m`，並可繼續新增儲存格
- [x] 支援拖拉 table 格欄位邊框進行欄寬 / 列高調整（zoom-agnostic fraction resize）
- [x] 支援拖拉 table 格行列邊框新增 / 刪除，並以 `+` 按鈕新增 row / col
- [x] 支援從預覽中點擊選取並拖拉 row / col 的 + 按鈕建立儲存格
- [x] 支援從格內建立固定儲存格項目
- [x] 支援拖拉 / 縮放並正確更新儲存格格式
- [x] 支援 `small_item`（text_box、note_paper）作為儲存格內容（在 frame 外顯示）；`sticky_note` 維持獨立便利貼，不進入 table 或 frame
- [x] 支援表格與單一儲存格設定格內 `small_item` 排列方向（上下分 / 左右分），預設上下分，表格層級與儲存格層級以較晚設定者生效
- [x] 支援 table resize 後自動 relayout 儲存格並更新其中的 `small_item`
- [x] 支援儲存格內 embedded item 縮放 / 內容更新
- [x] 支援格子複製並更新複製後格子的 `string[][]` 剪貼板資料
- [x] 支援格子滑過預覽（hover 時顯示按鈕欄位，固定顯示儲存格內 `+`）
- [x] 支援格子資料序列建立，可替換或修改目前的儲存格清單 / 還原格子資料 / 公式
- [x] 支援格子特殊摘要匯出，確認欄位名稱不重複並維持欄位 identity
- [x] 支援格子資料結構變更後快速替換差異資料，確保持久性：支援固定 / 可替換欄位，重新排序後維持 diff
- [x] 支援選取完整表格 row / column 後使用 `Delete` / `Backspace` 或右鍵刪除該行列，保留剩餘格子的像素大小並縮減 table 總尺寸；零散格子選取則只清除選取格內容
- [x] 支援格欄位游走 table 拖拉功能，確認拖拉後 pixel layout 精確無誤
- [x] 儲存格支援絕對定位，游走欄位移動時確認視覺位置正確
- [x] 刪除 row / col 後同步更新 table，確認不重複使用舊欄位名稱
- [x] 刪除 row / col 後 relayout，確認 cell 的 child items 一併清除
- [x] table 格框線支援多種樣式，包含點線、虛線與混合格線，套用後確認外觀正確
- [x] table 格框線顏色支援自訂，可在 Inspector 面板中直接選色並套用
- [x] 支援 table optional「名子」欄位，Inspector 輸入後在表格左上方顯示小標籤，缺少或清空時維持舊 Page 相容且不顯示標籤
- [x] 支援 table 名稱標籤字級調整，儲存在 table data 的 optional `labelFontSize` 欄位
- [x] 放大 table 新增 row / col 按鈕點擊範圍，避免邊界外控制被裁切造成難以點擊

### 10. `small_item`

- [x] 實作 `text_box`
- [x] 支援 `text_box` 內嵌編輯
- [x] 實作 `sticky_note`
- [x] 支援 `sticky_note` 顏色選取、文字樣式、最前層預設與右上角摺痕樣式
- [x] 實作 `note_paper`
- [x] 支援 Markdown 內容編輯
- [x] 支援 `note_paper` 標題重新命名

### 11. `frame`

- [x] 實作 `frame`
- [x] 支援 `frame` 拖移
- [x] 支援 `frame` 縮放
- [x] 支援 `frame` 展開 / 縮回
- [x] 支援將 `small_item` 放入 `frame`
- [x] 支援從 `frame` 中拖出 `small_item`
- [x] 支援 frame 縮回時展示預覽內容
- [x] 支援縮回後框架標籤顯示
- [x] 支援展開且與其他 `frame` 重疊時，顯示提示並觸發 focus mode
- [x] 支援超大 `small_item` 自動縮放貼入 `frame` 的 60% fit budget
- [x] 支援 `small_item` 進入 `frame` 的動畫
- [x] 支援 `small_item` 完全離開 `frame` 後保留拖放位置，不強制彈出 frame 邊界
- [x] 支援 `frame` 縮回時 item 預覽摘要顯示於 frame 標題
- [x] 支援從 `frame` 中拖出 item 後正確更新 frame 尺寸

### 12. 縮回顯示規則

- [x] `text_box` 縮回時顯示完整文字
- [x] `sticky_note` 不參與 frame 縮回摘要，維持獨立便利貼
- [x] `note_paper` 縮回時僅顯示第一個 Markdown H1
- [x] 若無 H1，則以 fallback 顯示摘要內容
- [x] 定義 frame 縮回後各類物件的摘要顯示規則

### 13. `arrow`

- [x] 實作 `arrow`
- [x] 支援 `arrow` 垂直 / 水平方向建立
- [x] 支援 `arrow` 箭頭方向設定
- [x] 支援 `arrow` 多段連線格式
- [x] 支援 `arrow` 線段樣式
- [x] 支援 `arrow` / `line` 相容 draw.io 慣例的 connector anchor
- [x] 支援已連接的 `arrow` / `line` 錨點跟隨物件移動更新位置

### 14. Magnet / 格線對齊

- [x] 實作背景格線 magnet 對齊功能
- [x] 定義 magnet 吸附精度
- [x] 確認 magnet 預設啟用且吸附行為符合規格
- [x] 支援按住 `Alt` 暫時停用 magnet
- [x] 實作 connector anchor 吸附視覺提示（anchor indicator）

### 15. 右側 Inspector 面板

- [x] 依選取物件類型切換 Inspector 顯示內容
- [x] 顯示位置資訊
- [x] 顯示尺寸資訊
- [x] 顯示樣式設定
- [x] 顯示文字與字型設定
- [x] 支援顏色選取器含 7 色預設與自訂色彩輸入
- [x] 支援線段樣式設定
- [x] 顯示物件鎖定狀態

### 16. 鍵盤快捷鍵

- [x] `Delete` 刪除
- [x] `Ctrl/Cmd + C` 複製
- [x] `Ctrl/Cmd + X` 剪下
- [x] `Ctrl/Cmd + V` 貼上
- [x] `Ctrl/Cmd + Z` Undo
- [x] `Ctrl/Cmd + Shift + Z` Redo
- [x] `Space + Drag` 拖曳平移畫布

### 17. 後端基礎設施與預飛

- [x] 確認 frontend / backend 版本相容性測試
- [x] 確認前端建置輸出正確載入
- [x] Initialize `.planvas` project storage and `logs/` runtime output.
- [x] 確認應用程式在乾淨環境下可正常啟動
- [x] 確認 smoke test 通過

### 18. 整合測試

- [x] 測試 Project / Page CRUD
- [x] 測試物件建立 / 編輯 / 刪除
- [x] 測試 frame 展開 / 縮回
- [x] 測試縮回顯示規則
- [x] 測試 frame overlap focus mode / auto-ingest / auto-fit / enter-exit animation
- [x] 測試 item 進入 / 離開 frame 邊界時的尺寸與位置行為
- [x] 測試 frame 縮回時 item 摘要顯示正確
- [x] 測試 item 離開 frame 後 frame 尺寸正確更新
- [x] 測試 line / arrow 跟隨物件移動後錨點正確更新
- [x] 測試 magnet 對齊功能
- [x] 測試 Undo / Redo
- [x] 測試後端儲存與讀取
- [x] 依據 `spec.md` 驗收完整功能行為

## 延後實作

### 19. 進階功能

- [x] Markdown rich preview
- [x] Undo / Redo 細粒度合併

### 20. 遷移清理

- [ ] 將舊版 legacy `connector_links` 格式遷移至新的 connector 架構，確保舊資料可正確載入

### 21. 匯出管線

- [ ] 建立共用 export pipeline：統一讀取 Page / Project snapshot、viewport 資訊與 item hierarchy
- [x] 設計 PNG 匯出 UI 裁切邊界策略，僅輸出可見物件範圍
- [x] 實作 PNG 匯出，以縮圖快速分享，裁切至物件邊界
- [x] 改進 PPTX 匯出為可編輯原生物件，不再強制走 backend 圖片渲染流程
- [x] 定義 PPTX slide layout 規則 / 文字截斷策略與 raster fallback 邊界
- [x] 實作 PPTX 匯出支援原生可編輯 item 物件
- [ ] 設計 Project viewer 自包含封裝方案
- [ ] 實作基礎 viewer shell：page list、閱讀導覽、pan / zoom
- [ ] 確認 viewer 執行不依賴 Node.js backend、SQLite 或其他伺服器
- [ ] 驗證匯出取消、渲染保真度與 viewer 導覽的測試覆蓋

### 22. Frontend `App.tsx` Module Split Plan

Goal: reduce `frontend/src/App.tsx` from a mixed orchestration/rendering file into a thin workspace coordinator. Keep behavior stable in each step and verify after every extraction.

Split order:

- [x] Extract workspace tab state and rendering into `frontend/src/workspaceTabState.ts` and `frontend/src/WorkspaceTabs.tsx`.
  Scope: `WorkspaceTab`, visible-tab filtering, active tab detection, tab close/open/reorder, tab drag/drop, and tab bar JSX.
  Keep in `App.tsx`: selected project/page/note ids and callbacks that change them.
  Verify: page tabs open on page selection, note tabs open from Notes, active tab switching works, tab close fallback still selects the previous page tab, tab drag reorder still works, `npm.cmd run build --workspace frontend`.

- [ ] Extract left workspace sidebar rendering into `frontend/src/WorkspaceSidebar.tsx`.
  Scope: project header, sidebar collapse button, Pages box, Notes box, page rename/delete buttons, note open/delete buttons, note/page drag targets.
  Keep in `App.tsx`: data loading, mutations, selected ids, and mutation handlers.
  Verify: Home button, project settings button, sidebar collapse/restore, page create/rename/delete, note open/delete, note drag-to-page placement, page reorder, `npm.cmd run build --workspace frontend`.

- [ ] Extract project settings dialog into `frontend/src/ProjectSettingsDialog.tsx`.
  Scope: project name form, theme dropdown, project path/reveal control, default style controls, and delete-project entry point.
  Keep in `App.tsx`: `selectedProjectDefaultStyle`, `handleSaveProjectName`, `handleChangeProjectTheme`, `handleChangeProjectDefaultStyle`, `handleRevealProject`, delete dialog state.
  Verify: project rename, theme change, default style changes, open folder, delete dialog launch, `npm.cmd run build --workspace frontend`.

- [ ] Extract page import/export orchestration into `frontend/src/usePageImportExport.ts`.
  Scope: PNG/PPTX/Markdown/HTML export click flow, export image modal data, Mermaid import modal state, cross-project import modal state, and file picker helpers if they remain local to `App.tsx`.
  Keep in `App.tsx`: selected project/page ids, `pages`, `projectNotes`, `setPages`, `setSelectedPageId`, note refresh callback, and `runMutation`.
  Verify: PNG export empty-page error, PNG export modal confirm/cancel, PPTX export, Markdown export, HTML export, Mermaid import, cross-project import, `npm.cmd run build --workspace frontend`.

- [ ] Extract project/page/note loading and cache coordination into `frontend/src/useWorkspaceData.ts`.
  Scope: `loadWorkspace`, `loadProjectSidebarData`, project notes refresh, focus/visibility refresh, board cache refs, page refresh tokens, selected page ref, and workspace entry retry.
  Keep in `App.tsx`: high-level view state and UI composition.
  Verify: initial home load, open project, browser back/forward route sync, project refresh, project notes refresh on focus, page cache restore, page refresh token reload, `npm.cmd run build --workspace frontend`.

- [ ] Extract shared App utility helpers into focused files.
  Scope: move `buildUntitledPageName`, `selectFallbackId`, sidebar reorder helpers, file picker types/helpers, and App-only icons out of `App.tsx` when they are not already extracted.
  Verify: no `App.tsx`-local helper remains unless it directly coordinates top-level state, no unused local warnings in `App.tsx` under `tsc --noUnusedLocals --noUnusedParameters`, `npm.cmd run build --workspace frontend`.

Rules for each split:

- [ ] Do one extraction per commit-sized change; avoid behavior edits mixed with file moves.
- [ ] Prefer prop interfaces that pass callbacks and data explicitly instead of introducing global context.
- [ ] Do not move `Canvas` internals into this effort; Canvas cleanup remains a separate task.
- [ ] Do not change storage APIs, Page XML, project metadata, or backend behavior during this split.
- [ ] After each extraction, update this checklist and delete any abandoned subtasks instead of leaving stale TODO text.

## 建議實作順序

1. 專案設定與初始化
2. Planvas file storage 與後端 CRUD
3. Frontend App Shell 與 Project / Page UI
4. 白板互動基礎
5. 白板物件建立與互動
6. Snap / Connector 對齊
7. 後端基礎設施與冒煙測試
8. Frontend `App.tsx` module split
