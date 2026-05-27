/** @vitest-environment jsdom */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardItem } from '../services/api';
import { Inspector } from './Inspector';
import { serializeBoardItemStyle } from '../items/itemStyles';
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
      onDistributeTableRows={() => {}}
      onDistributeTableCols={() => {}}
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

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps an in-progress replacement value instead of snapping back to 32 before commit', () => {
    act(() => {
      root.render(
        <InspectorHarness
          item={createBoardItem({
            style_json: serializeBoardItemStyle({ fontSize: 32 }),
          })}
        />,
      );
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('.inspector-tab[aria-selected="false"]')
        ?.click();
    });

    const fontSizeInput = Array.from(
      container.querySelectorAll('input[type="number"]'),
    ).find((input) =>
      input.closest('label')?.textContent?.includes('Font size'),
    );

    expect(fontSizeInput).toBeInstanceOf(HTMLInputElement);

    act(() => {
      (fontSizeInput as HTMLInputElement).focus();
      (fontSizeInput as HTMLInputElement).value = '2';
      fontSizeInput?.dispatchEvent(new Event('input', { bubbles: true }));
      fontSizeInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect((fontSizeInput as HTMLInputElement).value).toBe('2');

    act(() => {
      (fontSizeInput as HTMLInputElement).blur();
    });

    const committedFontSizeInput = Array.from(
      container.querySelectorAll('input[type="number"]'),
    ).find((input) =>
      input.closest('label')?.textContent?.includes('Font size'),
    );

    expect((committedFontSizeInput as HTMLInputElement).value).toBe('12');
  });

  it('updates text of all selected items together when changing the multi-select textarea', () => {
    const item1 = createBoardItem({ id: 'item-1', content: 'Text 1' });
    const item2 = createBoardItem({ id: 'item-2', content: 'Text 2' });
    const handleUpdateMultiple = vi.fn();

    function MultiSelectInspectorHarness({
      items,
      onUpdateMultiple,
    }: {
      items: BoardItem[];
      onUpdateMultiple: (updated: BoardItem[]) => void;
    }) {
      return (
        <Inspector
          item={items[0]}
          selectedItems={items}
          selectionCount={items.length}
          childCount={0}
          selectedTableCellIds={[]}
          isCollapsed={false}
          onUpdate={() => {}}
          onUpdateMultiple={onUpdateMultiple}
          onDistributeTableRows={() => {}}
          onDistributeTableCols={() => {}}
          onUpdateTableCells={() => {}}
          onDelete={() => {}}
          onToggleInspector={() => {}}
          onToggleCollapse={() => {}}
        />
      );
    }

    act(() => {
      root.render(
        <MultiSelectInspectorHarness
          items={[item1, item2]}
          onUpdateMultiple={handleUpdateMultiple}
        />,
      );
    });

    // Click "文字" tab
    act(() => {
      const tabs = container.querySelectorAll<HTMLButtonElement>('.inspector-tab');
      const textTab = Array.from(tabs).find((tab) => tab.textContent?.trim() === '文字');
      textTab?.click();
    });

    // Find textarea
    const textarea = container.querySelector<HTMLTextAreaElement>('.inspector-textarea');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    act(() => {
      textarea?.focus();
    });

    act(() => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeValueSetter?.call(textarea, 'New Bulk Text');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      textarea?.blur();
    });

    expect(handleUpdateMultiple).toHaveBeenCalledTimes(1);
    const updatedItems = handleUpdateMultiple.mock.calls[0][0];
    expect(updatedItems).toHaveLength(2);
    expect(updatedItems[0].content).toBe('New Bulk Text');
    expect(updatedItems[1].content).toBe('New Bulk Text');
  });
});
