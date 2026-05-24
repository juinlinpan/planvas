import { describe, expect, it } from 'vitest';
import { parseMermaidToBoardData } from './mermaidImport';
import { ITEM_TYPE } from '../../types/index';

describe('parseMermaidToBoardData', () => {
  it('parses basic flowchart with nodes and edges', () => {
    const code = `
graph TD
  A[Start] --> B(Process)
  B -- "Success" --> C{End}
    `;
    const data = parseMermaidToBoardData(code);

    // Nodes: A, B, C
    // Edges: A->B, B->C
    // total items: 3 nodes + 2 arrows = 5
    expect(data.board_items.length).toBe(5);
    expect(data.connector_links.length).toBe(2);

    const nodes = data.board_items.filter((i) => i.type !== ITEM_TYPE.arrow);
    const arrows = data.board_items.filter((i) => i.type === ITEM_TYPE.arrow);

    expect(nodes.find((n) => n.content === 'Start')).toBeDefined();
    expect(nodes.find((n) => n.content === 'Process')).toBeDefined();
    expect(nodes.find((n) => n.content === 'End')).toBeDefined();

    expect(arrows.length).toBe(2);
    expect(arrows[0].content).toBe(null);
    expect(arrows[1].content).toBe('Success');

    // Check ConnectorLinks
    expect(data.connector_links[0].connector_item_id).toBe(arrows[0].id);
    expect(data.connector_links[1].connector_item_id).toBe(arrows[1].id);

    // Check data_json of arrows
    const arrowWithLabel = arrows.find((a) => a.content === 'Success');
    expect(arrowWithLabel?.data_json).toContain('startConnection');
    expect(arrowWithLabel?.data_json).toContain('endConnection');

    // Check if geometry is using local coordinates (should be around SEGMENT_ITEM_PADDING)
    const parsedData = JSON.parse(arrowWithLabel!.data_json!);
    expect(parsedData.start.x).toBeLessThan(100); // Local coord, not world coord
  });

  it('handles node styles (bracket types)', () => {
    const code = `
flowchart LR
  node1([Note Paper])
  node2(Sticky Note)
  node3[Text Box]
    `;
    const data = parseMermaidToBoardData(code);
    const nodes = data.board_items;

    const n1 = nodes.find((n) => n.content === 'Note Paper');
    const n2 = nodes.find((n) => n.content === 'Sticky Note');
    const n3 = nodes.find((n) => n.content === 'Text Box');

    expect(n1?.type).toBe(ITEM_TYPE.note_paper);
    expect(n2?.type).toBe(ITEM_TYPE.sticky_note);
    expect(n3?.type).toBe(ITEM_TYPE.text_box);
  });

  it('handles A -->|label| B syntax', () => {
    const code = `
graph LR
  A -->|Action| B
    `;
    const data = parseMermaidToBoardData(code);
    const arrows = data.board_items.filter((i) => i.type === ITEM_TYPE.arrow);
    expect(arrows.length).toBe(1);
    expect(arrows[0].content).toBe('Action');
  });
});
