# Whiteboard Planner — User Guide

## 系統需求

- Windows 作業系統
- [Node.js LTS](https://nodejs.org/)（建議 v20 以上）
- npm（隨 Node.js 一起安裝）

---

## 安裝

### 步驟 1：取得專案

將整個專案資料夾複製給對方（zip 壓縮後傳送，或 git clone 皆可）。

### 步驟 2：確認環境

開啟 PowerShell，進入專案根目錄後執行環境檢查腳本：

```powershell
./scripts/preflight.ps1
```

如果提示缺少 Node.js，執行以下指令安裝：

```powershell
./scripts/bootstrap.ps1 -InstallNode
```

### 步驟 3：安裝相依套件

```powershell
npm install
```

---

## 桌面版 (Desktop Version)

Planvas 目前提供 Windows 桌面版，桌面殼使用 Tauri 2。桌面版沿用既有的 React UI 與 Node 本機 API，因此 `.planvas` 專案儲存行為會和瀏覽器本機版一致。

> 目前限制：打包後的桌面版可以自動啟動隨附的 backend JavaScript，但執行環境仍需要本機已安裝 `node.exe`。如果目標電腦沒有 Node.js，請先安裝 Node.js LTS，或改用本機 Web 啟動器。

### 1. 準備桌面版建置工具

Windows 上的 Tauri 需要 Visual Studio C++ Build Tools、Windows SDK 與 Rust。若桌面版開發或打包時提示缺少 MSVC `link.exe`、`cargo` 或 `rustc`，請先執行：

```powershell
npm run desktop:setup
```

若跳出 Windows UAC 權限提示，請同意後重新開啟 PowerShell。如果 Visual Studio Build Tools 已安裝，但 `where.exe link` 仍找不到工具，也可以再執行一次 setup 指令，讓它補齊缺少的 C++ workload。

### 2. 啟動桌面開發版

```powershell
npm run desktop:dev
```

此指令會啟動或重用 `127.0.0.1:18000` 的本機 backend，並開啟 Tauri 桌面視窗。

### 3. 建置 Windows 安裝檔

```powershell
npm run desktop:build
```

建置完成後，NSIS 安裝檔會產生在：

```text
src-tauri\target\release\bundle\nsis\Planvas_0.1.0_x64-setup.exe
```

未來版本號可能會改變；若找不到完全相同的檔名，請在同一個資料夾中尋找：

```text
src-tauri\target\release\bundle\nsis\Planvas_*_x64-setup.exe
```

### 4. 安裝與啟動

1. 雙擊產生的 `Planvas_0.1.0_x64-setup.exe`。
2. 依照安裝程式提示完成安裝。安裝檔使用目前使用者安裝模式，通常不需要系統層級安裝權限。
3. 從開始功能表或桌面捷徑開啟 Planvas。
4. Planvas 啟動時會檢查 `http://127.0.0.1:18000/healthz`。若沒有可用的 backend，桌面版會自動啟動隨附的 Node backend。
5. 關閉桌面版時，由桌面版啟動的 backend process 也會一併停止。

若公司環境或 Windows 安全性政策封鎖未簽章的安裝檔或執行檔，請改用瀏覽器版本機啟動器：

```powershell
npm run web:start
```

---

## 啟動與使用方式

專案提供多種啟動與使用方式，以滿足不同的開發與使用情境：

### 1. 背景執行模式 (`planvas` 指令)

透過內建的腳本，您可以在背景啟動系統，而不會佔用當前的命令列視窗。
在專案根目錄下，執行：

```powershell
./scripts/planvas.cmd
```

_(如果已將專案設定為全域指令，例如透過 `npm link`，也可以直接輸入 `planvas`)_

啟動後會提示以下資訊：

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:18000`
- 背景執行記錄（Log）：位於 `backend\logs\planvas-dev.log`

> **提示**：若要停止背景執行的 Planvas，或是遇到 Port 被佔用的問題，請執行：
>
> ```powershell
> npm run dev:stop
> ```

---

### 2. 開發模式（前景執行，前後端同時啟動）

適合在開發時查看即時日誌。

```powershell
npm run dev
```

啟動後用瀏覽器開啟：

```
http://127.0.0.1:5173
```

---

### 3. 單 Port 模式（Production 模式）

適合分享給他人使用，前端會被建置並由後端靜態伺服，只需一個網址。

先建置：

```powershell
npm run build
```

再啟動後端服務：

```powershell
npm run serve
```

用瀏覽器開啟：

```
http://127.0.0.1:18000
```

---

## 開發與維護指令

除了上述的啟動指令，專案還提供以下常用的 npm scripts 來協助開發與維護：

- **`npm run check`**：執行完整的程式碼檢查，包含 Lint、測試 (Test) 以及建置 (Build)。
- **`npm run lint`**：執行前端的 ESLint 與後端的型別檢查 (Typecheck)。
- **`npm run typecheck`**：檢查前後端的 TypeScript 型別。
- **`npm run format`**：使用 Prettier 自動格式化所有程式碼。
- **`npm run smoke`**：執行基本的系統可用性測試 (Smoke Test)。
- **`npm run backup`**：打包備份目前的 `.planvas` 資料夾。

---

## 基本操作

### 首頁

啟動後進入首頁，可以：

- **新增 Project**：按「新增」，系統會在 `<user_home>/.planvas/project_store/` 建立專案資料夾
- **開啟現有 Project 資料夾**：按「開啟資料夾」，用 Windows 原生資料夾選擇器選取已有的 Planvas 專案
- **重新整理**：重新確認已登錄的 Project 路徑是否仍存在
- **移除失效路徑**：刪除已消失的 Project 登錄紀錄（不刪除磁碟資料）

### 工作區（白板）

進入 Project 後即進入工作區，左側 sidebar 包含：

- **Pages**：管理此 Project 底下的白板頁面，可新增、切換
- **Notes**：列出此 Project 下的所有 Markdown 筆記（`.md` 檔），可拖曳到 Page 上放置

### 白板物件

| 物件類型      | 說明                                                          |
| ------------- | ------------------------------------------------------------- |
| `text_box`    | 文字方塊                                                      |
| `sticky_note` | 便利貼                                                        |
| `note_paper`  | Markdown 筆記（對應一個 `.md` 檔）                            |
| `frame`       | 容器框，可收合展開，可容納 small_item，但不容納 `sticky_note` |
| `line`        | 線條                                                          |
| `table`       | 表格                                                          |
| `arrow`       | 箭頭連接器，可連結任何物件                                    |

### Frame 收合行為

Frame 收合後，其中的物件顯示如下：

- `text_box`：顯示完整文字
- `note_paper`：只顯示第一個 Markdown H1 標題
- `sticky_note`：維持獨立便利貼，不會被 frame 容納或出現在 frame 收合摘要中

### Note Paper 筆記

- 在白板上建立 `note_paper` 後，後端會對應建立一個 `.md` 檔
- 在白板上的 `note_paper` 右上角可切換「展開內容」與「只顯示標題」兩種模式
- 選取 `note_paper` 後，右側 Inspector 的「Markdown file」欄位可以重新命名對應的 `.md` 檔
- 同一份 `.md` 檔可以被多個 Page 或多次放置，編輯其中一個等同編輯同一份檔案
- 在外部編輯 `.pv_project/*.md` 後，回到 workspace 或切回瀏覽器分頁時，Notes 清單與畫面上引用該檔案的 `note_paper` 會重新載入最新內容
- 從 Page 刪除 `note_paper` 只移除白板上的擺放，不刪除 `.md` 檔案

### 頁面匯出 / 匯入

在工作區頂部 header 可操作：

| 功能            | 說明                                                        |
| --------------- | ----------------------------------------------------------- |
| **Export JSON** | 匯出目前頁面為 `.whiteboard-page.json`                      |
| **Import JSON** | 將 `.whiteboard-page.json` 匯入目前頁面（疊加模式，不覆蓋） |
| **Export PNG**  | 匯出目前頁面為 `.png` 圖片（自動裁切至有內容區域）          |
| **Export PPTX** | 匯出目前頁面為 `.pptx` 簡報（單張投影片）                   |

---

## 資料儲存位置

所有 Project 資料預設儲存在：

```
<user_home>/.planvas/
├── project.json                          ← 登錄的 Project 路徑清單
└── project_store/
    └── <project_name>/
        └── .pv_project/
            ├── metadata.json             ← 只存 Project 設定
            ├── <page_name>.semantic.xml  ← Page 語意內容與 viewport
            ├── <page_name>.presentation.xml ← Page 幾何、樣式與 z-index
            └── <note_name>.md            ← Markdown 筆記檔
```

後端 log 位於：

```
backend/logs/app.log
backend/logs/backend.log
```

### 自訂儲存路徑（選用）

```powershell
# 將 Project 儲存到其他磁碟
$env:WHITEBOARD_PLANVAS_ROOT = "D:\planvas-projects"
npm run dev:backend

# 將 backend log 放到其他位置
$env:WHITEBOARD_BACKEND_ROOT = "C:\whiteboard-runtime"
npm run dev:backend
```

---

## 備份

執行備份腳本會將目前 `.planvas` 資料夾打包備份：

```powershell
npm run backup
```

---

## 常見問題

**Q：啟動時提示 port 被佔用**
執行 `npm run dev:stop` 後再重新 `npm run dev`。

**Q：首頁找不到原本的 Project**
按「重新整理」確認路徑是否還存在；若路徑已移動，用「開啟資料夾」重新指向正確位置。

**Q：想驗證安裝是否正常**
執行 smoke test：

```powershell
npm run smoke
```

---

## Optional AI Tool Plugin

Planvas provides an optional AI collaboration package at:

```text
plugins/planvas-ai/
```

This package is not installed by the main app MSI/exe flow. It is for users who
want AI coding tools to read Planvas Page XML v2, use the Planvas MCP server, or
update boards and tickets from whiteboard context.

Before using the plugin, start Planvas so the MCP server is available:

```text
http://127.0.0.1:18001/sse
```

Install commands from the repository root:

```powershell
# Codex
.\plugins\planvas-ai\scripts\install.ps1 -Target codex -Scope project

# Gemini CLI
.\plugins\planvas-ai\scripts\install.ps1 -Target gemini-cli -Scope project

# Antigravity CLI
.\plugins\planvas-ai\scripts\install.ps1 -Target antigravity-cli -Scope project

# Claude Code
claude mcp add --transport sse planvas http://127.0.0.1:18001/sse
.\plugins\planvas-ai\scripts\install.ps1 -Target claude-code -Scope project

# GitHub Copilot
.\plugins\planvas-ai\scripts\install.ps1 -Target github-copilot -Scope project

# OpenCode
.\plugins\planvas-ai\scripts\install.ps1 -Target opencode -Scope project
```

Install for every supported target:

```powershell
.\plugins\planvas-ai\scripts\install.ps1 -Target all -Scope project
```

You can also install from inside Planvas:

1. Open a Project.
2. Open Project Settings.
3. In `Connect to your AI agent`, choose the tool.
4. Use `Copy` to copy the project-scoped command, or `Run` to run the bundled installer.

The Project Settings installer always targets the selected Project path. It does
not install into the user-global tool directory.

The plugin includes:

- `skills/planvas-mcp/`: shared skill for supported AI tools.
- `references/read-page.md`: use for read-only page analysis and ticket updates.
- `references/mcp-tools.md`: use when calling Planvas MCP tools.
- `references/xml-write-schema.md`: use only for direct XML fallback or schema repair.
- `.mcp.json` and adapter snippets for MCP clients.
- `gemini-extension.json` for Gemini CLI extension install.
- `.codex-plugin/plugin.json` for Codex plugin packaging.

See `plugins/planvas-ai/INSTALL.md` for tool-specific details.

---
