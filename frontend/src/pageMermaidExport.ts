import type { BoardItem, PageBoardData } from './api';
import { ITEM_TYPE } from './types';
import { parseTableData } from './tableData';
import type { TableCellData } from './tableData';
import { getSegmentConnections } from './segmentData';

// ── Cell helpers ──────────────────────────────────────────────────────────────

function getCellText(
  cell: TableCellData,
  itemById: Map<string, BoardItem>,
): string {
  const direct = cell.content?.trim();
  if (direct) return direct;
  for (const childId of cell.childItemIds) {
    const child = itemById.get(childId);
    const text =
      child?.title?.trim() ||
      child?.content
        ?.trim()
        .split('\n')[0]
        ?.replace(/^#+\s*/, '')
        .trim();
    if (text) return text;
  }
  return '';
}

function buildMarkdownTable(
  tableItem: BoardItem,
  itemById: Map<string, BoardItem>,
): string[] {
  const data = parseTableData(tableItem.data_json);
  const lines: string[] = [];
  for (let r = 0; r < data.rows; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < data.cols; c += 1) {
      const cell = data.cells[r]?.[c];
      if (!cell) {
        // covered by a merged cell
        cells.push('');
      } else {
        cells.push(
          getCellText(cell, itemById).replace(/\n/g, ' ').replace(/\|/g, '\\|'),
        );
      }
    }
    lines.push('| ' + cells.join(' | ') + ' |');
    if (r === 0) {
      // separator after header row
      lines.push('| ' + Array(data.cols).fill('---').join(' | ') + ' |');
    }
  }
  return lines;
}

// ── Flowchart helpers ─────────────────────────────────────────────────────────

function escapeMermaid(text: string): string {
  return text
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')');
}

function getItemLabel(item: BoardItem): string {
  const t = item.title?.trim();
  if (t) return t;
  const c = item.content?.trim();
  if (c) return c.split('\n')[0].replace(/^#+\s*/, '').trim();
  return item.type;
}

function getEdgeLabel(item: BoardItem): string {
  const t = item.title?.trim();
  if (t) return t;
  const c = item.content?.trim();
  if (c) return c.split('\n')[0].trim();
  return '';
}

function getMermaidNodeShape(type: string, label: string): string {
  const e = escapeMermaid(label);
  switch (type) {
    case ITEM_TYPE.sticky_note:
      return `("${e}")`;
    case ITEM_TYPE.frame:
      return `{{"${e}"}}`;
    default:
      return `["${e}"]`;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportPageAsMarkdown(boardData: PageBoardData): string {
  const { board_items, connector_links, page } = boardData;
  const itemById = new Map(board_items.map((i) => [i.id, i] as const));
  const lines: string[] = [];

  lines.push(`# ${page.name}`);
  lines.push('');

  // Classify items
  const tableIds = new Set(
    board_items.filter((i) => i.type === ITEM_TYPE.table).map((i) => i.id),
  );
  // Items embedded inside a table cell (via parent_item_id)
  const inTableIds = new Set(
    board_items
      .filter((i) => i.parent_item_id != null && tableIds.has(i.parent_item_id))
      .map((i) => i.id),
  );

  // ── 1. Tables as Markdown tables ───────────────────────────────────────────
  const tables = board_items.filter((i) => i.type === ITEM_TYPE.table);
  for (const table of tables) {
    const tableTitle = table.title?.trim();
    if (tableTitle) {
      lines.push(`## ${tableTitle}`);
      lines.push('');
    }
    lines.push(...buildMarkdownTable(table, itemById));
    lines.push('');
  }

  // ── 2. Flowchart for connected non-table items ─────────────────────────────
  // Nodes: anything that's not a table, not inside a table, not a connector/line
  const flowNodeIds = new Set(
    board_items
      .filter(
        (i) =>
          !tableIds.has(i.id) &&
          !inTableIds.has(i.id) &&
          i.type !== ITEM_TYPE.line &&
          i.type !== ITEM_TYPE.arrow,
      )
      .map((i) => i.id),
  );

  type Edge = { fromId: string; toId: string; isArrow: boolean; label: string };
  const edges: Edge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (
    fromId: string,
    toId: string,
    isArrow: boolean,
    label: string,
  ) => {
    // Skip if either endpoint is inside a table or is a table itself
    if (!flowNodeIds.has(fromId) || !flowNodeIds.has(toId)) return;
    const key = `${fromId}|${toId}|${label}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ fromId, toId, isArrow, label });
    }
  };

  // Legacy connector_links
  for (const link of connector_links) {
    if (link.from_item_id && link.to_item_id) {
      const arrowItem = board_items.find((i) => i.id === link.connector_item_id);
      addEdge(
        link.from_item_id,
        link.to_item_id,
        true,
        arrowItem ? getEdgeLabel(arrowItem) : '',
      );
    }
  }

  // Modern segment-based arrows / lines
  for (const item of board_items) {
    if (item.type === ITEM_TYPE.arrow || item.type === ITEM_TYPE.line) {
      const { startConnection, endConnection } = getSegmentConnections(item);
      if (startConnection && endConnection) {
        addEdge(
          startConnection.itemId,
          endConnection.itemId,
          item.type === ITEM_TYPE.arrow,
          getEdgeLabel(item),
        );
      }
    }
  }

  // Only emit the flowchart block when there are actual edges
  if (edges.length > 0) {
    let counter = 0;
    const idMap = new Map<string, string>();
    const sid = (id: string) => {
      if (!idMap.has(id)) idMap.set(id, `n${++counter}`);
      return idMap.get(id)!;
    };

    const flowNodes = board_items.filter((i) => flowNodeIds.has(i.id));

    lines.push('```mermaid');
    lines.push('flowchart TD');
    for (const node of flowNodes) {
      lines.push(
        `  ${sid(node.id)}${getMermaidNodeShape(node.type, getItemLabel(node))}`,
      );
    }
    for (const edge of edges) {
      const from = sid(edge.fromId);
      const to = sid(edge.toId);
      const arrow = edge.isArrow ? '-->' : '---';
      if (edge.label) {
        lines.push(
          `  ${from} -- "${escapeMermaid(edge.label)}" ${arrow} ${to}`,
        );
      } else {
        lines.push(`  ${from} ${arrow} ${to}`);
      }
    }
    lines.push('```');
    lines.push('');
  }

  // ── 3. Notes as plain text ─────────────────────────────────────────────────
  // note_paper, sticky_note, text_box that are NOT inside a table
  const notes = board_items.filter(
    (i) =>
      !inTableIds.has(i.id) &&
      (i.type === ITEM_TYPE.note_paper ||
        i.type === ITEM_TYPE.sticky_note ||
        i.type === ITEM_TYPE.text_box),
  );

  for (const note of notes) {
    const content = note.content?.trim();
    if (!content) continue;
    const label = getItemLabel(note);
    const headerRe = new RegExp(
      `^#+\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\n|$)`,
      'i',
    );
    if (!headerRe.test(content)) {
      lines.push(`### ${label}`);
    }
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n');
}

// Backward-compat alias (old import still compiles)
export const exportPageAsMermaidMarkdown = exportPageAsMarkdown;
