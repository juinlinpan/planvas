import { useMemo } from 'react';
import type { BoardItem } from './api';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { SegmentShape } from './items/SegmentShape';
import {
  getFrameChildren,
  isFrame,
} from './canvasHelpers/frameLayout';
import {
  isHiddenByCollapsedFrame,
} from './canvasHelpers/selection';
import { summarizeFrameChild } from './canvasHelpers/contentSummary';
import { getItemConnectorAnchors } from './canvasHelpers/connectorAnchors';
import { canTranslateSegmentItem, buildSegmentGeometry, type SegmentEndpoint } from './segmentData';
import { ITEM_CATEGORY, ITEM_CATEGORY_FOR_TYPE, ITEM_TYPE } from './types';
import type { AnchorHit, TableCellHit } from './canvasHelpers/types';
import type { SegmentDraftState, ResizeEdge } from './canvasTypes';
import type { ProjectDefaultStyle } from './itemStyles';

type CanvasItemLayerProps = {
  pageId: string;
  items: BoardItem[];
  selectedIdSet: Set<string>;
  editingId: string | null;
  activeFrameDropTargetId: string | null;
  activeTableDropTarget: TableCellHit | null;
  frameItemAnimations: Record<string, 'ingest' | 'eject' | undefined>;
  deletingWaypointInfo: { itemId: string; waypointIndex: number } | null;
  tableCellSelectionResetKey: number;
  magnetEnabled: boolean;
  projectDefaultStyle: ProjectDefaultStyle;
  segmentDraft: SegmentDraftState | null;
  anchorIndicatorItems: BoardItem[];
  activeAnchorHit: AnchorHit | null;

  handleItemMouseDown: (e: React.MouseEvent<any>, itemId: string) => void;
  handleItemContextMenu: (e: React.MouseEvent<any>, itemId: string) => void;
  handleSegmentEndpointMouseDown: (e: React.MouseEvent<any>, itemId: string, endpoint: SegmentEndpoint) => void;
  handleSegmentWaypointMouseDown: (e: React.MouseEvent<any>, itemId: string, waypointIndex: number) => void;
  handleSegmentMidpointMouseDown: (e: React.MouseEvent<any>, itemId: string, segmentIndex: number) => void;
  handleItemDoubleClick: (item: BoardItem) => void;
  handleResizeMouseDown: (e: React.MouseEvent<any>, itemId: string, edge: ResizeEdge) => void;
  handleToggleFrameCollapse: (itemId: string) => void;
  handleItemUpdate: (item: BoardItem) => void;
  handleEditEnd: () => void;
  setTableInspectorSelection: (selection: { tableId: string; cellIds: string[] } | null) => void;
  handleDeleteTableCells: (tableId: string, cellIds: string[]) => Promise<boolean>;
};

