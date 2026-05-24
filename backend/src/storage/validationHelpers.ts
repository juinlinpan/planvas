import { HttpError } from '../httpError.js';
import type {
  BoardItem,
  ConnectorLink,
  ConnectorLinkCreatePayload,
  ConnectorLinkUpdatePayload,
  PageRegulateReport,
} from '../types.js';
import { parseJsonObject } from './paths.js';

const connectableItemTypes = new Set([
  'text_box',
  'sticky_note',
  'note_paper',
  'frame',
]);

export function validateBoardStatePayload(
  pageId: string,
  boardItems: BoardItem[],
  connectorLinks: ConnectorLink[],
): void {
  const itemIds = boardItems.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new HttpError(400, 'Board state contains duplicate board item ids.');
  }
  const connectorIds = connectorLinks.map((connector) => connector.id);
  if (new Set(connectorIds).size !== connectorIds.length) {
    throw new HttpError(400, 'Board state contains duplicate connector ids.');
  }
  const itemById = new Map(boardItems.map((item) => [item.id, item]));
  for (const item of boardItems) {
    if (item.page_id !== pageId) {
      throw new HttpError(
        400,
        'Board state items must belong to the target page.',
      );
    }
    if (item.parent_item_id && !itemById.has(item.parent_item_id)) {
      throw new HttpError(
        400,
        'Board state item parent references must exist in the payload.',
      );
    }
  }
  for (const connector of connectorLinks) {
    const connectorItem = itemById.get(connector.connector_item_id);
    if (!connectorItem) {
      throw new HttpError(
        400,
        'Board state connector item references must exist in the payload.',
      );
    }
    validateConnectorTargets(
      connectorItem,
      connector.from_item_id ? (itemById.get(connector.from_item_id) ?? null) : null,
      connector.to_item_id ? (itemById.get(connector.to_item_id) ?? null) : null,
    );
    if (connector.from_item_id && !itemById.has(connector.from_item_id)) {
      throw new HttpError(
        400,
        'Board state connector from item references must exist in the payload.',
      );
    }
    if (connector.to_item_id && !itemById.has(connector.to_item_id)) {
      throw new HttpError(
        400,
        'Board state connector to item references must exist in the payload.',
      );
    }
  }
}

export function validateReorderIds(
  existingIds: string[],
  orderedIds: string[],
  entityLabel: string,
): void {
  if (
    existingIds.length !== orderedIds.length ||
    !sameStringSet(existingIds, orderedIds)
  ) {
    throw new HttpError(
      400,
      `${entityLabel} reorder payload must contain every existing id exactly once.`,
    );
  }
}

export function validateConnectorTargets(
  connectorItem: BoardItem,
  fromItem: BoardItem | null,
  toItem: BoardItem | null,
): void {
  if (connectorItem.type !== 'arrow' || connectorItem.category !== 'connector') {
    throw new HttpError(400, 'Connector item must be an arrow board item.');
  }
  for (const [role, targetItem] of [
    ['from', fromItem],
    ['to', toItem],
  ] as const) {
    if (!targetItem) continue;
    if (targetItem.page_id !== connectorItem.page_id) {
      throw new HttpError(
        400,
        `Connector ${role} item must be on the same page as the arrow.`,
      );
    }
    if (!connectableItemTypes.has(targetItem.type)) {
      throw new HttpError(
        400,
        'Arrow endpoints can only connect to text_box, sticky_note, note_paper, or frame items.',
      );
    }
  }
}

export function regulateBoardItems(boardItems: BoardItem[]): {
  boardItems: BoardItem[];
  report: Omit<PageRegulateReport, 'removed_connector_links'>;
} {
  const itemById = new Map(boardItems.map((item) => [item.id, item]));
  const parentUpdates = new Map<string, string>();
  let removedTableChildRefs = 0;

  const nextBoardItems = boardItems.map((item) => {
    if (item.type !== 'table') return item;

    const data = parseJsonObject(item.data_json);
    const rawCells = Array.isArray(data.cells) ? data.cells : [];
    let tableChanged = false;
    const nextCells = rawCells.map((rawRow) => {
      if (!Array.isArray(rawRow)) return rawRow;
      return rawRow.map((rawCell) => {
        if (
          typeof rawCell !== 'object' ||
          rawCell === null ||
          Array.isArray(rawCell)
        ) {
          return rawCell;
        }
        const cell = rawCell as Record<string, unknown>;
        const rawChildItemIds = Array.isArray(cell.childItemIds)
          ? cell.childItemIds
          : [];
        const keptChildItemIds: string[] = [];
        const seenChildItemIds = new Set<string>();

        for (const childId of rawChildItemIds) {
          if (typeof childId !== 'string' || seenChildItemIds.has(childId)) {
            removedTableChildRefs += 1;
            tableChanged = true;
            continue;
          }

          const child = itemById.get(childId);
          const canContain =
            child !== undefined &&
            ['text_box', 'note_paper'].includes(child.type) &&
            (child.parent_item_id === item.id || child.parent_item_id === null);
          if (!canContain) {
            removedTableChildRefs += 1;
            tableChanged = true;
            continue;
          }

          seenChildItemIds.add(childId);
          keptChildItemIds.push(childId);
          if (child.parent_item_id === null) parentUpdates.set(childId, item.id);
        }

        if (keptChildItemIds.length !== rawChildItemIds.length) {
          return { ...cell, childItemIds: keptChildItemIds };
        }
        return rawCell;
      });
    });

    if (!tableChanged) return item;
    return {
      ...item,
      data_json: JSON.stringify({
        ...data,
        cells: nextCells,
      }),
    };
  });

  let normalizedItems = 0;
  const normalizedBoardItems = nextBoardItems.map((item) => {
    const nextParentId = parentUpdates.get(item.id);
    const nextCategory = categoryForType(item.type);
    const shouldClearParent =
      item.type === 'sticky_note' && item.parent_item_id !== null;
    if (
      nextParentId === undefined &&
      !shouldClearParent &&
      item.category === nextCategory
    ) {
      return item;
    }
    normalizedItems += 1;
    return {
      ...item,
      category: nextCategory,
      parent_item_id: shouldClearParent
        ? null
        : (nextParentId ?? item.parent_item_id),
    };
  });

  return {
    boardItems: normalizedBoardItems,
    report: {
      removed_table_child_refs: removedTableChildRefs,
      normalized_items: normalizedItems,
    },
  };
}

export async function validateConnectorPayload(
  payload: ConnectorLinkCreatePayload | ConnectorLinkUpdatePayload,
  getBoardItem: (itemId: string) => Promise<BoardItem>,
): Promise<BoardItem> {
  const connectorItem = await getBoardItem(payload.connector_item_id);
  const fromItem = payload.from_item_id
    ? await getBoardItem(payload.from_item_id)
    : null;
  const toItem = payload.to_item_id ? await getBoardItem(payload.to_item_id) : null;
  validateConnectorTargets(connectorItem, fromItem, toItem);
  return connectorItem;
}

function sameStringSet(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function categoryForType(type: string): string {
  if (type === 'frame') return 'large_item';
  if (type === 'line' || type === 'table') return 'shape';
  if (type === 'sticky_note') return 'sticky_item';
  if (type === 'arrow') return 'connector';
  return 'small_item';
}
