import { memo } from 'react';
import { type BoardItem } from '../services/api';
import type { ProjectDefaultStyle } from './itemStyles';
import type { ResizeEdge } from '../types/canvas';
import type { SegmentEndpoint } from '../utils/export/segmentData';
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
  renderZIndex?: number;
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
  onResizeMouseDown: (e: React.MouseEvent, edge: ResizeEdge) => void;
  onToggleCollapse: () => void;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  onTableCellInteractionStart?: () => void;
  onTableSelectedCellsChange?: (cellIds: string[]) => void;
  onTableDeleteSelectedCells?: (cellIds: string[]) => void;
  tableCellSelectionResetKey?: number;
  tableDropTargetCellId?: string | null;
  magnetEnabled?: boolean;
  viewportZoom?: number;
  projectDefaultStyle?: ProjectDefaultStyle;
};

function BoardItemRendererComponent({
  item,
  childSummaries,
  childCount,
  className = '',
  renderZIndex,
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
  viewportZoom = 1,
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
    zIndex: renderZIndex ?? item.z_index,
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
  const isTable = item.type === 'table';
  const isInsideParent = item.parent_item_id !== null;

  // Scale hit areas inversely with zoom so they remain usable when zoomed out.
  // Cap at 6x to avoid covering large portions of small items.
  const hitScale = Math.min(1 / viewportZoom, 6);
  const edgeThickness = Math.round(14 * hitScale);
  const handleSize = Math.round(12 * hitScale);
  const handleOffset = -Math.round(6 * hitScale);

  const cornerHandleStyle: React.CSSProperties = { width: handleSize, height: handleSize };
  const resizeHandles =
    !isStatic && isSelected && !isEditing && !isSegmentItem && !isInsideParent ? (
      <>
        <button
          type="button"
          className="board-item-resize-handle board-item-resize-handle-nw"
          style={{ ...cornerHandleStyle, top: handleOffset, left: handleOffset }}
          onMouseDown={(e) => onResizeMouseDown(e, 'nw')}
          aria-label="Resize northwest"
        />
        <button
          type="button"
          className="board-item-resize-handle board-item-resize-handle-ne"
          style={{ ...cornerHandleStyle, top: handleOffset, right: handleOffset }}
          onMouseDown={(e) => onResizeMouseDown(e, 'ne')}
          aria-label="Resize northeast"
        />
        <button
          type="button"
          className="board-item-resize-handle board-item-resize-handle-se"
          style={{ ...cornerHandleStyle, bottom: handleOffset, right: handleOffset }}
          onMouseDown={(e) => onResizeMouseDown(e, 'se')}
          aria-label="Resize southeast"
        />
        <button
          type="button"
          className="board-item-resize-handle board-item-resize-handle-sw"
          style={{ ...cornerHandleStyle, bottom: handleOffset, left: handleOffset }}
          onMouseDown={(e) => onResizeMouseDown(e, 'sw')}
          aria-label="Resize southwest"
        />
        {!isTable && (
          <>
            <button
              type="button"
              className="board-item-resize-handle board-item-resize-handle-n"
              style={{ ...cornerHandleStyle, top: handleOffset }}
              onMouseDown={(e) => onResizeMouseDown(e, 'n')}
              aria-label="Resize north"
            />
            <button
              type="button"
              className="board-item-resize-handle board-item-resize-handle-e"
              style={{ ...cornerHandleStyle, right: handleOffset }}
              onMouseDown={(e) => onResizeMouseDown(e, 'e')}
              aria-label="Resize east"
            />
            <button
              type="button"
              className="board-item-resize-handle board-item-resize-handle-s"
              style={{ ...cornerHandleStyle, bottom: handleOffset }}
              onMouseDown={(e) => onResizeMouseDown(e, 's')}
              aria-label="Resize south"
            />
            <button
              type="button"
              className="board-item-resize-handle board-item-resize-handle-w"
              style={{ ...cornerHandleStyle, left: handleOffset }}
              onMouseDown={(e) => onResizeMouseDown(e, 'w')}
              aria-label="Resize west"
            />
          </>
        )}
      </>
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
          {resizeHandles}
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
          {resizeHandles}
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
                style={{ height: edgeThickness }}
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-right"
                style={{ width: edgeThickness }}
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-bottom"
                style={{ height: edgeThickness }}
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
              <button
                type="button"
                className="board-item-table-edge board-item-table-edge-left"
                style={{ width: edgeThickness }}
                aria-label="Move table"
                tabIndex={-1}
                onMouseDown={onMouseDown}
                onContextMenu={onContextMenu}
              />
            </>
          )}
          {resizeHandles}
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
          {resizeHandles}
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
          {resizeHandles}
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
          {resizeHandles}
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
          {resizeHandles}
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
    prev.renderZIndex === next.renderZIndex &&
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
