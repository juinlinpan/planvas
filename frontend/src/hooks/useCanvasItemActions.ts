import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useState,
} from 'react';
import {
  type BoardItem,
  type BoardItemPayload,
  type ConnectorLink,
} from '../services/api';
import type { BoardSnapshot } from '../utils/boardHistory';
import { PASTE_OFFSET_STEP } from '../constants/canvas';
import { relayoutTableItems } from '../canvasHelpers/tableLayout';
import { clampItemSize } from '../canvasHelpers/frameLayout';
import {
  expandSelectionItemIds,
  getUniqueItemIds,
  isInlineEditable,
} from '../canvasHelpers/selection';
import {
  reorderItemsForLayer,
  sortItemsForClipboard,
} from '../canvasHelpers/layerOrdering';
import { toPayload } from '../canvasHelpers/payloadConversion';
import {
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ProjectDefaultStyle,
} from '../items/itemStyles';
import type {
  ClipboardSnapshot,
  ConnectorsUpdater,
  EditSessionState,
  ItemsUpdater,
  SegmentDraftState,
} from '../types/canvas';
import { buildSegmentGeometry } from '../utils/export/segmentData';
import {
  createTableData,
  parseTableData,
  serializeTableData,
} from '../tableData/tableData';
import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_TYPE,
  type ActiveTool,
} from '../types/index';
import type { AnchorHit, LayerAction } from '../canvasHelpers/types';

function getNoteFileName(item: BoardItem): string | null {
  if (item.type !== ITEM_TYPE.note_paper || item.data_json === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(item.data_json) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { noteFile?: unknown }).noteFile === 'string'
    ) {
      return (parsed as { noteFile: string }).noteFile;
    }
  } catch {
    return null;
  }

  return null;
}

