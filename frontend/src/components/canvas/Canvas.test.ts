import { describe, expect, it } from 'vitest';

import type { BoardItem, ConnectorLink, ProjectNote } from '../../services/api';
import { Canvas } from './Canvas';
import { resolveSidebarNoteDragFile } from '../../hooks/useCanvasNoteDrop';
import {
  buildClipboardPayload,
  getClipboardData,
  setClipboardData,
  getPasteCount,
  setPasteCount,
  generateUUID,
} from '../../hooks/useCanvasItemActions';
import {
  getAutoAnchors,
  getConnectorPoints,
  getPartialFrameExitEjectPosition,
  normalizeConnectorArrowsToSegments,
  summarizeFrameChild,
} from '../../canvasHelpers/canvasHelpers';
import { parseBoardItemStyle, resolveBoardItemStyle } from '../../items/itemStyles';
import { syncMarkdownBackedItems } from '../../services/noteSync';
import { normalizeLoadedBoardItems } from '../../hooks/useCanvasBoardLoader';
import { serializeTableData, type TableData } from '../../tableData/tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../../types/index';

const FIXTURE_TIMESTAMP = '2026-04-11T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: 'plain_text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

function createConnector(
  overrides: Partial<ConnectorLink> = {},
): ConnectorLink {
  return {
    id: 'connector-1',
    connector_item_id: 'arrow-1',
    from_item_id: 'from-item',
    to_item_id: 'to-item',
    from_anchor: null,
    to_anchor: null,
    ...overrides,
  };
}

function createProjectNote(overrides: Partial<ProjectNote> = {}): ProjectNote {
  const defaults: ProjectNote = {
    note_file: 'sprint-plan.md',
    title: 'Sprint Plan',
    content: '',
    content_format: 'markdown',
    updated_at: FIXTURE_TIMESTAMP,
  };

  return {
    ...defaults,
    ...overrides,
    content: overrides.content ?? defaults.content,
  };
}

describe('summarizeFrameChild', () => {
  it('keeps full text for text boxes', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'text-1',
        type: ITEM_TYPE.text_box,
        content: '完整顯示的文字框內容',
      }),
    );

    expect(summary).toEqual({
      id: 'text-1',
      type: ITEM_TYPE.text_box,
      title: '文字框',
      body: '完整顯示的文字框內容',
    });
  });

  it('ellipsizes sticky note content', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'sticky-1',
        type: ITEM_TYPE.sticky_note,
        content: 'A'.repeat(90),
      }),
    );

    expect(summary.title).toBe('便利貼');
    expect(summary.body).toBe(`${'A'.repeat(80)}…`);
  });

  it('uses the first markdown H1 for note paper summaries', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'note-1',
        type: ITEM_TYPE.note_paper,
        content: '前言\n# Sprint Plan\n- backlog',
        content_format: 'markdown',
      }),
    );

    expect(summary).toEqual({
      id: 'note-1',
      type: ITEM_TYPE.note_paper,
      title: 'Sprint Plan',
      body: 'Markdown H1 摘要',
    });
  });

  it('falls back to the first non-empty line when note paper has no H1', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'note-2',
        type: ITEM_TYPE.note_paper,
        content: '\n\n整理待辦\n## Next',
        content_format: 'markdown',
      }),
    );

    expect(summary).toEqual({
      id: 'note-2',
      type: ITEM_TYPE.note_paper,
      title: '整理待辦',
      body: '未找到 H1，改用第一行內容',
    });
  });
});

describe('resolveSidebarNoteDragFile', () => {
  it('falls back to the current sidebar drag state when text/plain is unavailable', () => {
    const notes = [createProjectNote()];

    const resolved = resolveSidebarNoteDragFile(notes, 'sprint-plan.md', {
      getData: () => '',
    });

    expect(resolved).toBe('sprint-plan.md');
  });

  it('ignores stale dragged note ids that are not part of the current project notes', () => {
    const notes = [createProjectNote()];

    const resolved = resolveSidebarNoteDragFile(notes, 'missing.md', {
      getData: () => '',
    });

    expect(resolved).toBeNull();
  });
});

describe('syncMarkdownBackedItems', () => {
  it('updates note paper placements from their project markdown files', () => {
    const items = [
      createBoardItem({
        id: 'note-1',
        type: ITEM_TYPE.note_paper,
        content: '# Old',
        content_format: 'markdown',
        data_json: JSON.stringify({ noteFile: 'sprint-plan.md' }),
      }),
      createBoardItem({
        id: 'text-1',
        type: ITEM_TYPE.text_box,
        content: 'Plain text',
      }),
    ];

    const synced = syncMarkdownBackedItems(items, [
      createProjectNote({
        note_file: 'sprint-plan.md',
        title: 'New',
        content: '# New\n- updated outside the app',
      }),
    ]);

    expect(synced[0]).toMatchObject({
      title: 'New',
      content: '# New\n- updated outside the app',
      content_format: 'markdown',
    });
    expect(synced[1]).toBe(items[1]);
  });

  it('leaves the currently edited note placement untouched', () => {
    const items = [
      createBoardItem({
        id: 'note-1',
        type: ITEM_TYPE.note_paper,
        content: '# Local draft',
        content_format: 'markdown',
        data_json: JSON.stringify({ noteFile: 'sprint-plan.md' }),
      }),
    ];

    const synced = syncMarkdownBackedItems(
      items,
      [
        createProjectNote({
          note_file: 'sprint-plan.md',
          content: '# External edit',
        }),
      ],
      'note-1',
    );

    expect(synced).toBe(items);
  });
});

