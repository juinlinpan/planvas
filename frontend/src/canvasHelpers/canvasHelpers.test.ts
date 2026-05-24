import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import {
  computeCellChildLayout,
  getSelectionMagnetBounds,
  reorderItemsForLayer,
} from './canvasHelpers';
import { buildSegmentGeometry } from './segmentData';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

function createBoardItem(overrides: Partial<BoardItem>): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
    z_index: 1,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('getSelectionMagnetBounds', () => {
  it('uses actual segment geometry instead of the padded item box', () => {
    const geometry = buildSegmentGeometry(
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    );
    const line = createBoardItem({
      id: 'line-1',
      category: ITEM_CATEGORY.shape,
      type: ITEM_TYPE.line,
      ...geometry,
    });

    const bounds = getSelectionMagnetBounds([line], [line.id]);

    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 100,
      height: 0,
    });
  });

  it('keeps regular items on their normal bounding boxes', () => {
    const note = createBoardItem({
      id: 'note-1',
      category: ITEM_CATEGORY.small_item,
      type: ITEM_TYPE.sticky_note,
      x: 48,
      y: 72,
      width: 168,
      height: 144,
    });

    const bounds = getSelectionMagnetBounds([note], [note.id]);

    expect(bounds).toEqual({
      x: 48,
      y: 72,
      width: 168,
      height: 144,
    });
  });
});

describe('reorderItemsForLayer', () => {
  it('moves an item one level forward', () => {
    const items = [
      createBoardItem({
        id: 'a',
        z_index: 0,
        created_at: '2026-04-20T00:00:00Z',
      }),
      createBoardItem({
        id: 'b',
        z_index: 1,
        created_at: '2026-04-20T00:00:01Z',
      }),
      createBoardItem({
        id: 'c',
        z_index: 2,
        created_at: '2026-04-20T00:00:02Z',
      }),
    ];

    const reordered = reorderItemsForLayer(items, 'b', 'bringForward');

    expect(reordered.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(reordered.map((item) => item.z_index)).toEqual([0, 1, 2]);
  });

  it('moves an item one level backward', () => {
    const items = [
      createBoardItem({
        id: 'a',
        z_index: 0,
        created_at: '2026-04-20T00:00:00Z',
      }),
      createBoardItem({
        id: 'b',
        z_index: 1,
        created_at: '2026-04-20T00:00:01Z',
      }),
      createBoardItem({
        id: 'c',
        z_index: 2,
        created_at: '2026-04-20T00:00:02Z',
      }),
    ];

    const reordered = reorderItemsForLayer(items, 'b', 'sendBackward');

    expect(reordered.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(reordered.map((item) => item.z_index)).toEqual([0, 1, 2]);
  });
});

describe('computeCellChildLayout', () => {
  it('splits multiple cell children vertically by default', () => {
    const first = computeCellChildLayout(
      { x: 10, y: 20, width: 200, height: 100 },
      0,
      2,
      8,
    );
    const second = computeCellChildLayout(
      { x: 10, y: 20, width: 200, height: 100 },
      1,
      2,
      8,
    );

    expect(first).toEqual({ x: 18, y: 28, width: 184, height: 34 });
    expect(second).toEqual({ x: 18, y: 78, width: 184, height: 34 });
  });

  it('splits multiple cell children horizontally when requested', () => {
    const first = computeCellChildLayout(
      { x: 10, y: 20, width: 200, height: 100 },
      0,
      2,
      8,
      'horizontal',
    );
    const second = computeCellChildLayout(
      { x: 10, y: 20, width: 200, height: 100 },
      1,
      2,
      8,
      'horizontal',
    );

    expect(first).toEqual({ x: 18, y: 28, width: 84, height: 84 });
    expect(second).toEqual({ x: 118, y: 28, width: 84, height: 84 });
  });

  it('keeps children inside very small cell bounds', () => {
    const layout = computeCellChildLayout(
      { x: 10, y: 20, width: 12, height: 10 },
      0,
      1,
      8,
    );

    expect(layout.x).toBeGreaterThanOrEqual(10);
    expect(layout.y).toBeGreaterThanOrEqual(20);
    expect(layout.x + layout.width).toBeLessThanOrEqual(22);
    expect(layout.y + layout.height).toBeLessThanOrEqual(30);
  });

  it('keeps split children inside very small horizontal slices', () => {
    const first = computeCellChildLayout(
      { x: 10, y: 20, width: 20, height: 10 },
      0,
      2,
      8,
      'horizontal',
    );
    const second = computeCellChildLayout(
      { x: 10, y: 20, width: 20, height: 10 },
      1,
      2,
      8,
      'horizontal',
    );

    expect(first.x).toBeGreaterThanOrEqual(10);
    expect(first.y).toBeGreaterThanOrEqual(20);
    expect(first.x + first.width).toBeLessThanOrEqual(20);
    expect(first.y + first.height).toBeLessThanOrEqual(30);
    expect(second.x).toBeGreaterThanOrEqual(20);
    expect(second.y).toBeGreaterThanOrEqual(20);
    expect(second.x + second.width).toBeLessThanOrEqual(30);
    expect(second.y + second.height).toBeLessThanOrEqual(30);
  });
});
