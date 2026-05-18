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

## 使用方式

### 開發模式（前後端同時啟動）

```powershell
npm run dev
```

啟動後用瀏覽器開啟：

```
http://127.0.0.1:5173
```

> 如果啟動失敗、提示 port 被佔用，先執行：
> ```powershell
> npm run dev:stop
> ```
> 再重新 `npm run dev`。

---

### 單 Port 模式（適合分享給他人使用，只需一個網址）

先建置 frontend：

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

| 物件類型 | 說明 |
|---|---|
| `text_box` | 文字方塊 |
| `sticky_note` | 便利貼 |
| `note_paper` | Markdown 筆記（對應一個 `.md` 檔） |
| `frame` | 容器框，可收合展開，可容納 small_item |
| `line` | 線條 |
| `table` | 表格 |
| `arrow` | 箭頭連接器，可連結任何物件 |

### Frame 收合行為

Frame 收合後，其中的物件顯示如下：

- `text_box`：顯示完整文字
- `sticky_note`：顯示部分文字
- `note_paper`：只顯示第一個 Markdown H1 標題

### Note Paper 筆記

- 在白板上建立 `note_paper` 後，後端會對應建立一個 `.md` 檔
- 在白板上的 `note_paper` 右上角可切換「展開內容」與「只顯示標題」兩種模式
- 選取 `note_paper` 後，右側 Inspector 的「Markdown file」欄位可以重新命名對應的 `.md` 檔
- 同一份 `.md` 檔可以被多個 Page 或多次放置，編輯其中一個等同編輯同一份檔案
- 從 Page 刪除 `note_paper` 只移除白板上的擺放，不刪除 `.md` 檔案

### 頁面匯出 / 匯入

在工作區頂部 header 可操作：

| 功能 | 說明 |
|---|---|
| **Export JSON** | 匯出目前頁面為 `.whiteboard-page.json` |
| **Import JSON** | 將 `.whiteboard-page.json` 匯入目前頁面（疊加模式，不覆蓋） |
| **Export PNG** | 匯出目前頁面為 `.png` 圖片（自動裁切至有內容區域） |
| **Export PPTX** | 匯出目前頁面為 `.pptx` 簡報（單張投影片） |

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
