import { type BoardItem, type ConnectorLink } from './api';
import { ITEM_TYPE, ITEM_CATEGORY_FOR_TYPE, ITEM_DEFAULT_SIZE } from './types';
import { buildSegmentGeometry } from './segmentData';

/**
 * Parses a simple Mermaid flowchart string into board items and connector links.
 * Supports:
 * - Nodes: id, id[Label], id(Label), id((Label)), id{Label}, id[[Label]], id([Label])
 * - Edges: id1 --> id2, id1 -- "Label" --> id2, id1 --- id2, id1 -->|Label| id2
 */
export function parseMermaidToBoardData(code: string): {
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
} {
  const lines = code.split('\n').map(l => l.trim());
  const board_items: BoardItem[] = [];
  const connector_links: ConnectorLink[] = [];
  const nodeMap = new Map<string, BoardItem>();

  // 1. Detect Orientation
  let orientation = 'LR'; // Default
  for (const line of lines) {
    if (line.startsWith('flowchart') || line.startsWith('graph')) {
      const parts = line.split(/\s+/);
      if (parts.length > 1) {
        const dir = parts[1].toUpperCase();
        if (['TD', 'TB', 'LR', 'RL', 'BT'].includes(dir)) {
          orientation = dir;
          break;
        }
      }
    }
  }

  // 2. Node Placement Helper
  let nodeCounter = 0;
  const getPosition = () => {
    let x, y;
    if (orientation === 'TD' || orientation === 'TB') {
      // Flow downwards: row increases first, then col
      const row = nodeCounter % 6;
      const col = Math.floor(nodeCounter / 6);
      x = col * 400 + 100;
      y = row * 450 + 100;
    } else if (orientation === 'BT') {
      // Flow upwards
      const row = nodeCounter % 6;
      const col = Math.floor(nodeCounter / 6);
      x = col * 400 + 100;
      y = 1200 - row * 450;
    } else if (orientation === 'RL') {
      // Flow leftwards
      const col = nodeCounter % 6;
      const row = Math.floor(nodeCounter / 6);
      x = 2400 - col * 450;
      y = row * 350 + 100;
    } else {
      // Default LR: Flow rightwards: col increases first, then row
      const col = nodeCounter % 6;
      const row = Math.floor(nodeCounter / 6);
      x = col * 450 + 100;
      y = row * 350 + 100;
    }
    nodeCounter++;
    return { x, y };
  };

  // 3. Node Parsing Helper
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
        content: label || id,
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
      existing.content = label;
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
    if (/^[\w-]+$/.test(trimmed)) {
      return ensureNode(trimmed);
    }
    return null;
  };

  // 4. Main Parsing Loop
  for (let line of lines) {
    if (!line || line.startsWith('flowchart') || line.startsWith('graph')) {
      continue;
    }

    const edgePatterns = [
      { regex: /\s*--\s*"?\s*(.+?)\s*"?\s*-->\s*/, hasLabel: true },
      { regex: /\s*--\s*"?\s*(.+?)\s*"?\s*---\s*/, hasLabel: true },
      { regex: /\s*-->\s*\|(.+?)\|\s*/, hasLabel: true },
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
            
            let fromAnchor = 'right';
            let toAnchor = 'left';

            if (orientation === 'TD' || orientation === 'TB') {
              fromAnchor = 'bottom';
              toAnchor = 'top';
            } else if (orientation === 'BT') {
              fromAnchor = 'top';
              toAnchor = 'bottom';
            } else if (orientation === 'RL') {
              fromAnchor = 'left';
              toAnchor = 'right';
            }

            const getAnchorPoint = (node: BoardItem, anchor: string) => {
               if (anchor === 'left') return { x: node.x, y: node.y + node.height / 2 };
               if (anchor === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
               if (anchor === 'top') return { x: node.x + node.width / 2, y: node.y };
               if (anchor === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height };
               return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
            };

            const sp = getAnchorPoint(fromNode, fromAnchor);
            const ep = getAnchorPoint(toNode, toAnchor);

            const geometry = buildSegmentGeometry(sp, ep, null, 
              { itemId: fromNode.id, anchor: fromAnchor },
              { itemId: toNode.id, anchor: toAnchor }
            );

            const arrowItem: BoardItem = {
              id: arrowId,
              page_id: '',
              parent_item_id: null,
              category: ITEM_CATEGORY_FOR_TYPE[ITEM_TYPE.arrow],
              type: ITEM_TYPE.arrow as any,
              title: null,
              content: label || null,
              content_format: null,
              ...geometry,
              z_index: 0,
              is_collapsed: false,
              style_json: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            board_items.push(arrowItem);

            connector_links.push({
              id: `link-${Math.random().toString(36).substring(2, 11)}`,
              connector_item_id: arrowId,
              from_item_id: fromNode.id,
              to_item_id: toNode.id,
              from_anchor: fromAnchor as any,
              to_anchor: toAnchor as any,
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
