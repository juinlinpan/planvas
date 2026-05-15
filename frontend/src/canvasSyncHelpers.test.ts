import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import { getAnchorPoint } from './canvasHelpers';
import { syncSegmentConnectionsInItems } from './canvasSyncHelpers';
import {
  buildSegmentGeometry,
  getSegmentConnections,
  getSegmentWorldPoints,
} from './segmentData';
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

describe('syncSegmentConnectionsInItems', () => {
  it('keeps a segment endpoint attached when a frame child is ejected', () => {
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
      x: 160,
      y: 180,
      width: 120,
      height: 80,
    });
    const target = createBoardItem({
      id: 'target-1',
      x: 560,
      y: 180,
      width: 120,
      height: 80,
    });
    const segment = createBoardItem({
      id: 'arrow-1',
      category: ITEM_CATEGORY.connector,
      type: ITEM_TYPE.arrow,
      ...buildSegmentGeometry(
        getAnchorPoint(child, 'right'),
        getAnchorPoint(target, 'left'),
        null,
        { itemId: child.id, anchor: 'right' },
        { itemId: target.id, anchor: 'left' },
      ),
    });
    const ejectedChild = {
      ...child,
      parent_item_id: null,
      x: frame.x + frame.width + 24,
      y: child.y,
    };

    const result = syncSegmentConnectionsInItems(
      [frame, ejectedChild, target, segment],
      [child.id],
    );
    const updatedSegment = result.items.find((item) => item.id === segment.id);

    expect(updatedSegment).toBeDefined();
    expect(result.updatedSegments.map((item) => item.id)).toEqual([segment.id]);
    expect(getSegmentConnections(updatedSegment!).startConnection).toEqual({
      itemId: child.id,
      anchor: 'right',
    });
    expect(getSegmentWorldPoints(updatedSegment!)?.start).toEqual(
      getAnchorPoint(ejectedChild, 'right'),
    );
  });
});
