# Note 編輯與儲存機制總體檢（AI ↔ 人 協作情境）

> 背景:核心使用情境是「AI(Claude Code / MCP)直接改 `.pv_project/*.md`,同時使用者在 UI 上看 note、在 Page(Markdown 分頁)或 Canvas(note_paper)編輯 note」。
> 實際症狀:**編輯到一半內容被改回舊版**。
> 本文件盤點現況機制、指出競態根因、並提出調整建議。
> 檢查日期:2026-07-05(程式碼以當日 working tree 為準)

---

## 1. 現況機制盤點

### 1.1 資料儲存

- Note 內容存在 `<project>/.pv_project/<name>.md`,一個 note 一個檔案。
- Page XML(`*.semantic.xml` / `*.presentation.xml`)只存 `data_json.noteFile` 指標,不存 note 本文。
- `note_paper` 讀取時由後端把 `.md` 內容填回 `item.content`(`backend/src/storage/markdownNotes.ts:30-48`)。

### 1.2 寫入 `.md` 的所有路徑(共 4 條)

| # | 路徑 | 進入點 | 寫法 | 併發防護 |
|---|------|--------|------|----------|
| 1 | Page 編輯器存檔 | `PATCH /projects/:id/notes/:file` → `updateProjectNote`(`backend/src/storage/whiteboardRepositoryCore.ts:521-549`) | `fs.writeFile` **非 atomic** | **無**(無版本/mtime 檢查,last-write-wins) |
| 2 | Canvas 整版存檔 | `PUT /pages/:id/board-state` → `persistPageBoard` → `writePageXmlFile`(`backend/src/storage/pageXml.ts:96-109`)→ 每個 note_paper 走 `writeMarkdownBackedNote`(`markdownNotes.ts:50-87`) | `fs.writeFile` **非 atomic** | **無**;只要 `item.content !== null` 就整檔覆寫 |
| 3 | AI 經 MCP | `planvas_write_note`(`backend/src/mcp.ts:337-348`) | tmp + rename,**atomic** ✅ | **無**(整檔覆寫,無 expected-version 參數) |
| 4 | AI 直接改檔 | Claude Code 直接 Edit `.md` | 視工具而定 | 無 |

另外:Page XML 每次任何 board 異動都是「讀整頁 → 改 → 整頁覆寫」(`repositoryStorageContext.ts:751-763`),XML/JSON 有 atomic write,但同樣**沒有版本檢查**。

### 1.3 前端兩個編輯器

| | Page 編輯器(MarkdownEditor) | Canvas note_paper |
|---|---|---|
| 檔案 | `frontend/src/components/MarkdownEditor.tsx` | `frontend/src/items/NotePaper.tsx` + `components/canvas/Canvas.tsx` |
| Autosave | 5 秒 debounce(`AUTOSAVE_DELAY_MS`,行 16),另在 blur/pagehide/unmount/Ctrl+S flush | 5 秒 debounce(`ITEM_SAVE_DELAY`,`constants/canvas.ts:6`),只在 **Canvas unmount** 才 flush(`Canvas.tsx:977-985`),**blur 不 flush** |
| 存檔 payload | 單一 note 的 `{ content }` | **整個 board**(`replacePageBoardState`);`prepareBoardItemsForSave`(`Canvas.tsx:183-206`)會把「內容沒變」的 note_paper `content` 設為 null 以避免重寫 `.md` |
| 未存草稿保護 | 有:module 級 `draftCache` + `hasUnsavedDraft()`(行 19-23),外部更新不會蓋掉有草稿的 note | **幾乎沒有**:只靠 `editingId` 跳過「正在編輯的那一個 item」(`Canvas.tsx:632-636`) |

兩個編輯器互斥(開 note 分頁時 Canvas unmount,`App.tsx:922-930` 附近),所以不會同時掛載。

### 1.4 外部變更如何進到 UI

- **沒有檔案監看(chokidar/fs.watch)、沒有 WebSocket/SSE 推播**(後端唯一 SSE 是 MCP transport,與 UI 無關)。
- 只靠兩個時機拉資料:
  1. **視窗 focus / 分頁 visibilitychange**(`frontend/src/hooks/useWorkspaceData.ts:622-644`)→ `checkProjectNotesChanged`(行 408-463):重抓 notes 清單,逐檔比對 title/content;有 page 編輯器草稿的檔不自動套用,改亮 sidebar 的「有更新」小紅點(`WorkspaceSidebar.tsx:440-460`)。
  2. **Sidebar 手動 Refresh** → `refreshProjectNotes`(行 361-385):**無條件**以磁碟內容覆蓋 `projectNotes` state。
