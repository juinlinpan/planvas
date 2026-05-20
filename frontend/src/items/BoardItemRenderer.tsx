import { memo } from 'react';
import { type BoardItem } from '../api';
import type { ProjectDefaultStyle } from '../itemStyles';
import type { SegmentEndpoint } from '../segmentData';
import { Frame, type FrameSummaryEntry } from './Frame';
import { NotePaper } from './NotePaper';
import { SegmentShape } from './SegmentShape';
import { StickyNote } from './StickyNote';
import { Table } from './Table';
import { TextBox } from './TextBox';

type Props = {
  item: BoardItem;
  childSummaries: FrameSummaryEntry[];
  childCount: number;
  className?: string;
  renderMode?: 'interactive' | 'static';
  isSelected: boolean;
  isEditing: boolean;
  canTranslateSegment?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onEndpointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    endpoint: SegmentEndpoint,
  ) => void;
  onWaypointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    waypointIndex: number,
  ) => void;
  onMidpointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    segmentIndex: number,
  ) => void;
  deletingWaypointIndex?: number;
  onDoubleClick: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onToggleCollapse: () => void;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  onTableCellInteractionStart?: () => void;
  onTableSelectedCellsChange?: (cellIds: string[]) => void;
  onTableDeleteSelectedCells?: (cellIds: string[]) => void;
  tableCellSelectionResetKey?: number;
  tableDropTargetCellId?: string | null;
  magnetEnabled?: boolean;
  projectDefaultStyle?: ProjectDefaultStyle;
};

function BoardItemRendererComponent({
  item,
  childSummaries,
  childCount,
  className = '',
  renderMode = 'interactive',
  isSelected,
  isEditing,
  canTranslateSegment = false,
  onMouseDown,
  onContextMenu,
  onEndpointMouseDown,
  onWaypointMouseDown,
  onMidpointMouseDown,
  deletingWaypointIndex,
  onDoubleClick,
  onResizeMouseDown,
  onToggleCollapse,
  onUpdate,
  onEditEnd,
  onTableCellInteractionStart,
  onTableSelectedCellsChange,
  onTableDeleteSelectedCells,
  tableCellSelectionResetKey,
  tableDropTargetCellId,
  magnetEnabled,
  projectDefaultStyle,
}: Props) {
  const isSegmentItem = item.type === 'line' || item.type === 'arrow';
  const isStatic = renderMode === 'static';
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.z_index,
    userSelect: 'none',
    pointerEvents: isSegmentItem ? 'none' : undefined,
  };

  const wrapperClass = `board-item board-item-type-${item.type} ${
    isSelected ? 'is-selected' : ''
  } ${isStatic ? 'is-static' : ''} ${className}`.trim();
  const handleMouseDownCapture = (e: React.MouseEvent) => {
    if (e.button === 1) {
      onMouseDown(e);
    }
  };
  const resizeHandle =
    !isStatic && isSelected && !isEditing && !isSegmentItem ? (
      <button
        type="button"
        className="board-item-resize-handle"
        onMouseDown={onResizeMouseDown}
        aria-label="Resize item"
      />
    ) : null;

  switch (item.type) {
    case 'line':
    case 'arrow':
      return (
        <div
          style={baseStyle}
          className={`${wrapperClass} board-item-segment`}
          onMouseDownCapture={handleMouseDownCapture}
        >
          <SegmentShape
            item={item}
            isSelected={isSelected}
            isEditing={isEditing}
            canTranslate={canTranslateSegment}
            onMouseDown={
              onMouseDown as (e: React.MouseEvent<SVGPathElement>) => void
            }
            onContextMenu={onContextMenu}
            onDoubleClick={onDoubleClick}
            onEndpointMouseDown={onEndpointMouseDown}
            onWaypointMouseDown={onWaypointMouseDown}
            onMidpointMouseDown={onMidpointMouseDown}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            deletingWaypointIndex={deletingWaypointIndex}
            projectDefaultStyle={projectDefaultStyle}
          />
          {resizeHandle}
        </div>
      );

    case 'text_box':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <TextBox
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            projectDefaultStyle={projectDefaultStyle}
          />
          {resizeHandle}
        </div>
      );

    case 'table':
      return (
        <div
          style={baseStyle}
          className={`${wrapperClass} board-item-table`}
          onMouseDownCapture={handleMouseDownCapture}
          onContextMenu={onContextMenu}
        >
          <Table
            key={`table-${item.id}-${tableCellSelectionResetKey ?? 0}`}
            item={item}
            isSelected={isSelected}
            isEditing={isEditing}
            renderMode={renderMode}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            onCellInteractionStart={onTableCellInteractionStart}
            onSelectedCellsChange={onTableSelectedCellsChange}
            onDeleteSelectedCells={onTableDeleteSelectedCells}
            dropTargetCellId={tableDropTargetCellId}
            magnetEnabled={magnetEnabled}
            projectDefaultStyle={projectDefaultStyle}
          />
          {isStatic ? null : (
            <>
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-top"
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-right"
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-bottom"
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-left"
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
            </>
          )}
          {resizeHandle}
        </div>
      );

    case 'sticky_note':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <StickyNote
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            projectDefaultStyle={projectDefaultStyle}
          />
          {resizeHandle}
        </div>
      );

    case 'note_paper':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <NotePaper
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
            projectDefaultStyle={projectDefaultStyle}
            renderMode={renderMode}
          />
          {resizeHandle}
        </div>
      );

    case 'frame':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
        >
          <Frame
            item={item}
            childCount={childCount}
            childSummaries={childSummaries}
            onToggleCollapse={onToggleCollapse}
            showToggle={!isStatic}
            projectDefaultStyle={projectDefaultStyle}
          />
          {resizeHandle}
        </div>
      );

    default:
      return (
        <div
          style={{
            ...baseStyle,
            background: 'rgba(200,200,210,0.7)',
            border: '1px solid rgba(130,130,150,0.4)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#555',
          }}
          className={wrapperClass}
          onMouseDownCapture={handleMouseDownCapture}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
        >
          {item.type}
          {resizeHandle}
        </div>
      );
  }
}

function areFrameSummariesEqual(
  left: FrameSummaryEntry[],
  right: FrameSummaryEntry[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.id === other.id &&
      entry.type === other.type &&
      entry.title === other.title &&
      entry.body === other.body
    );
  });
}

export const BoardItemRenderer = memo(
  BoardItemRendererComponent,
  (prev, next) =>
    prev.item === next.item &&
    prev.childCount === next.childCount &&
    prev.className === next.className &&
    prev.renderMode === next.renderMode &&
    prev.isSelected === next.isSelected &&
    prev.isEditing === next.isEditing &&
    prev.canTranslateSegment === next.canTranslateSegment &&
    prev.deletingWaypointIndex === next.deletingWaypointIndex &&
    prev.tableCellSelectionResetKey === next.tableCellSelectionResetKey &&
    prev.tableDropTargetCellId === next.tableDropTargetCellId &&
    prev.magnetEnabled === next.magnetEnabled &&
    prev.projectDefaultStyle === next.projectDefaultStyle &&
    areFrameSummariesEqual(prev.childSummaries, next.childSummaries),
);