export function CanvasItemLayer({
  pageId,
  items,
  selectedIdSet,
  editingId,
  activeFrameDropTargetId,
  activeTableDropTarget,
  frameItemAnimations,
  deletingWaypointInfo,
  tableCellSelectionResetKey,
  magnetEnabled,
  projectDefaultStyle,
  segmentDraft,
  anchorIndicatorItems,
  activeAnchorHit,

  handleItemMouseDown,
  handleItemContextMenu,
  handleSegmentEndpointMouseDown,
  handleSegmentWaypointMouseDown,
  handleSegmentMidpointMouseDown,
  handleItemDoubleClick,
  handleResizeMouseDown,
  handleToggleFrameCollapse,
  handleItemUpdate,
  handleEditEnd,
  setTableInspectorSelection,
  handleDeleteTableCells,
}: CanvasItemLayerProps) {
  const visibleItems = useMemo(
    () =>
      [...items]
        .filter((item) => !isHiddenByCollapsedFrame(item, items))
        .sort(
          (a, b) =>
            a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
        ),
    [items],
  );

  const frameChildrenById = useMemo(() => {
    const childrenById = new Map<string, BoardItem[]>();
    for (const item of items) {
      if (item.parent_item_id === null) {
        continue;
      }

      const children = childrenById.get(item.parent_item_id);
      if (children === undefined) {
        childrenById.set(item.parent_item_id, [item]);
      } else {
        children.push(item);
      }
    }
    return childrenById;
  }, [items]);

  const frameChildSummariesById = useMemo(() => {
    const summariesById = new Map<
      string,
      ReturnType<typeof summarizeFrameChild>[]
    >();
    for (const [frameId, childItems] of frameChildrenById) {
      summariesById.set(frameId, childItems.map(summarizeFrameChild));
    }
    return summariesById;
  }, [frameChildrenById]);

  const segmentDraftPreviewItem = useMemo(() => {
    if (segmentDraft === null) {
      return null;
    }

    const geometry = buildSegmentGeometry(
      segmentDraft.start,
      segmentDraft.end,
      null,
    );
    return {
      id: '__segment-draft__',
      page_id: pageId,
      parent_item_id: null,
      category:
        ITEM_CATEGORY_FOR_TYPE[segmentDraft.type] ?? ITEM_CATEGORY.shape,
      type: segmentDraft.type,
      title: null,
      content: null,
      content_format: null,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: geometry.rotation,
      z_index: Number.MAX_SAFE_INTEGER,
      is_collapsed: false,
      style_json: null,
      data_json: geometry.data_json,
      created_at: 'draft',
      updated_at: 'draft',
    } satisfies BoardItem;
  }, [pageId, segmentDraft]);

  return (
    <>
      {visibleItems.map((item) => {
        const childItems = isFrame(item)
          ? (frameChildrenById.get(item.id) ?? [])
          : [];
        const itemAnimation = frameItemAnimations[item.id];
        const isTableDropTarget =
          item.type === 'table' &&
          activeTableDropTarget?.tableId === item.id;
        const itemClassName = [
          isFrame(item) && activeFrameDropTargetId === item.id
            ? 'is-frame-drop-target'
            : '',
          isTableDropTarget ? 'is-table-drop-target' : '',
          itemAnimation === 'ingest' ? 'is-frame-ingest' : '',
          itemAnimation === 'eject' ? 'is-frame-eject' : '',
        ]
          .filter((className) => className.length > 0)
          .join(' ');
        return (
          <BoardItemRenderer
            key={item.id}
            item={item}
            childCount={childItems.length}
            childSummaries={frameChildSummariesById.get(item.id) ?? []}
            className={itemClassName}
            isSelected={selectedIdSet.has(item.id)}
            isEditing={item.id === editingId}
            canTranslateSegment={canTranslateSegmentItem(item)}
            onMouseDown={(e) => handleItemMouseDown(e, item.id)}
            onContextMenu={(e) => handleItemContextMenu(e, item.id)}
            onEndpointMouseDown={(e, endpoint) =>
              handleSegmentEndpointMouseDown(e, item.id, endpoint)
            }
            onWaypointMouseDown={(e, waypointIndex) =>
              handleSegmentWaypointMouseDown(e, item.id, waypointIndex)
            }
            onMidpointMouseDown={(e, segmentIndex) =>
              handleSegmentMidpointMouseDown(e, item.id, segmentIndex)
            }
            deletingWaypointIndex={
              deletingWaypointInfo?.itemId === item.id
                ? deletingWaypointInfo.waypointIndex
                : undefined
            }
            onDoubleClick={() => handleItemDoubleClick(item)}
            onResizeMouseDown={(e, edge) => handleResizeMouseDown(e, item.id, edge)}
            onToggleCollapse={() => handleToggleFrameCollapse(item.id)}
            onUpdate={handleItemUpdate}
            onEditEnd={handleEditEnd}
            onTableCellInteractionStart={() => handleItemDoubleClick(item)}
            onTableSelectedCellsChange={(cellIds) =>
              setTableInspectorSelection(
                cellIds.length === 0 ? null : { tableId: item.id, cellIds },
              )
            }
            onTableDeleteSelectedCells={(cellIds) => {
              setTableInspectorSelection({ tableId: item.id, cellIds });
              void handleDeleteTableCells(item.id, cellIds).catch((err) => {
                console.error(
                  '[Canvas] Failed to handle table delete shortcut',
                  err,
                );
              });
            }}
            tableCellSelectionResetKey={tableCellSelectionResetKey}
            magnetEnabled={magnetEnabled}
            tableDropTargetCellId={
              isTableDropTarget ? (activeTableDropTarget?.cellId ?? null) : null
            }
            projectDefaultStyle={projectDefaultStyle}
          />
        );
      })}
      {segmentDraftPreviewItem !== null ? (
        <div
          className="board-item board-item-segment board-item-draft"
          style={{
            position: 'absolute',
            left: segmentDraftPreviewItem.x,
            top: segmentDraftPreviewItem.y,
            width: segmentDraftPreviewItem.width,
            height: segmentDraftPreviewItem.height,
            zIndex: segmentDraftPreviewItem.z_index,
            pointerEvents: 'none',
          }}
        >
          <SegmentShape
            item={segmentDraftPreviewItem}
            isSelected={false}
            canTranslate={false}
            onMouseDown={() => {}}
            onEndpointMouseDown={() => {}}
            onWaypointMouseDown={() => {}}
            onMidpointMouseDown={() => {}}
            projectDefaultStyle={projectDefaultStyle}
          />
        </div>
      ) : null}
      {/* Connector anchor indicators on nearby items */}
      {anchorIndicatorItems.map((item) =>
        getItemConnectorAnchors(item).map(({ anchor, point }) => {
          const isActive =
            activeAnchorHit !== null &&
            activeAnchorHit.itemId === item.id &&
            activeAnchorHit.anchor === anchor;
          return (
            <div
              key={`anchor-${item.id}-${anchor}`}
              className={`connector-anchor-indicator ${isActive ? 'is-active' : ''}`}
              style={{
                left: point.x,
                top: point.y,
              }}
            />
          );
        }),
      )}
    </>
  );
}