- `projectNotes` 變動後,Canvas 用 effect 把 note 內容同步進 note_paper items:`Canvas.tsx:626-642` → `syncMarkdownBackedItems`(`frontend/src/services/noteSync.ts:26-64`),只跳過 `editingId` 那一個 item。
- **Board(XML)本身沒有任何外部變更偵測**:AI 改了 page XML(搬 item、加 item),UI 要等切頁/重載才看得到。

---

## 2. 問題清單(依嚴重度排序)

### P1|Canvas 存檔 round-trip 期間打的字會被回滾 ← 最符合「編輯到一半被改回來」

位置:`Canvas.tsx:393-434`(`saveCurrentBoardState` 的 server merge-back)。

流程:autosave 送出 `PUT board-state`(async)→ 使用者這段期間**還在打字** → response 回來後,程式把 server 回讀的 `title/content/data_json` 直接寫回 local items,只要跟目前內容不同就覆蓋(行 401-415)。這段 merge-back **不看 `editingId`、也不檢查「本地內容是否在送出後又變了」** → 送出後新打的字被 server 舊值蓋掉,游標中內容瞬間回退。頁面越大(整版 PUT 越慢)、打字越快,越容易中。

### P2|Canvas note blur 後的 5 秒空窗,focus 事件會把未存內容改回磁碟版

位置:`Canvas.tsx:626-642` + `noteSync.ts:39-61` + `useWorkspaceData.ts:622-644`。

流程:在 note_paper 打完字點外面(blur → `editingId=null`,`useCanvasEditSession.ts` / `NotePaper.tsx` onBlur)→ autosave 還要等最多 5 秒(blur **不會** flush)→ 這時切去終端機叫 Claude、再切回瀏覽器 → focus 觸發 `checkProjectNotesChanged` → `syncMarkdownBackedItems` 看到 `item.content !== note.content` 且該 item 已不是 `editingId` → **未存的編輯被磁碟舊內容覆蓋**。AI 協作流程必然頻繁切視窗,此路徑命中率極高。

加重因素:
- `checkProjectNotesChanged` 每次都回傳**新的 array reference**(`useWorkspaceData.ts:447-457`),即使內容全同,每次 focus 都會重跑 Canvas 同步 effect(對照 `refreshProjectNotes` 行 373-378 有做 same-reference 最佳化)。
- 正在編輯 A note 時,只有 A 被 `editingId` 保護;若 B note 也有未存變更(理論上少見,但存檔失敗重試時會發生),B 會被直接蓋掉。
- `hasUnsavedDraft` 只查 page 編輯器的 `draftCache`,**完全不知道 canvas 的未存編輯**(`useWorkspaceData.ts:431`)。

### P3|後端完全沒有併發控制:雙向 lost update

位置:`whiteboardRepositoryCore.ts:539`、`validation.ts`(`validateNoteUpdate` 只收 `{content}`)、`mcp.ts:337-348`。

- **UI 蓋掉 AI**:使用者基於舊版 A 編輯,期間 Claude 寫入 B;使用者 5 秒 autosave PATCH 無條件覆寫 → B 無聲消失。UI 的草稿保護只擋「磁碟變更蓋 UI」,不擋「UI 蓋磁碟」。
- **AI 蓋掉 UI**:`planvas_write_note` 是整檔覆寫,若 AI 讀 note 到寫回之間使用者剛存檔,使用者內容消失(skills/SKILL.md 只提醒 AI「寫後讀回驗證」,無機制保證)。
- 沒有任何 409/conflict 概念,雙方都以為自己成功了。

### P4|UI 整版 board 存檔會刪掉 AI 剛加的 board items

位置:`replacePageBoardState`(`whiteboardRepositoryCore.ts:1136-1151`)+ `Canvas.tsx:372-390`。

UI 載入 board 後,AI 經 MCP `planvas_add_item` 加了新 item(或搬動、改 XML);UI 端 in-memory board 不知道 → 使用者只要動一下畫布(拖個便利貼),5 秒後整版 `PUT board-state` 用前端狀態**全量取代** → AI 新增的 items/connectors 被刪除、AI 的變更被回滾。board XML 沒有 focus-poll,UI 根本沒機會發現。

