/** @vitest-environment jsdom */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import { Inspector } from './Inspector';
import { serializeBoardItemStyle } from './itemStyles';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: 'Font size test',
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

function InspectorHarness({ item }: { item: BoardItem }) {
  const [currentItem, setCurrentItem] = useState(item);

  return (
    <Inspector
      item={currentItem}
      selectionCount={1}
      childCount={0}
      selectedTableCellIds={[]}
      isCollapsed={false}
      onUpdate={setCurrentItem}
      onUpdateTableCells={() => {}}
      onDelete={() => {}}
      onToggleInspector={() => {}}
      onToggleCollapse={() => {}}
    />
  );
}

describe('Inspector font size input', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps an in-progress replacement value instead of snapping back to 32 before commit', async () => {
    await act(async () => {
      root.render(
        <InspectorHarness
          item={createBoardItem({
            style_json: serializeBoardItemStyle({ fontSize: 32 }),
          })}
        />,
      );
    });

    const fontSizeInput = Array.from(
      container.querySelectorAll('input[type="number"]'),
    ).find((input) => input.closest('label')?.textContent?.includes('字級'));

    expect(fontSizeInput).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      (fontSizeInput as HTMLInputElement).focus();
      (fontSizeInput as HTMLInputElement).value = '2';
      fontSizeInput?.dispatchEvent(new Event('input', { bubbles: true }));
      fontSizeInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect((fontSizeInput as HTMLInputElement).value).toBe('2');

    await act(async () => {
      (fontSizeInput as HTMLInputElement).blur();
    });

    const committedFontSizeInput = Array.from(
      container.querySelectorAll('input[type="number"]'),
    ).find((input) => input.closest('label')?.textContent?.includes('字級'));

    expect((committedFontSizeInput as HTMLInputElement).value).toBe('12');
  });
});
