import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../api';
import { createTableData, mergeCells, serializeTableData } from '../tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types';
import {
  buildTableGridLines,
  getMagnetSnappedTableDividerPosition,
  Table,
} from './Table';

const FIXTURE_TIMESTAMP = '2026-04-15T00:00:00+00:00';

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

describe('Table', () => {
  it('shows divider controls when selected', () => {
    const markup = renderToStaticMarkup(
      <Table
        item={createTableItem()}
        isSelected={true}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('table-v2-col-divider');
    expect(markup).toContain('table-v2-row-divider');
    expect(markup).not.toContain('table-v2-add-btn');
  });

  it('hides divider controls when not selected or editing', () => {
    const markup = renderToStaticMarkup(
      <Table
        item={createTableItem()}
        isSelected={false}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).not.toContain('table-v2-col-divider');
    expect(markup).not.toContain('table-v2-row-divider');
    expect(markup).not.toContain('table-v2-add-btn');
  });

  it('applies table item typography to cell text', () => {
    const markup = renderToStaticMarkup(
      <Table
        item={createTableItem({
          style_json: JSON.stringify({
            textColor: '#1d4ed8',
            fontSize: 22,
            fontWeight: 'bold',
            fontStyle: 'italic',
          }),
        })}
        isSelected={false}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('color:#1d4ed8');
    expect(markup).toContain('font-size:22px');
    expect(markup).toContain('font-weight:bold');
    expect(markup).toContain('font-style:italic');
  });

  it('renders a top-left table name label only when a name exists', () => {
    const namedData = {
      ...createTableData(),
      name: 'Roadmap',
      labelFontSize: 18,
    };
    const namedMarkup = renderToStaticMarkup(
      <Table
        item={createTableItem({ data_json: serializeTableData(namedData) })}
        isSelected={false}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );
    const unnamedMarkup = renderToStaticMarkup(
      <Table
        item={createTableItem()}
        isSelected={false}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(namedMarkup).toContain('table-v2-name-label');
    expect(namedMarkup).toContain('Roadmap');
    expect(namedMarkup).toContain('font-size:18px');
    expect(unnamedMarkup).not.toContain('table-v2-name-label');
  });

  it('snaps column divider positions to global grid coordinates', () => {
    const item = createTableItem({ x: 10, width: 360 });

    expect(getMagnetSnappedTableDividerPosition(item, 'col', 0.51)).toBeCloseTo(
      (192 - 10) / 360,
      5,
    );
  });

  it('snaps row divider positions to global grid coordinates', () => {
    const item = createTableItem({ y: 7, height: 240 });

    expect(getMagnetSnappedTableDividerPosition(item, 'row', 0.57)).toBeCloseTo(
      (144 - 7) / 240,
      5,
    );
  });

  it('draws grid lines from merged cell bounds without duplicated cell borders', () => {
    const tableData = createTableData(3, 3);
    const mergedData = mergeCells(tableData, [
      [0, 0],
      [0, 1],
    ]);
    const lines = buildTableGridLines(mergedData);
    const lineKeys = lines.map(
      (line) => `${line.x1},${line.y1},${line.x2},${line.y2}`,
    );

    expect(new Set(lineKeys).size).toBe(lineKeys.length);
    expect(lines).toContainEqual({
      key: 'v-33.33333-33.33333-100',
      x1: 33.33333,
      y1: 33.33333,
      x2: 33.33333,
      y2: 100,
      isOuter: false,
    });
    expect(lines).not.toContainEqual({
      key: 'v-33.33333-0-33.33333',
      x1: 33.33333,
      y1: 0,
      x2: 33.33333,
      y2: 33.33333,
      isOuter: false,
    });
    expect(lines).toContainEqual({
      key: 'h-0-0-100',
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      isOuter: true,
    });
  });
});