### P5|note `.md` 寫入非 atomic

位置:`updateProjectNote`(`whiteboardRepositoryCore.ts:539`)、`writeMarkdownBackedNote`(`markdownNotes.ts:70`)、`renameProjectNoteFile`(`repositoryStorageContext.ts:852`)。

XML/JSON 都已用 tmp+rename(`paths.ts:144-159`、`pageXml.ts:306-345`),唯獨 note `.md` 是直接 `writeFile`。AI(或 focus-poll 的 `listProjectNotes`)讀到寫一半的截斷內容後,再整檔寫回 → 資料損毀放大。MCP 端反而已是 atomic,兩邊不一致。

### P6|次要問題

- `refreshProjectNotes`(sidebar Refresh 鈕、canvas 存檔後回呼 `App.tsx:996-1003`)無條件覆蓋 `projectNotes`,不看草稿;page 編輯器靠第二層防線(`MarkdownEditor.tsx:151` 的 local-state guard)才沒事,canvas 未存編輯則無防線。
- `hasProjectNoteUpdates` 一旦亮起,`refreshCurrentProjectFromDisk` 就**停止再檢查**(`useWorkspaceData.ts:471`),之後的外部變更要等使用者手動 Refresh 才看得到。
- `MarkdownEditor.performSave` 成功後 `draftCache.delete`(行 173):若存檔 in-flight 期間又打了字,新草稿曾被短暫刪除(下個 keystroke 會補回;靠 Layer B guard 撐著,邏輯脆弱)。
- `listProjectNotes` 的 `updated_at` 來自 mtime(行 514)但從未用於併發判斷;前端比對靠全文 `content !==`,note 多/大時 focus-poll 成本線性成長。

---

## 3. 建議調整

### 短期(低風險、直接止血,建議先做 S1-S4)

- **S1|修 P1:merge-back 不要蓋新字**(`Canvas.tsx:393-438`)
  存檔前記下送出的 `itemsToPersist` 快照;response 回來只在「item 目前內容仍等於送出時內容」才套用 server 值,且一律跳過 `editingId`。內容已再變者保留本地值並重新 `triggerSave`。

- **S2|修 P2:blur 即 flush + canvas 草稿註冊**
  1. `handleCommitEdit`(結束 note 編輯)時呼叫 `flushPendingItemSave()`(`Canvas.tsx:489-495`),把 5 秒空窗關掉。
  2. 建立跨元件的 dirty-note registry(比照 `draftCache`,key = `projectId:noteFile`):canvas note 內容改動時登記、成功存檔後移除;`checkProjectNotesChanged`(`useWorkspaceData.ts:431`)與 `syncMarkdownBackedItems` 都改查這個 registry,而非只查 page 編輯器草稿 / 單一 `editingId`。

- **S3|修 P3:樂觀鎖(optimistic concurrency)**
  - `ProjectNote` 帶 `revision`(mtimeMs 或 content hash);`PATCH /notes/:file` 增加 `base_revision`,後端寫入前比對磁碟,不符回 **409 + 磁碟現況**。
  - 前端收到 409:不覆寫,跳「磁碟已被修改」對話框(保留我的 / 採用磁碟 / 並排 diff)。
  - `planvas_write_note` 增加選用 `expected_revision`(或 `if_unchanged_hash`)參數,並在 SKILL.md 要求 AI 走 read→write 帶 revision;衝突時 MCP 回錯誤讓 AI 重讀再合併。

- **S4|修 P5:`.md` 改 atomic write**
  `updateProjectNote`、`writeMarkdownBackedNote`、`renameProjectNoteFile` 統一改 tmp+rename(可直接沿用 `paths.ts` 的 `writeJsonAtomic` 模式抽共用 helper)。

- **S5|小修**:`checkProjectNotesChanged` 無變更時回傳原 reference(比照 `refreshProjectNotes`);`refreshProjectNotes` 也尊重 dirty registry;`hasProjectNoteUpdates` 亮起後仍持續檢查、只是不自動套用。

### 中期(架構補強)