describe('normalizeLoadedBoardItems', () => {
  it('snaps table children back into their cells after loading a page', () => {
    const tableData: TableData = {
      rows: 1,
      cols: 1,
      colWidths: [1],
      rowHeights: [1],
      cells: [
        [
          {
            id: 'cell-1',
            content: '',
            rowSpan: 1,
            colSpan: 1,
            isCollapsed: true,
            childItemIds: ['child-1'],
          },
        ],
      ],
    };
    const table = createBoardItem({
      id: 'table-1',
      category: ITEM_CATEGORY.shape,
      type: ITEM_TYPE.table,
      x: 100,
      y: 80,
      width: 300,
      height: 180,
      data_json: serializeTableData(tableData),
    });
    const child = createBoardItem({
      id: 'child-1',
      parent_item_id: table.id,
      x: 900,
      y: 900,
      width: 120,
      height: 80,
    });

    const normalized = normalizeLoadedBoardItems([table, child], []);
    const normalizedChild = normalized.items.find((item) => item.id === child.id);

    expect(normalized.relayoutChangedIds).toEqual([child.id]);
    expect(normalizedChild).toMatchObject({
      x: 108,
      y: 88,
      width: 284,
      height: 164,
    });
  });
});

describe('buildClipboardPayload', () => {
  it('materializes sticky note default background before paste creates a new id', () => {
    const sticky = createBoardItem({
      id: 'sticky-source',
      type: ITEM_TYPE.sticky_note,
      style_json: null,
    });
    const originalStyle = resolveBoardItemStyle(sticky);

    const payload = buildClipboardPayload(sticky);
    const clipboardStyle = parseBoardItemStyle(payload.style_json);

    expect(clipboardStyle.backgroundColor).toBe(originalStyle.backgroundColor);
  });

  it('preserves an explicitly styled sticky note background', () => {
    const sticky = createBoardItem({
      id: 'sticky-source',
      type: ITEM_TYPE.sticky_note,
      style_json: '{"backgroundColor":"#f5d8e8"}',
    });

    const payload = buildClipboardPayload(sticky);

    expect(payload.style_json).toBe('{"backgroundColor":"#f5d8e8"}');
  });
});

describe('frame child exit placement', () => {
  it('keeps the dragged position when a child fully leaves the frame', () => {
    const frame = createBoardItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 100,
      y: 100,
      width: 320,
      height: 240,
    });
    const child = createBoardItem({
      id: 'child-1',
      parent_item_id: frame.id,
      x: 480,
      y: 180,
      width: 120,
      height: 80,
    });

    expect(getPartialFrameExitEjectPosition(child, frame)).toBeNull();
  });

  it('ejects a partially exited child to the nearest frame edge', () => {
    const frame = createBoardItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 100,
      y: 100,
      width: 320,
      height: 240,
    });
    const child = createBoardItem({
      id: 'child-1',
      parent_item_id: frame.id,
      x: 360,
      y: 180,
      width: 120,
      height: 80,
    });

    expect(getPartialFrameExitEjectPosition(child, frame)).toEqual({
      x: 444,
      y: 180,
    });
  });
});

