import type { BoardItem, PageBoardData } from './api';
import { ITEM_TYPE } from './types';
import { getSegmentConnections } from './segmentData';

function getMermaidTitle(item: BoardItem): string {
  const title = item.title?.trim();
  if (title && title.length > 0) {
    return title;
  }
  const content = item.content?.trim();
  if (content && content.length > 0) {
    // Take first line and remove leading # if any
    return content.split('\n')[0].replace(/^#+\s*/, '').trim();
  }
  return item.type;
}

function escapeMermaid(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\{/g, '(').replace(/\}/g, ')');
}

function getMermaidShape(type: string, text: string): string {
  const escaped = escapeMermaid(text);
  switch (type) {
    case ITEM_TYPE.sticky_note:
      return `("${escaped}")`; // Rounded
    case ITEM_TYPE.note_paper:
      return `["${escaped}"]`; // Square
    case ITEM_TYPE.table:
      return `[["${escaped}"]]`; // Double box
    case ITEM_TYPE.text_box:
      return `>"${escaped}"]`; // Flag/Right-pointing
    case ITEM_TYPE.frame:
      return `{{ "${escaped}" }}`; // Hexagon
    default:
      return `["${escaped}"]`;
  }
}

function getEdgeLabel(item: BoardItem): string {
  const title = item.title?.trim();
  if (title && title.length > 0) {
    return title;
  }
  const content = item.content?.trim();
  if (content && content.length > 0) {
    return content.split('\n')[0].trim();
  }
  return '';
}

export function exportPageAsMermaidMarkdown(boardData: PageBoardData): string {
  const { board_items, connector_links, page } = boardData;
  const lines: string[] = [];

  // Add Page Title
  lines.push(`# ${page.name}`);
  lines.push('');

  const nodes = board_items.filter(
    (item) =>
      item.type !== ITEM_TYPE.line &&
      item.type !== ITEM_TYPE.arrow &&
      item.type !== ITEM_TYPE.table,
  );

  const tableIds = new Set(
    board_items.filter((item) => item.type === ITEM_TYPE.table).map((item) => item.id),
  );

  lines.push('```mermaid');
  lines.push('flowchart TD');

  if (nodes.length === 0) {
    lines.push('  Empty["No nodes found"]');
  }

  const idMap = new Map<string, string>();
  let idCounter = 0;
  const getShortId = (longId: string) => {
    if (!idMap.has(longId)) {
      idMap.set(longId, `n${++idCounter}`);
    }
    return idMap.get(longId)!;
  };

  // Add nodes
  for (const node of nodes) {
    const title = getMermaidTitle(node);
    const shortId = getShortId(node.id);
    lines.push(`  ${shortId}${getMermaidShape(node.type, title)}`);
  }

  const addedEdges = new Set<string>();
  const addEdge = (fromId: string, toId: string, isArrow: boolean, label: string) => {
    // Skip if either side is a table
    if (tableIds.has(fromId) || tableIds.has(toId)) {
      return;
    }

    const fromSafe = getShortId(fromId);
    const toSafe = getShortId(toId);
    
    const edgeSyntax = isArrow ? '-->' : '---';
    const key = `${fromSafe}${edgeSyntax}${label}${toSafe}`;
    
    if (!addedEdges.has(key)) {
      if (label) {
        // Syntax with label: n1 -- "|label|" --> n2
        lines.push(`  ${fromSafe} -- "${escapeMermaid(label)}" ${edgeSyntax} ${toSafe}`);
      } else {
        // Simple syntax: n1 --> n2
        lines.push(`  ${fromSafe} ${edgeSyntax} ${toSafe}`);
      }
      addedEdges.add(key);
    }
  };

  // Add edges from legacy connector_links (always arrows in legacy)
  for (const link of connector_links) {
    if (link.from_item_id && link.to_item_id) {
      addEdge(link.from_item_id, link.to_item_id, true, '');
    }
  }

  // Add edges from segment data (modern arrows/lines)
  for (const item of board_items) {
    if (item.type === ITEM_TYPE.arrow || item.type === ITEM_TYPE.line) {
      const { startConnection, endConnection } = getSegmentConnections(item);
      if (startConnection && endConnection) {
        const isArrow = item.type === ITEM_TYPE.arrow;
        const label = getEdgeLabel(item);
        addEdge(startConnection.itemId, endConnection.itemId, isArrow, label);
      }
    }
  }

  lines.push('```');
  lines.push('');

  // Add full content for notes
  const notes = board_items.filter(
    (item) => item.type === ITEM_TYPE.sticky_note || item.type === ITEM_TYPE.note_paper,
  );

  for (const note of notes) {
    const content = note.content?.trim();
    if (content && content.length > 0) {
      const title = getMermaidTitle(note);
      
      // Check if the content already starts with the title as a header
      const headerRegex = new RegExp(`^#+\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\n|$)`, 'i');
      if (headerRegex.test(content)) {
        // Content already has the header, just push content
        lines.push(content);
      } else {
        // Add the title header then the content
        lines.push(`# ${title}`);
        lines.push(content);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