- **M1|後端加檔案監看 + 推播,取代 focus-poll**
  chokidar 監看 `.pv_project/`(`.md` + `*.xml`),SSE/WebSocket 推 `{file, mtime, kind}` 給前端;前端以 dirty registry + revision 決定「自動套用 / 亮衝突提示」。自家寫入用 write-token 或 mtime 記帳做 echo suppression。AI 改動可即時出現在畫面上,才是真「協作看得到」。

- **M2|修 P4:board 存檔不要全量 last-write-wins**
  最低成本:page XML 也加 revision(讀 board-data 時帶回,`PUT board-state` 帶上,不符 → 409 讓前端 reload 合併)。較完整:UI 改送 item-level diff(後端已有granular endpoints),或後端以 item id 做三方合併(UI 未動過的 item 保留磁碟版,AI 新增 item 不會被刪)。

- **M3|note 內容與 board 幾何分流**
  Canvas 的 note_paper 內容編輯改走單一 note 的 `PATCH /notes/:file`(與 page 編輯器同一條路),`PUT board-state` 一律送 `content: null` 只管幾何/指標。好處:note 寫入只剩一條 UI 路徑,S3 的版本檢查一次涵蓋;整版 board 存檔永遠不會碰 `.md`。

### 長期(真正的 AI-人共編)

- **L1**:note 級 revision history(存 `.pv_project/.history/` 或 git),衝突時可 diff/回復,AI 誤蓋也能救。
- **L2**:若要即時共編,考慮 note 內容走 CRDT(如 Yjs)或 server 端 three-way merge;但以 local-first 單人+AI 的定位,「revision 檢查 + 衝突對話框 + 檔案監看推播」(S3+M1)通常已足夠,建議先驗證再決定是否投資 CRDT。

### 建議實作順序

`S1 → S2 → S4 → S3 → S5 → M1 → M3 → M2`,P1/P2 是使用者天天撞到的回滾,先修;S3/M1 解決 AI 協作的 lost update;M2/M3 收尾結構性風險。

---

## 3.5 簡化方案:採「回合制協作」假設

若明確假設**人和 AI 不會同時編輯同一個 page/note**(你改完 → 換 AI 改 → 你再看,回合輪流),範圍可大幅縮小。但注意:**P1、P2 與 AI 無關,單人使用就會發生**(P2 只要「打字 → blur → 5 秒內切視窗再切回」就中,磁碟內容沒被任何人動過也一樣),所以症狀主因不會因為這個假設消失。

回合制下仍會中的還有 P4 的變形:UI 掛載期間從不重載 board XML,AI 上一回合加的 item,會被你下一次隨手觸發的整版存檔刪掉——這是「UI 拿過期狀態全量覆寫」,不是同時編輯。

**簡化後只需四件事:**

| 順序 | 項目 | 對應問題 | 狀態 |
|------|------|----------|------|
| 1 | S1 merge-back 保護 | P1 | ✅ 已實作(2026-07-05) |
| 2 | S2 blur 即 flush + canvas dirty 保護 | P2 | ✅ 已實作(2026-07-05) |
| 3 | **F1(新)focus 時重載 board** | P4 | ✅ 已實作(2026-07-05) |
| 4 | S4 `.md` atomic write | P5 | ✅ 已實作(2026-07-05) |

### 實作紀錄(2026-07-05)

- **S1**(`Canvas.tsx`):merge-back 抽成純函式 `mergeServerNoteMetadataAfterSave`——存檔期間又被編輯的 note 保留本地文字、只採用 server 端的 noteFile 指標,並把「實際落盤的內容」記進 `lastSavedItemsRef`,存檔迴圈立即補存新文字。另把 `saveCurrentBoardState` 改為 in-flight 序列化(do-while + `saveInFlightRef`/`saveQueuedRef`),不再有兩個整版 PUT 併發互蓋。
- **S2**(`Canvas.tsx`、`noteSync.ts`):inline 編輯 blur 時立即 `flushPendingItemSave()` 關閉 5 秒空窗;note 同步 effect 改為跳過「所有內容尚未落盤」的 note item(與 `lastSavedItemsRef` 比對),`syncMarkdownBackedItems` 支援傳入 skip id 集合。`checkProjectNotesChanged` 無變更時回傳原 array reference(`useWorkspaceData.ts`),focus 不再無謂重跑同步。
- **F1**(`Canvas.tsx`):新增視窗 focus / visibilitychange 時重拉 `GET /pages/:id/board-data`,僅在本地完全乾淨(無 pending autosave、無 in-flight 存檔、非編輯中、非拖曳中、狀態 saved)時套用;以忽略 `updated_at` 的等值比較避免無變更時重繪,套用後重設 undo history 防止 undo 復活舊 board。
- **S4**(backend):新增 `writeTextAtomic`(tmp+rename,`paths.ts`),`updateProjectNote`、`writeMarkdownBackedNote`、`renameProjectNoteFile`、MCP `planvas_write_note` 全部改用。暫存檔改用 `.tmp` 副檔名且 `listProjectNotes` 過濾 dotfiles——修掉「暫存檔/殘留檔被當成 note 列出」的隱藏問題。
- 驗證:frontend vitest 197 全過(含新增的 merge-back / skip-set / 等值比較測試)、frontend typecheck 過、backend 測試套件全過。P3(樂觀鎖 409)依簡化方案延後未做。