function isTextStyleChildItem(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

function getTableChildItemIds(item: BoardItem): Set<string> {
  if (item.type !== ITEM_TYPE.table) {
    return new Set();
  }

  const tableData = parseTableData(item.data_json);
  return new Set(
    tableData.cells.flat().flatMap((cell) => cell?.childItemIds ?? []),
  );
}

function getChangedTableTextStylePatch(
  previous: BoardItem | null,
  updated: BoardItem,
): BoardItemStyle | null {
  if (
    previous === null ||
    previous.type !== ITEM_TYPE.table ||
    updated.type !== ITEM_TYPE.table ||
    previous.style_json === updated.style_json
  ) {
    return null;
  }

  const previousStyle = parseBoardItemStyle(previous.style_json);
  const updatedStyle = parseBoardItemStyle(updated.style_json);
  const patch: BoardItemStyle = {};

  if (previousStyle.textColor !== updatedStyle.textColor) {
    patch.textColor = updatedStyle.textColor;
  }
  if (previousStyle.fontSize !== updatedStyle.fontSize) {
    patch.fontSize = updatedStyle.fontSize;
  }
  if (previousStyle.fontWeight !== updatedStyle.fontWeight) {
    patch.fontWeight = updatedStyle.fontWeight;
  }
  if (previousStyle.fontStyle !== updatedStyle.fontStyle) {
    patch.fontStyle = updatedStyle.fontStyle;
  }

  return previousStyle.textColor !== updatedStyle.textColor ||
    previousStyle.fontSize !== updatedStyle.fontSize ||
    previousStyle.fontWeight !== updatedStyle.fontWeight ||
    previousStyle.fontStyle !== updatedStyle.fontStyle
    ? patch
    : null;
}

function applyTextStylePatch(
  item: BoardItem,
  patch: BoardItemStyle,
): BoardItem {
  const currentStyle = parseBoardItemStyle(item.style_json);
  return {
    ...item,
    style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
  };
}

function createOptimisticId(): string {
  return `optimistic-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

export function generateUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildClipboardPayload(
  item: BoardItem,
  projectDefaultStyle: ProjectDefaultStyle = {},
): BoardItemPayload {
  const payload = toPayload(item);

  if (item.type !== ITEM_TYPE.sticky_note) {
    return payload;
  }

  const parsedStyle = parseBoardItemStyle(item.style_json);
  if (parsedStyle.backgroundColor !== undefined) {
    return payload;
  }

  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  return {
    ...payload,
    style_json: serializeBoardItemStyle({
      ...parsedStyle,
      backgroundColor: resolvedStyle.backgroundColor,
    }),
  };
}

const CLIPBOARD_STORAGE_KEY = 'planvas_clipboard';
const PASTE_COUNT_STORAGE_KEY = 'planvas_paste_count';

let memoryClipboard: ClipboardSnapshot | null = null;
let memoryPasteCount = 0;

export function getClipboardData(): ClipboardSnapshot | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as ClipboardSnapshot;
      }
    }
  } catch (e) {
    console.error('Failed to read clipboard from localStorage', e);
  }
  return memoryClipboard;
}

export function setClipboardData(data: ClipboardSnapshot | null) {
  memoryClipboard = data;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (data === null) {
        window.localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(data));
      }
    }
  } catch (e) {
    console.error('Failed to write clipboard to localStorage', e);
  }
}

export function getPasteCount(): number {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PASTE_COUNT_STORAGE_KEY);
      if (raw) {
        return parseInt(raw, 10) || 0;
      }
    }
  } catch (e) {
    console.error('Failed to read paste count from localStorage', e);
  }
  return memoryPasteCount;
}

export function setPasteCount(count: number) {
  memoryPasteCount = count;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PASTE_COUNT_STORAGE_KEY, String(count));
    }
  } catch (e) {
    console.error('Failed to write paste count to localStorage', e);
  }
}

interface UseCanvasItemActionsParams {
  pageId: string;
  itemsRef: MutableRefObject<BoardItem[]>;
  connectorsRef: MutableRefObject<ConnectorLink[]>;
  selectedIdsRef: MutableRefObject<string[]>;
  editSessionRef: MutableRefObject<EditSessionState | null>;
  editingId: string | null;
  primarySelectedId: string | null;
  captureBoardSnapshot: () => BoardSnapshot;
  pushUndoSnapshot: (snapshot: BoardSnapshot) => void;
  setItemsAndSync: (updater: ItemsUpdater, silent?: boolean) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater, silent?: boolean) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setActiveTool: (tool: ActiveTool) => void;
  setAnchorIndicatorItems: Dispatch<SetStateAction<BoardItem[]>>;
  setActiveAnchorHit: Dispatch<SetStateAction<AnchorHit | null>>;
  projectDefaultStyle?: ProjectDefaultStyle;
  onProjectNotesChanged?: () => void;
  triggerSave?: (immediate?: boolean) => void;
}

export function useCanvasItemActions({
  pageId,
  itemsRef,
  connectorsRef,
  selectedIdsRef,
  editSessionRef,
  editingId,
  primarySelectedId,
  captureBoardSnapshot,
  pushUndoSnapshot,
  setItemsAndSync,
  setConnectorsAndSync,
  setSelection,
  setEditingId,
  setActiveTool,
  setAnchorIndicatorItems,
  setActiveAnchorHit,
  projectDefaultStyle = {},
  onProjectNotesChanged,
  triggerSave,
}: UseCanvasItemActionsParams) {
  const [isPasting, setIsPasting] = useState(false);

  const handleDeleteItems = useCallback(
    (itemIds: string[]) => {
      const deleteIds = getUniqueItemIds(itemIds).filter((itemId) =>
        itemsRef.current.some((item) => item.id === itemId),
      );
      if (deleteIds.length === 0) {
        return;
      }

      const deleteIdSet = new Set(deleteIds);
      const snapshotBeforeDelete = captureBoardSnapshot();

      const relatedConnectors = connectorsRef.current.filter(
        (connector) =>
          deleteIdSet.has(connector.connector_item_id) ||
          (connector.from_item_id !== null &&
            deleteIdSet.has(connector.from_item_id)) ||
          (connector.to_item_id !== null &&
            deleteIdSet.has(connector.to_item_id)),
      );
      const relatedItemIds = new Set<string>([
        ...deleteIds,
        ...relatedConnectors.map((connector) => connector.connector_item_id),
      ]);
      const relatedConnectorIds = new Set(
        relatedConnectors.map((connector) => connector.id),
      );

      setItemsAndSync((current) => {
        // Collect table items that need their childItemIds cleaned up
        const tableUpdates = new Map<string, string>();
        for (const item of current) {
          if (
            item.type !== ITEM_TYPE.table ||
            relatedItemIds.has(item.id)
          ) {
            continue;
          }
          const tableData = parseTableData(item.data_json);
          let changed = false;
          const updatedCells = tableData.cells.map((row) =>
            row.map((cell) => {
              if (!cell) return cell;
              const filtered = cell.childItemIds.filter(
                (cid) => !relatedItemIds.has(cid),
              );
              if (filtered.length !== cell.childItemIds.length) {
                changed = true;
                return { ...cell, childItemIds: filtered };
              }
              return cell;
            }),
          );
          if (changed) {
            tableUpdates.set(
              item.id,
              serializeTableData({ ...tableData, cells: updatedCells }),
            );
          }
        }

        return current
          .filter((item) => !relatedItemIds.has(item.id))
          .map((item) => {
            if (tableUpdates.has(item.id)) {
              return { ...item, data_json: tableUpdates.get(item.id)! };
            }
            if (
              item.parent_item_id !== null &&
              deleteIdSet.has(item.parent_item_id) &&
              !deleteIdSet.has(item.id)
            ) {
              return { ...item, parent_item_id: null };
            }
            return item;
          });
      }, true);
      setConnectorsAndSync((current) =>
        current.filter((connector) => !relatedConnectorIds.has(connector.id)),
      true);
      setSelection(
        selectedIdsRef.current.filter((itemId) => !relatedItemIds.has(itemId)),
      );

      if (editingId !== null && relatedItemIds.has(editingId)) {
        setEditingId(null);
      }
      pushUndoSnapshot(snapshotBeforeDelete);

      triggerSave?.(true);
    },
    [
      captureBoardSnapshot,
      connectorsRef,
      editingId,
      itemsRef,
      pushUndoSnapshot,
      selectedIdsRef,
      setConnectorsAndSync,
      setEditingId,
      setItemsAndSync,
      setSelection,
      onProjectNotesChanged,
      triggerSave,
    ],
  );

  const handleDeleteSelection = useCallback(async () => {
    await handleDeleteItems(selectedIdsRef.current);
  }, [handleDeleteItems, selectedIdsRef]);

  const handleLayerChange = useCallback(
    (action: LayerAction) => {
      const targetId = primarySelectedId;
      if (targetId === null) {
        return;
      }

      const currentItems = itemsRef.current;
      const snapshotBeforeLayerChange = captureBoardSnapshot();
      const nextItems = reorderItemsForLayer(currentItems, targetId, action);
      const currentById = new Map(currentItems.map((item) => [item.id, item]));
      const changedItems = nextItems.filter((item) => {
        const currentItem = currentById.get(item.id);
        return currentItem?.z_index !== item.z_index;
      });

      if (changedItems.length === 0) {
        return;
      }

      pushUndoSnapshot(snapshotBeforeLayerChange);
      setItemsAndSync(nextItems, true);
      triggerSave?.(true);
    },
    [
      captureBoardSnapshot,
      itemsRef,
      primarySelectedId,
      pushUndoSnapshot,
      setItemsAndSync,
      triggerSave,
    ],
  );

  const handleCopySelection = useCallback(() => {
    const selectedItems = sortItemsForClipboard(
      expandSelectionItemIds(itemsRef.current, selectedIdsRef.current)
        .map((itemId) => itemsRef.current.find((item) => item.id === itemId))
        .filter((item): item is BoardItem => item !== undefined),
    );
    if (selectedItems.length === 0) {
      return;
    }

    setClipboardData({
      items: selectedItems.map((item) => ({
        sourceId: item.id,
        payload: buildClipboardPayload(item, projectDefaultStyle),
      })),
    });
    setPasteCount(0);
  }, [itemsRef, projectDefaultStyle, selectedIdsRef]);

  const hasClipboardData = useCallback(() => {
    const clipboard = getClipboardData();
    return clipboard !== null && clipboard.items.length > 0;
  }, []);

  const handleCutSelection = useCallback(async () => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    handleCopySelection();
    await handleDeleteSelection();
  }, [handleCopySelection, handleDeleteSelection, selectedIdsRef]);

  const handlePasteSelection = useCallback(() => {
    const clipboard = getClipboardData();
    if (clipboard === null || clipboard.items.length === 0) {
      return;
    }
    const snapshotBeforePaste = captureBoardSnapshot();

    const nextPasteCount = getPasteCount() + 1;
    const offset = PASTE_OFFSET_STEP * nextPasteCount;
    const existingItemIds = new Set(itemsRef.current.map((item) => item.id));
    const createdIdBySourceId = new Map<string, string>();
    const rootSourceId = clipboard.items[0]?.sourceId ?? null;
    const zBase =
      itemsRef.current.length === 0
        ? 0
        : Math.max(...itemsRef.current.map((item) => item.z_index)) + 1;

    setIsPasting(true);
    try {
      // Map all source IDs to new generated UUIDs upfront
      for (const entry of clipboard.items) {
        createdIdBySourceId.set(entry.sourceId, generateUUID());
      }

      const timestamp = new Date().toISOString();
      const createdItems: BoardItem[] = [];

      for (const [index, entry] of clipboard.items.entries()) {
        const newId = createdIdBySourceId.get(entry.sourceId)!;
        const sourceParentId = entry.payload.parent_item_id;
        const parentItem = sourceParentId !== null ? itemsRef.current.find((it) => it.id === sourceParentId) : null;
        const isParentTable = parentItem?.type === ITEM_TYPE.table;

        const nextParentId =
          sourceParentId !== null && createdIdBySourceId.has(sourceParentId)
            ? (createdIdBySourceId.get(sourceParentId) ?? null)
            : sourceParentId !== null && existingItemIds.has(sourceParentId) && !isParentTable
              ? sourceParentId
              : null;

        // Map child items within table cells if it is a table item
        let nextDataJson = entry.payload.data_json;
        if (entry.payload.type === ITEM_TYPE.table && entry.payload.data_json) {
          try {
            const tableData = parseTableData(entry.payload.data_json);
            const updatedCells = tableData.cells.map((row) =>
              row.map((cell) => {
                if (!cell) return null;
                return {
                  ...cell,
                  childItemIds: cell.childItemIds.map((childId) =>
                    createdIdBySourceId.get(childId) ?? (existingItemIds.has(childId) ? childId : childId)
                  ),
                };
              })
            );
            nextDataJson = serializeTableData({
              ...tableData,
              cells: updatedCells,
            });
          } catch (tableErr) {
            console.error('[Canvas] Failed to remap table childItemIds during paste', tableErr);
          }
        } else if (
          (entry.payload.type === ITEM_TYPE.line || entry.payload.type === ITEM_TYPE.arrow) &&
          entry.payload.data_json
        ) {
          try {
            const parsed = JSON.parse(entry.payload.data_json);
            if (parsed && parsed.kind === 'segment') {
              let changed = false;
              for (const key of ['startConnection', 'endConnection'] as const) {
                const connection = parsed[key];
                if (connection && typeof connection === 'object') {
                  const currentItemId = connection.itemId;
                  if (typeof currentItemId === 'string' && currentItemId.trim().length > 0) {
                    const remappedItemId =
                      createdIdBySourceId.get(currentItemId.trim()) ??
                      (existingItemIds.has(currentItemId.trim()) ? currentItemId.trim() : null);
                    if (remappedItemId !== currentItemId) {
                      if (remappedItemId === null) {
                        parsed[key] = null;
                      } else {
                        parsed[key] = { ...connection, itemId: remappedItemId };
                      }
                      changed = true;
                    }
                  }
                }
              }
              if (changed) {
                nextDataJson = JSON.stringify(parsed);
              }
            }
          } catch (segmentErr) {
            console.error('[Canvas] Failed to remap segment connections during paste', segmentErr);
          }
        }

        const createdItem: BoardItem = {
          id: newId,
          page_id: pageId,
          parent_item_id: nextParentId,
          category: entry.payload.category,
          type: entry.payload.type,
          title: entry.payload.title,
          content: entry.payload.content,
          content_format: entry.payload.content_format,
          x: entry.payload.x + offset,
          y: entry.payload.y + offset,
          width: entry.payload.width,
          height: entry.payload.height,
          rotation: entry.payload.rotation,
          z_index: zBase + index,
          is_collapsed: entry.payload.is_collapsed,
          style_json: entry.payload.style_json,
          data_json: nextDataJson,
          created_at: timestamp,
          updated_at: timestamp,
        };
        createdItems.push(createdItem);
      }

      if (createdItems.length === 0) {
        return;
      }

      pushUndoSnapshot(snapshotBeforePaste);
      setItemsAndSync([...itemsRef.current, ...createdItems], true);
      setPasteCount(nextPasteCount);

      const pastedRootId =
        rootSourceId !== null
          ? (createdIdBySourceId.get(rootSourceId) ?? createdItems[0]?.id ?? null)
          : (createdItems[0]?.id ?? null);
      const pastedSelectionIds = createdItems.map((item) => item.id);
      setSelection(
        pastedRootId === null
          ? pastedSelectionIds
          : [
              ...pastedSelectionIds.filter((itemId) => itemId !== pastedRootId),
              pastedRootId,
            ],
      );
      setEditingId(null);

      triggerSave?.(true);
    } catch (err) {
      console.error('[Canvas] Failed to perform bulk paste', err);
    } finally {
      setIsPasting(false);
    }
  }, [
    captureBoardSnapshot,
    connectorsRef,
    itemsRef,
    onProjectNotesChanged,
    pageId,
    pushUndoSnapshot,
    setConnectorsAndSync,
    setEditingId,
    setItemsAndSync,
    setSelection,
    triggerSave,
  ]);

  const handleCreateItem = useCallback(
    (params: {
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      dataJson?: string | null;
    }) => {
      const snapshotBeforeCreate = captureBoardSnapshot();
      const category =
        ITEM_CATEGORY_FOR_TYPE[params.type] ?? ITEM_CATEGORY.small_item;
      const zIndexes = itemsRef.current.map((item) => item.z_index);
      const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
      const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
      const size = clampItemSize(
        params.type,
        params.width,
        params.height,
        params.dataJson,
      );

      const payload: BoardItemPayload = {
        page_id: pageId,
        parent_item_id: null,
        category,
        type: params.type,
        title: params.type === ITEM_TYPE.frame ? 'New Frame' : null,
        content:
          params.type === ITEM_TYPE.note_paper
            ? '# Untitled note\n'
            : params.type === ITEM_TYPE.line
              ? null
              : '',
        content_format:
          params.type === ITEM_TYPE.note_paper ? 'markdown' : null,
        x: params.x,
        y: params.y,
        width: size.width,
        height: size.height,
        rotation: 0,
        z_index: params.type === ITEM_TYPE.frame ? minZ - 1 : maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json:
          params.dataJson !== undefined
            ? params.dataJson
            : params.type === ITEM_TYPE.table
              ? serializeTableData(createTableData())
              : null,
      };

      const newItem: BoardItem = {
        ...payload,
        id: generateUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      pushUndoSnapshot(snapshotBeforeCreate);
      setItemsAndSync((current) => [...current, newItem], true);
      setSelection([newItem.id]);
      setEditingId(isInlineEditable(newItem) ? newItem.id : null);
      triggerSave?.(true);
    },
    [
      captureBoardSnapshot,
      itemsRef,
      pageId,
      pushUndoSnapshot,
      setEditingId,
      setItemsAndSync,
      setSelection,
      onProjectNotesChanged,
      triggerSave,
    ],
  );

  const handleCreateSegmentItem = useCallback(
    (draft: SegmentDraftState) => {
      const geometry = buildSegmentGeometry(
        draft.start,
        draft.end,
        null,
        draft.startConnection,
        draft.endConnection,
      );
      const zIndexes = itemsRef.current.map((item) => item.z_index);
      const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
      const payload: BoardItemPayload = {
        page_id: pageId,
        parent_item_id: null,
        category: ITEM_CATEGORY_FOR_TYPE[draft.type] ?? ITEM_CATEGORY.shape,
        type: draft.type,
        title: null,
        content: null,
        content_format: null,
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        rotation: geometry.rotation,
        z_index: maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json: geometry.data_json,
      };
      const newItem: BoardItem = {
        ...payload,
        id: generateUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      pushUndoSnapshot(draft.snapshot);
      setItemsAndSync((current) => [...current, newItem], true);
      setSelection([newItem.id]);
      setEditingId(null);
      setActiveTool('select');
      setAnchorIndicatorItems([]);
      setActiveAnchorHit(null);
      triggerSave?.(true);
    },
    [
      itemsRef,
      pageId,
      pushUndoSnapshot,
      setAnchorIndicatorItems,
      setActiveAnchorHit,
      setActiveTool,
      setEditingId,
      setItemsAndSync,
      setSelection,
      triggerSave,
    ],
  );

  const handleItemUpdate = useCallback(
    (updated: BoardItem) => {
      if (editSessionRef.current?.itemId !== updated.id) {
        pushUndoSnapshot(captureBoardSnapshot());
        editSessionRef.current = { itemId: updated.id };
      }

      const previousUpdated =
        itemsRef.current.find((item) => item.id === updated.id) ?? null;
      const previousNoteFile = previousUpdated
        ? getNoteFileName(previousUpdated)
        : null;
      const nextNoteFile = getNoteFileName(updated);
      const shouldPropagateNoteContent =
        updated.type === ITEM_TYPE.note_paper &&
        nextNoteFile !== null &&
        updated.content !== previousUpdated?.content;
      const shouldPropagateNoteRename =
        updated.type === ITEM_TYPE.note_paper &&
        previousNoteFile !== null &&
        nextNoteFile !== null &&
        previousNoteFile !== nextNoteFile;
      const tableTextStylePatch = getChangedTableTextStylePatch(
        previousUpdated,
        updated,
      );
      const tableTextStyleChildIds =
        tableTextStylePatch !== null
          ? getTableChildItemIds(updated)
          : new Set<string>();
      let changedChildIds: string[] = [];
      setItemsAndSync((current) => {
        const nextItems = current.map((item) => {
          if (item.id === updated.id) {
            return updated;
          }

          const itemNoteFile = getNoteFileName(item);
          if (shouldPropagateNoteContent && itemNoteFile === nextNoteFile) {
            return {
              ...item,
              content: updated.content,
              content_format: 'markdown',
            };
          }

          if (shouldPropagateNoteRename && itemNoteFile === previousNoteFile) {
            return {
              ...item,
              content: updated.content,
              content_format: 'markdown',
              data_json: updated.data_json,
            };
          }

          if (
            tableTextStylePatch !== null &&
            isTextStyleChildItem(item) &&
            (tableTextStyleChildIds.has(item.id) ||
              item.parent_item_id === updated.id)
          ) {
            changedChildIds.push(item.id);
            return applyTextStylePatch(item, tableTextStylePatch);
          }

          return item;
        });
        if (updated.type !== ITEM_TYPE.table) {
          changedChildIds = [];
          return nextItems;
        }
        const relayoutResult = relayoutTableItems(nextItems, [updated.id]);
        changedChildIds = getUniqueItemIds([
          ...changedChildIds,
          ...relayoutResult.changedIds,
        ]);
        return relayoutResult.items;
      });

      if (editSessionRef.current?.itemId === updated.id) {
        editSessionRef.current = null;
      }
    },
    [
      captureBoardSnapshot,
      editSessionRef,
      itemsRef,
      pushUndoSnapshot,
      setItemsAndSync,
    ],
  );

  const handleTransformToNote = useCallback(
    (itemId: string) => {
      const item = itemsRef.current.find((it) => it.id === itemId);
      if (!item || item.type !== ITEM_TYPE.sticky_note) {
        return;
      }

      const snapshotBeforeTransform = captureBoardSnapshot();
      pushUndoSnapshot(snapshotBeforeTransform);

      const content = item.content ?? '';
      const hasH1 = content.trim().startsWith('#');
      const transformedContent = hasH1
        ? content
        : `# Untitled Note\n\n${content}`;

      const updated: BoardItem = {
        ...item,
        type: ITEM_TYPE.note_paper,
        content: transformedContent,
        content_format: 'markdown',
      };

      setItemsAndSync((current) =>
        current.map((it) => (it.id === itemId ? updated : it)),
        true,
      );
      triggerSave?.(true);
    },
    [
      captureBoardSnapshot,
      itemsRef,
      onProjectNotesChanged,
      pushUndoSnapshot,
      setItemsAndSync,
      triggerSave,
    ],
  );

  return {
    isPasting,
    handleCreateItem,
    handleCreateSegmentItem,
    handleDeleteItems,
    handleDeleteSelection,
    handleCopySelection,
    handleCutSelection,
    hasClipboardData,
    handlePasteSelection,
    handleLayerChange,
    handleItemUpdate,
    handleTransformToNote,
  };
}