describe('connector geometry helpers', () => {
  it('prefers horizontal anchors when horizontal distance dominates', () => {
    const anchors = getAutoAnchors(
      createBoardItem({ x: 0, y: 0, width: 100, height: 80 }),
      createBoardItem({ x: 320, y: 40, width: 120, height: 80 }),
    );

    expect(anchors).toEqual({
      from_anchor: 'right',
      to_anchor: 'left',
    });
  });

  it('prefers vertical anchors when vertical distance dominates', () => {
    const anchors = getAutoAnchors(
      createBoardItem({ x: 0, y: 0, width: 120, height: 80 }),
      createBoardItem({ x: 20, y: 260, width: 120, height: 80 }),
    );

    expect(anchors).toEqual({
      from_anchor: 'bottom',
      to_anchor: 'top',
    });
  });

  it('uses corner anchors when the target sits on a diagonal', () => {
    const anchors = getAutoAnchors(
      createBoardItem({ x: 0, y: 0, width: 100, height: 80 }),
      createBoardItem({ x: 220, y: 180, width: 120, height: 100 }),
    );

    expect(anchors).toEqual({
      from_anchor: 'bottom_right',
      to_anchor: 'top_left',
    });
  });

  it('computes connector points from inferred anchors', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 300,
      y: 20,
      width: 120,
      height: 100,
    });

    expect(getConnectorPoints(createConnector(), [fromItem, toItem])).toEqual({
      fromPoint: { x: 100, y: 40 },
      toPoint: { x: 300, y: 70 },
    });
  });

  it('computes connector points from inferred corner anchors', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 220,
      y: 180,
      width: 120,
      height: 100,
    });

    expect(getConnectorPoints(createConnector(), [fromItem, toItem])).toEqual({
      fromPoint: { x: 100, y: 80 },
      toPoint: { x: 220, y: 180 },
    });
  });

  it('updates connector geometry when a connected item moves', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 300,
      y: 20,
      width: 120,
      height: 100,
    });

    const beforeMove = getConnectorPoints(createConnector(), [
      fromItem,
      toItem,
    ]);
    const afterMove = getConnectorPoints(createConnector(), [
      fromItem,
      {
        ...toItem,
        x: 40,
        y: 260,
      },
    ]);

    expect(beforeMove).toEqual({
      fromPoint: { x: 100, y: 40 },
      toPoint: { x: 300, y: 70 },
    });
    expect(afterMove).toEqual({
      fromPoint: { x: 50, y: 80 },
      toPoint: { x: 100, y: 260 },
    });
  });

  it('hides connector points for items inside collapsed frames', () => {
    const frame = createBoardItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      width: 320,
      height: 220,
      is_collapsed: true,
    });
    const child = createBoardItem({
      id: 'from-item',
      parent_item_id: frame.id,
      x: 40,
      y: 60,
      width: 160,
      height: 80,
    });
    const target = createBoardItem({
      id: 'to-item',
      x: 420,
      y: 80,
      width: 180,
      height: 100,
    });

    expect(
      getConnectorPoints(createConnector(), [frame, child, target]),
    ).toBeNull();
  });

  it('migrates connector-link arrows into segment arrow geometry', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 300,
      y: 20,
      width: 120,
      height: 100,
    });
    const legacyArrow = createBoardItem({
      id: 'arrow-1',
      category: ITEM_CATEGORY.connector,
      type: ITEM_TYPE.arrow,
      data_json: null,
    });

    const result = normalizeConnectorArrowsToSegments(
      [fromItem, toItem, legacyArrow],
      [createConnector()],
    );
    const migratedArrow = result.items.find((item) => item.id === 'arrow-1');

    expect(result.migratedIds).toEqual(['arrow-1']);
    expect(migratedArrow?.data_json).toContain('"kind":"segment"');
    expect(migratedArrow?.data_json).toContain(
      '"startConnection":{"itemId":"from-item","anchor":"right"}',
    );
    expect(migratedArrow?.data_json).toContain(
      '"endConnection":{"itemId":"to-item","anchor":"left"}',
    );
  });

  describe('clipboard helpers', () => {
    it('generates a valid UUID v4', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('saves and restores clipboard data and paste count from localStorage/memory fallback', () => {
      // Mock window and localStorage in Node test environment if not present
      const hasWindow = typeof window !== 'undefined';
      if (!hasWindow) {
        const store = new Map<string, string>();
        const mockLocalStorage = {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, val: string) => store.set(key, val),
          removeItem: (key: string) => store.delete(key),
          clear: () => store.clear(),
        };
        (globalThis as any).window = {
          localStorage: mockLocalStorage,
        };
      }

      try {
        // Clear before test
        setClipboardData(null);
        setPasteCount(0);

        expect(getClipboardData()).toBeNull();
        expect(getPasteCount()).toBe(0);

        const testPayload = {
          items: [
            {
              sourceId: 'item-1',
              payload: {
                page_id: 'page-1',
                parent_item_id: null,
                category: 'small_item' as any,
                type: 'text_box',
                title: 'Test',
                content: 'Content',
                content_format: 'plain_text',
                x: 10,
                y: 20,
                width: 100,
                height: 50,
                rotation: 0,
                z_index: 1,
                is_collapsed: false,
                style_json: null,
                data_json: null,
              },
            },
          ],
        };

        setClipboardData(testPayload);
        setPasteCount(3);

        expect(getClipboardData()).toEqual(testPayload);
        expect(getPasteCount()).toBe(3);

        // Verify that it is in localStorage
        const stored = window.localStorage.getItem('planvas_clipboard');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!)).toEqual(testPayload);

        const storedCount = window.localStorage.getItem('planvas_paste_count');
        expect(storedCount).toBe('3');

        // Clear
        setClipboardData(null);
        expect(getClipboardData()).toBeNull();
        expect(window.localStorage.getItem('planvas_clipboard')).toBeNull();
      } finally {
        if (!hasWindow) {
          delete (globalThis as any).window;
        }
      }
    });
  });
});
