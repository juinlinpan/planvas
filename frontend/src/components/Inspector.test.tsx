import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BoardItem } from '../services/api';
import { Inspector } from './Inspector';
import { BACKGROUND_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../items/itemStyles';
import { createTableData, serializeTableData } from '../tableData/tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types/index';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: 'Palette test',
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

function renderInspector(
  item: BoardItem,
  overrides: Partial<ComponentProps<typeof Inspector>> = {},
) {
  return renderToStaticMarkup(
    <Inspector
      item={item}
      selectionCount={1}
      childCount={0}
      selectedTableCellIds={[]}
      isCollapsed={false}
      onUpdate={() => {}}
      onUpdateTableCells={() => {}}
      onDelete={() => {}}
      onToggleInspector={() => {}}
      onToggleCollapse={() => {}}
      {...overrides}
    />,
  );
}

describe('Inspector style palette', () => {
  it('renders a compact restore rail when the inspector is collapsed', () => {
    const markup = renderToStaticMarkup(
      <Inspector
        item={createBoardItem()}
        selectionCount={1}
        childCount={0}
        selectedTableCellIds={[]}
        isCollapsed
        onUpdate={() => {}}
        onUpdateTableCells={() => {}}
        onDelete={() => {}}
        onToggleInspector={() => {}}
        onToggleCollapse={() => {}}
      />,
    );

    expect(markup).toContain('inspector-collapsed');
    expect(markup).toContain('Expand inspector');
    expect(markup).not.toContain('Line Style');
  });

  it('renders style and text tabs for a selected item', () => {
    const markup = renderInspector(createBoardItem());

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('樣式');
    expect(markup).toContain('文字');
  });

  it('renders fixed swatch buttons instead of freeform color inputs for text items', () => {
    const markup = renderInspector(createBoardItem());
    const swatchCount = (markup.match(/inspector-swatch-button/g) ?? []).length;

    expect(markup).not.toContain('type="color"');
    expect(swatchCount).toBe(
      BACKGROUND_COLOR_OPTIONS.length + TEXT_COLOR_OPTIONS.length,
    );
  });

  it('treats freeform arrows as segment items instead of legacy connectors', () => {
    const markup = renderInspector(
      createBoardItem({
        category: ITEM_CATEGORY.connector,
        type: ITEM_TYPE.arrow,
        width: 220,
        height: 100,
        data_json: JSON.stringify({
          kind: 'segment',
          start: { x: 20, y: 20 },
          end: { x: 180, y: 80 },
        }),
      }),
    );

    expect(markup).toContain('Line Style');
    expect(markup).not.toContain('ID');
  });

  it('renders table-cell background controls for selected table cells', () => {
    const tableData = createTableData(2, 2);
    const firstCellId = tableData.cells[0]?.[0]?.id;
    if (!firstCellId) {
      throw new Error('Missing fixture table cell');
    }

    const markup = renderInspector(
      createBoardItem({
        category: ITEM_CATEGORY.shape,
        type: ITEM_TYPE.table,
        width: 320,
        height: 160,
        content: null,
        content_format: null,
        data_json: serializeTableData(tableData),
      }),
      {
        selectedTableCellIds: [firstCellId],
        onUpdate: vi.fn(),
        onUpdateTableCells: vi.fn(),
      },
    );

    expect(markup).toContain('Background color');
    expect(markup).toContain('aria-label="Background color');
  });

  it('keeps table cell content controls on the style tab and hides row/col fields', () => {
    const tableData = createTableData(2, 2);
    const markup = renderInspector(
      createBoardItem({
        category: ITEM_CATEGORY.shape,
        type: ITEM_TYPE.table,
        width: 320,
        height: 160,
        content: null,
        content_format: null,
        data_json: serializeTableData(tableData),
      }),
    );

    expect(markup).toContain('meta-label">Table Cell<');
    expect(markup).toContain('Cell text');
    expect(markup).toContain('Item layout');
    expect(markup).toContain('Vertical');
    expect(markup).toContain('Horizontal');
    expect(markup).not.toContain('Rows');
    expect(markup).not.toContain('Columns');
  });

  it('renders optional table name editing in the style tab', () => {
    const tableData = {
      ...createTableData(2, 2),
      name: 'Sprint board',
      labelFontSize: 18,
    };
    const markup = renderInspector(
      createBoardItem({
        category: ITEM_CATEGORY.shape,
        type: ITEM_TYPE.table,
        width: 320,
        height: 160,
        content: null,
        content_format: null,
        data_json: serializeTableData(tableData),
      }),
    );

    expect(markup).toContain('Table name');
    expect(markup).toContain('value="Sprint board"');
    expect(markup).toContain('placeholder="Table name"');
    expect(markup).not.toContain('Label font size');
  });

  it('shows the markdown filename field for note paper items', () => {
    const markup = renderInspector(
      createBoardItem({
        type: ITEM_TYPE.note_paper,
        content: '# Sprint note',
        content_format: 'markdown',
        data_json: JSON.stringify({ noteFile: 'Sprint-note.md' }),
      }),
    );

    expect(markup).toContain('Markdown file');
    expect(markup).toContain('value="Sprint-note.md"');
  });
});
