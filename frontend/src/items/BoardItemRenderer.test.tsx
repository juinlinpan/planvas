import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../services/api';
import { createTableData, serializeTableData } from '../tableData/tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types/index';
import { BoardItemRenderer } from './BoardItemRenderer';

const FIXTURE_TIMESTAMP = '2026-04-20T00:00:00+00:00';

function createTableItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'table-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.shape,
    type: ITEM_TYPE.table,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 360,
    height: 240,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: serializeTableData(createTableData()),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

function createLineItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'line-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.shape,
    type: ITEM_TYPE.line,
    title: null,
    content: 'Depends on API',
    content_format: null,
    x: 0,
    y: 0,
    width: 240,
    height: 48,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: JSON.stringify({
      backgroundColor: 'transparent',
      segmentTextHorizontalPosition: 'center',
      segmentTextVerticalPosition: 'top',
      segmentTextOrientation: 'slope',
    }),
    data_json: JSON.stringify({
      start: { x: 0, y: 24 },
      end: { x: 240, y: 24 },
    }),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

describe('BoardItemRenderer', () => {
  it('renders dedicated table border hit areas for dragging', () => {
    const markup = renderToStaticMarkup(
      <BoardItemRenderer
        item={createTableItem()}
        childSummaries={[]}
        childCount={0}
        isSelected={false}
        isEditing={false}
        onMouseDown={() => {}}
        onEndpointMouseDown={() => {}}
        onWaypointMouseDown={() => {}}
        onMidpointMouseDown={() => {}}
        onDoubleClick={() => {}}
        onResizeMouseDown={() => {}}
        onToggleCollapse={() => {}}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('board-item-table-edge-top');
    expect(markup).toContain('board-item-table-edge-right');
    expect(markup).toContain('board-item-table-edge-bottom');
    expect(markup).toContain('board-item-table-edge-left');
  });

  it('renders line text labels from item content', () => {
    const markup = renderToStaticMarkup(
      <BoardItemRenderer
        item={createLineItem()}
        childSummaries={[]}
        childCount={0}
        isSelected={false}
        isEditing={false}
        onMouseDown={() => {}}
        onEndpointMouseDown={() => {}}
        onWaypointMouseDown={() => {}}
        onMidpointMouseDown={() => {}}
        onDoubleClick={() => {}}
        onResizeMouseDown={() => {}}
        onToggleCollapse={() => {}}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('segment-text-label');
    expect(markup).toContain('Depends on API');
    expect(markup).toContain('is-above');
  });
});
