import { type BoardItem } from '../services/api';
import { useState } from 'react';

import {
  resolveBoardItemStyle,
  type ColorOption,
  type ProjectDefaultStyle,
} from '../items/itemStyles';
import { hasStoredSegmentData } from '../utils/export/segmentData';
import {
  countFilledTableCells,
  getEffectiveTableCellChildLayoutDirection,
  parseTableData,
  type TableCellData,
} from '../tableData/tableData';
import { ITEM_TYPE, ITEM_TYPE_LABEL } from '../types/index';
import { PositionSizeSection } from '../inspector/PositionSizeSection';
import { ContentSection } from '../inspector/ContentSection';
import { TextStylePanel } from '../inspector/TextStylePanel';
import { SegmentPanel } from '../inspector/SegmentPanel';
import { TablePanel } from '../inspector/TablePanel';

type Props = {
  item: BoardItem | null;
  selectionCount: number;
  childCount: number;
  selectedTableCellIds: string[];
  isCollapsed: boolean;
  onUpdate: (item: BoardItem) => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
  onDelete: () => void;
  onToggleInspector: () => void;
  onToggleCollapse: () => void;
  projectDefaultStyle?: ProjectDefaultStyle;
};

type InspectorTab = 'style' | 'text';

function summarizeContent(item: BoardItem): string {
  if (item.type === ITEM_TYPE.table) {
    const tableData = parseTableData(item.data_json);
    const filledCells = countFilledTableCells(tableData);
    return `${tableData.rows} x ${tableData.cols} table, ${filledCells} filled cells`;
  }

  if (item.content === null || item.content.trim().length === 0) {
    return 'No content';
  }

  return `${item.content.trim().length} characters`;
}

