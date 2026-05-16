import { type BoardItem, type ConnectorLink } from './api';
import { ITEM_TYPE, ITEM_CATEGORY_FOR_TYPE, ITEM_DEFAULT_SIZE } from './types';

/**
 * Parses a simple Mermaid flowchart string into board items and connector links.
 * Supports:
 * - Nodes: id, id[Label], id(Label), id((Label)), id{Label}, id[[Label]], id([Label])
 * - Edges: id1 --> id2, id1 -- "Label" --> id2, id1 --- id2
 */
export function parseMermaidToBoardData(code: string): {
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
} {
  const lines = code.split('\n');
  const board_items: BoardItem[] = [];
  const connector_links: ConnectorLink[] = [];
  const nodeMap = new Map<string, BoardItem>();

  let nodeCounter = 0;
  const getPosition = () => {
    const col = nodeCounter % 5;
    const row = Math.floor(nodeCounter / 5);
    nodeCounter++;
    return { x: col * 350 + 100, y: row * 300 + 100 };
  };

  // Node regex: ID followed by optional [Label], (Label), etc.
  // Group 1: ID, Group 2: Start bracket, Group 3: Label
  const nodeRegex = /^([\w-]+)\s*(?:(\[\[|\(\(|\{\{|\(\[|\[\(|\[|\(|\{)\s*"?\s*(.+?)\s*"?\s*(?:\]\]|\)\)|\}\)|\]\)|\)\]|\]|\)|\}))?$/;

  const ensureNode = (id: string, label?: string, startBracket?: string) => {
    if (!nodeMap.has(id)) {
      const pos = getPosition();
      let type: string = ITEM_TYPE.text_box;

      if (startBracket === '(' || startBracket === '((') {
        type = ITEM_TYPE.sticky_note;
      } else if (startBracket === '([' || startBracket === '[(' ) {
        type = ITEM_TYPE.note_paper;
      }

      const item: BoardItem = {
        id: `node-${id}-${Math.random().toString(36).substring(2, 9)}`,
        page_id: '',
        parent_item_id: null,
        category: ITEM_CATEGORY_FOR_TYPE[type],
        type: type as any,
        title: label || id,
        content: null,
        content_format: 'markdown',
        x: pos.x,
        y: pos.y,
        width: ITEM_DEFAULT_SIZE[type].width,
        height: ITEM_DEFAULT_SIZE[type].height,
        rotation: 0,
        z_index: board_items.length + 10,
        is_collapsed: false,
        style_json: null,
        data_json: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      board_items.push(item);
      nodeMap.set(id, item);
    } else if (label) {
      const existing = nodeMap.get(id)!;
      existing.title = label;
      if (startBracket === '(' || startBracket === '((') {
        existing.type = ITEM_TYPE.sticky_note as any;
        existing.category = ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.sticky_note];
      } else if (startBracket === '([' || startBracket === '[(') {
        existing.type = ITEM_TYPE.note_paper as any;
        existing.category = ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.note_paper];
      }
    }
    return nodeMap.get(id)!;
  };

  const parseNodePart = (part: string) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const match = trimmed.match(nodeRegex);
    if (match) {
      const [, id, startBracket, label] = match;
      return ensureNode(id, label, startBracket);
    }
    // Bare ID
    if (/^[\w-]+$/.test(trimmed)) {
      return ensureNode(trimmed);
    }
    return null;
  };

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('flowchart') || line.startsWith('graph')) {
      continue;
    }

    // Edge patterns to split by
    const edgePatterns = [
      { regex: /\s*--\s*"?\s*(.+?)\s*"?\s*-->\s*/, hasLabel: true },
      { regex: /\s*--\s*"?\s*(.+?)\s*"?\s*---\s*/, hasLabel: true },
      { regex: /\s*-->\s*/, hasLabel: false },
      { regex: /\s*---\s*/, hasLabel: false },
    ];

    let edgeFound = false;
    for (const pattern of edgePatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const parts = line.split(match[0]);
        if (parts.length === 2) {
          const fromNode = parseNodePart(parts[0]);
          const toNode = parseNodePart(parts[1]);
          const label = pattern.hasLabel ? match[1].trim() : null;

          if (fromNode && toNode) {
            const arrowId = `edge-${Math.random().toString(36).substring(2, 11)}`;
            
            // 1. Create the arrow BoardItem
            const arrowItem: BoardItem = {
              id: arrowId,
              page_id: '',
              parent_item_id: null,
              category: ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.arrow],
              type: ITEM_TYPE.arrow as any,
              title: null,
              content: label || null,
              content_format: null,
              x: (fromNode.x + toNode.x) / 2,
              y: (fromNode.y + toNode.y) / 2,
              width: ITEM_DEFAULT_SIZE[ITEM_TYPE.arrow].width,
              height: ITEM_DEFAULT_SIZE[ITEM_TYPE.arrow].height,
              rotation: 0,
              z_index: 0,
              is_collapsed: false,
              style_json: null,
              data_json: JSON.stringify({
                kind: 'segment',
                start: { x: fromNode.x + fromNode.width, y: fromNode.y + fromNode.height / 2 },
                end: { x: toNode.x, y: toNode.y + toNode.height / 2 },
                startConnection: { itemId: fromNode.id, anchor: 'right' },
                endConnection: { itemId: toNode.id, anchor: 'left' }
              }),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            board_items.push(arrowItem);

            // 2. Create the ConnectorLink
            connector_links.push({
              id: `link-${Math.random().toString(36).substring(2, 11)}`,
              connector_item_id: arrowId,
              from_item_id: fromNode.id,
              to_item_id: toNode.id,
              from_anchor: 'right',
              to_anchor: 'left',
            });
            edgeFound = true;
            break;
          }
        }
      }
    }

    if (!edgeFound) {
      parseNodePart(line);
    }
  }

  return { board_items, connector_links };
}
