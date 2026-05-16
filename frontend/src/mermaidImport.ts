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
  const nodeRegex = /^(\w+)(?:(\[\[?|\(\(?|\{\{?|\(\[|\[\()(?:"?)(.+?)(?:"?)(?:\]\]?|\)\)?|\}\)?|\]\)|\)\]))?$/;

  const ensureNode = (id: string, label?: string, startBracket?: string) => {
    if (!nodeMap.has(id)) {
      const pos = getPosition();
      let type: string = ITEM_TYPE.text_box;

      if (startBracket === '(') {
        type = ITEM_TYPE.sticky_note;
      } else if (startBracket === '([' || startBracket === '([') {
        type = ITEM_TYPE.note_paper;
      }

      const item: BoardItem = {
        id: `imported-${id}-${Math.random().toString(36).substring(2, 11)}`,
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
        z_index: board_items.length,
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
      if (startBracket === '(') {
        existing.type = ITEM_TYPE.sticky_note as any;
        existing.category = ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.sticky_note];
      } else if (startBracket === '([' ) {
        existing.type = ITEM_TYPE.note_paper as any;
        existing.category = ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.note_paper];
      }
    }
    return nodeMap.get(id)!;
  };

  const parseNodePart = (part: string) => {
    const match = part.trim().match(nodeRegex);
    if (match) {
      const [, id, startBracket, label] = match;
      return ensureNode(id, label, startBracket);
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
      { regex: /\s*--(?:"?)(.+?)(?:"?)-->\s*/, hasLabel: true },
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
          const label = pattern.hasLabel ? match[1] : null;

          if (fromNode && toNode) {
            connector_links.push({
              id: `imported-edge-${Math.random().toString(36).substring(2, 11)}`,
              page_id: '',
              from_item_id: fromNode.id,
              to_item_id: toNode.id,
              title: label || null,
              style_json: null,
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