function isTextContentItem(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

export function ColorPaletteField({
  label,
  options,
  selectedValue,
  tone,
  onSelect,
}: {
  label: string;
  options: readonly ColorOption[];
  selectedValue: string;
  tone: 'background' | 'text';
  onSelect: (value: string) => void;
}) {
  return (
    <div className="inspector-color-field">
      <span>{label}</span>
      <div className="inspector-palette-grid" aria-label={label}>
        {options.map((option) => {
          const isActive = option.value === selectedValue;

          return (
            <button
              key={option.value}
              type="button"
              className={`inspector-swatch-button ${isActive ? 'is-active' : ''}`}
              aria-label={`${label} ${option.name}`}
              aria-pressed={isActive}
              title={`${option.name} ${option.value}`}
              onClick={() => onSelect(option.value)}
            >
              {tone === 'background' ? (
                <span
                  className="inspector-swatch-chip"
                  style={{ backgroundColor: option.value }}
                />
              ) : (
                <span
                  className="inspector-swatch-letter"
                  style={{ color: option.value }}
                >
                  A
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CommitNumberInput({
  inputKey,
  min,
  max,
  value,
  disabled,
  onCommit,
}: {
  inputKey: string;
  min: number;
  max: number;
  value: number;
  disabled?: boolean;
  onCommit: (rawValue: string) => void;
}) {
  return (
    <input
      key={inputKey}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      defaultValue={value}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function Inspector({
  item,
  selectionCount,
  childCount,
  selectedTableCellIds,
  isCollapsed,
  onUpdate,
  onUpdateTableCells,
  onDelete,
  onToggleInspector,
  onToggleCollapse,
  projectDefaultStyle,
}: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('style');

  if (isCollapsed) {
    return (
      <aside className="canvas-inspector is-collapsed">
        <div className="inspector-collapsed">
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Expand inspector"
            onClick={onToggleInspector}
            title="Expand inspector"
          >
            &lt;
          </button>
          <span className="inspector-collapsed-label">Inspector</span>
        </div>
      </aside>
    );
  }

  if (item === null) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-empty">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <p>Select an item to inspect it.</p>
        </div>
      </aside>
    );
  }

  if (selectionCount > 1) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-panel">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <div className="inspector-title-row">
            <div>
              <h3>{selectionCount} selected</h3>
              <p className="inspector-meta">
                Multi-select editing is limited to delete and layer actions.
              </p>
            </div>
            <button className="ghost-button danger-button" onClick={onDelete}>
              Delete
            </button>
          </div>

          <section className="inspector-section">
            <p className="meta-label">Primary Selection</p>
            <p className="inspector-meta">
              {ITEM_TYPE_LABEL[item.type as keyof typeof ITEM_TYPE_LABEL] ??
                item.type}
            </p>
          </section>
        </div>
      </aside>
    );
  }
  const selectedItem = item;
  const isArrow = selectedItem.type === ITEM_TYPE.arrow;
  const isLine = selectedItem.type === ITEM_TYPE.line;
  const isSegmentItem =
    (isArrow || isLine) && hasStoredSegmentData(selectedItem);
  const isTable = selectedItem.type === ITEM_TYPE.table;
  const supportsContent = isTextContentItem(selectedItem);
  const supportsTitle = selectedItem.type === ITEM_TYPE.frame;
  const supportsTextStyling = !isArrow && !isLine && !isTable;
  const supportsLineStyling = isLine || isArrow;
  const tableData = isTable ? parseTableData(selectedItem.data_json) : null;
  const resolvedStyle = resolveBoardItemStyle(
    selectedItem,
    projectDefaultStyle,
  );
  const selectedTableCells =
    isTable && tableData !== null && selectedTableCellIds.length > 0
      ? tableData.cells
          .flat()
          .filter(
            (cell): cell is TableCellData =>
              cell !== null && selectedTableCellIds.includes(cell.id),
          )
      : [];
  const selectedTableCellBackgroundColor =
    selectedTableCells.length > 0
      ? selectedTableCells.every(
          (cell) =>
            (cell.backgroundColor ?? resolvedStyle.backgroundColor) ===
            (selectedTableCells[0]?.backgroundColor ??
              resolvedStyle.backgroundColor),
        )
        ? (selectedTableCells[0]?.backgroundColor ??
          resolvedStyle.backgroundColor)
        : resolvedStyle.backgroundColor
      : resolvedStyle.backgroundColor;
  const selectedTableCellTextContent =
    selectedTableCells.length === 1
      ? (selectedTableCells[0]?.content ?? '')
      : '';
  const selectedTableCellHorizontalAlign =
    selectedTableCells.length > 0 &&
    selectedTableCells.every(
      (cell) =>
        (cell.textHorizontalAlign ?? 'center') ===
        (selectedTableCells[0]?.textHorizontalAlign ?? 'center'),
    )
      ? (selectedTableCells[0]?.textHorizontalAlign ?? 'center')
      : 'center';
  const selectedTableCellVerticalAlign =
    selectedTableCells.length > 0 &&
    selectedTableCells.every(
      (cell) =>
        (cell.textVerticalAlign ?? 'middle') ===
        (selectedTableCells[0]?.textVerticalAlign ?? 'middle'),
    )
      ? (selectedTableCells[0]?.textVerticalAlign ?? 'middle')
      : 'middle';
  const tableChildLayoutDirection =
    tableData?.childLayoutDirection ?? 'vertical';
  const selectedTableCellChildLayoutDirection =
    isTable && tableData !== null && selectedTableCells.length > 0
      ? selectedTableCells.every(
          (cell) =>
            getEffectiveTableCellChildLayoutDirection(tableData, cell) ===
            getEffectiveTableCellChildLayoutDirection(
              tableData,
              selectedTableCells[0],
            ),
        )
        ? getEffectiveTableCellChildLayoutDirection(
            tableData,
            selectedTableCells[0],
          )
        : 'vertical'
      : tableChildLayoutDirection;
  return (
    <aside className="canvas-inspector">
      <div className="inspector-panel">
        <div className="inspector-header-row">
          <p className="eyebrow">Inspector</p>
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Collapse inspector"
            onClick={onToggleInspector}
            title="Collapse inspector"
          >
            &gt;
          </button>
        </div>
        <div className="inspector-title-row">
          <div>
            <h3>
              {ITEM_TYPE_LABEL[
                selectedItem.type as keyof typeof ITEM_TYPE_LABEL
              ] ?? selectedItem.type}
            </h3>
            <p className="inspector-meta">
              {isSegmentItem
                ? 'Segment connector with editable endpoints and bends.'
                : summarizeContent(selectedItem)}
            </p>
          </div>
          <button className="ghost-button danger-button" onClick={onDelete}>
            刪除
          </button>
        </div>

        <div
          className="inspector-tabs"
          role="tablist"
          aria-label="Inspector sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'style'}
            className={`inspector-tab ${activeTab === 'style' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('style')}
          >
            樣式
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'text'}
            className={`inspector-tab ${activeTab === 'text' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            文字
          </button>
        </div>

        <div
          className="inspector-tab-panel"
          role="tabpanel"
          aria-label={activeTab === 'style' ? '樣式' : '文字'}
        >
          {activeTab === 'style' ? (
            <>
              <PositionSizeSection
                item={selectedItem}
                isSegmentItem={isSegmentItem}
                isLine={isLine}
                onUpdate={onUpdate}
              />

              {supportsContent || supportsTitle ? (
                <ContentSection
                  item={selectedItem}
                  childCount={childCount}
                  onUpdate={onUpdate}
                  onToggleCollapse={onToggleCollapse}
                />
              ) : null}
            </>
          ) : null}

        {isTable ? (
          <TablePanel
            activeTab={activeTab}
            item={selectedItem}
            tableData={tableData}
            selectedTableCells={selectedTableCells}
            selectedTableCellIds={selectedTableCellIds}
            selectedTableCellBackgroundColor={selectedTableCellBackgroundColor}
            selectedTableCellTextContent={selectedTableCellTextContent}
            selectedTableCellHorizontalAlign={selectedTableCellHorizontalAlign}
            selectedTableCellVerticalAlign={selectedTableCellVerticalAlign}
            selectedTableCellChildLayoutDirection={selectedTableCellChildLayoutDirection}
            tableChildLayoutDirection={tableChildLayoutDirection}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
            onUpdateTableCells={onUpdateTableCells}
          />
        ) : null}

        {supportsTextStyling ? (
          <TextStylePanel
            activeTab={activeTab}
            item={selectedItem}
            isTable={isTable}
            isSegmentItem={isSegmentItem}
            selectedTableCells={selectedTableCells}
            selectedTableCellIds={selectedTableCellIds}
            selectedTableCellBackgroundColor={selectedTableCellBackgroundColor}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
            onUpdateTableCells={onUpdateTableCells}
          />
        ) : null}

        {supportsLineStyling ? (
          <SegmentPanel
            activeTab={activeTab}
            item={selectedItem}
            isArrow={isArrow}
            isLine={isLine}
            isSegmentItem={isSegmentItem}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
          />
        ) : null}
        </div>
      </div>
    </aside>
  );
}