### 第二輪:寫入路徑收斂 + 全程序寫入鎖(2026-07-05)

- **MCP 走 repository**:repository 新增 `writeProjectNote`(upsert,共用檔名驗證與 atomic 寫入);MCP `planvas_write_note` 改呼叫它,不再自行拼路徑直寫檔案。note 檔名驗證同時收緊:拒絕 dotfile 名稱。
- **全程序寫入鎖**(`backend/src/storage/writeLock.ts`):HTTP 非 GET route 與 MCP 非唯讀工具共用同一把 promise-chain mutex,UI 存檔與 AI 寫入不可能再交錯「讀整頁→改→寫整頁」。讀取不上鎖(檔案已全部 atomic 寫入,最多讀到略舊、不會讀到半截)。
- 例外:`POST /projects/:id/publish` 標記 `mutates: false`——它在本地只讀不寫(寫入發生在接收端 `/cloud/publish`),且鎖住它會在同 process 自打 cloud endpoint 時死鎖(後端測試實際抓到這個)。
- 後續項目(draft store 重構、cache revalidate、S3 降級版、listProjectNotes mtime 快取、Playwright e2e)已編入 `todo_list.md` 的「Note Editing Concurrency Notes」。

### 第三輪:note 分頁存檔後切回 page 自動更新(2026-07-05)

- **根因**:`handleNoteSaved` 只更新 `projectNotes` state;切回 page 時 Canvas 用記憶體 cache 掛載,note 同步 effect 在 items 尚未載入時跑過一次就不再跑 → 「先存檔再切回」看到舊內容;「沒存檔就切回」反而因 unmount flush 的時序而會更新(使用者感覺時好時壞的來源)。
- **修法**(`Canvas.tsx`):loader 落地 board 資料時 bump `boardLoadTick`,note 同步 effect 把它納入 deps,board 載入完成後對著已更新的 `projectNotes` 補跑一次同步。
- **順修一個 S2 後遺症**:外部同步把 note 內容套進 item 後,現在會同步更新 `lastSavedItemsRef` baseline(套進來的內容本來就是磁碟狀態)——否則該 item 會被永久誤判為 dirty,之後所有外部更新都被跳過。
- 驗證:frontend typecheck 過、vitest 197 全過。

**可砍掉/降級:** S3 降級為後端防呆(revision 不符 → 拒絕 + 前端重抓,不做衝突 UI)或先不做;M1 推播、M2 三方合併、M3 內容分流、L2 CRDT 全部延後。驗收情境第 3 條(409 衝突)對應調整,其餘照舊。

---

## 4. 驗收情境(修完後逐條驗)

1. Canvas note 連續打字 30 秒(跨多次 autosave),字不消失。
2. Canvas note 打字 → blur → 3 秒內切去終端機再切回 → 內容仍在,且 5 秒內落盤。
3. UI 開著 note(page 編輯器有草稿)→ Claude `planvas_write_note` 改同一檔 → UI 不自動蓋草稿、出現衝突提示;使用者存檔時得到 409 而非無聲覆寫。
4. Claude 直接 Edit `.md` → 切回瀏覽器,無草稿時內容自動更新;canvas 上同名 note_paper 同步更新。
5. UI 載入 board 後,Claude 用 MCP 加一個 sticky → 使用者拖動別的 item 觸發存檔 → Claude 加的 sticky 不會消失。
6. 大檔 note(>1MB)存檔期間由 AI 讀取,讀不到截斷內容。
