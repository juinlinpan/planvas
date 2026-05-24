import {
  TABLE_INSERT_PREVIEW_CELL_HEIGHT,
  TABLE_INSERT_PREVIEW_CELL_WIDTH,
  getTableInsertPreviewPosition,
} from '../../tableData/tableInsertPreview';
import type { TableInsertPreviewState } from '../../types/canvas';

type Props = {
  tableInsertPreview: TableInsertPreviewState | null;
  toolbarTableInsertPreview: TableInsertPreviewState | null;
  viewport: { x: number; y: number; zoom: number };
};

export function CanvasTableInsertPreviews({
  tableInsertPreview,
  toolbarTableInsertPreview,
  viewport,
}: Props) {
  return (
    <>
      {toolbarTableInsertPreview !== null ? (
        <div
          className={`table-insert-preview table-insert-preview-fixed ${
            toolbarTableInsertPreview.isActive ? 'is-dragging' : ''
          }`}
          style={getTableInsertPreviewPosition(
            toolbarTableInsertPreview.cursorX,
            toolbarTableInsertPreview.cursorY,
            toolbarTableInsertPreview.direction ?? { x: 1, y: 1 },
            toolbarTableInsertPreview.cols,
            toolbarTableInsertPreview.rows,
          )}
        >
          <div
            className="table-insert-preview-grid"
            style={{
              gridTemplateColumns: `repeat(${toolbarTableInsertPreview.cols}, ${TABLE_INSERT_PREVIEW_CELL_WIDTH}px)`,
              gridTemplateRows: `repeat(${toolbarTableInsertPreview.rows}, ${TABLE_INSERT_PREVIEW_CELL_HEIGHT}px)`,
            }}
          >
            {Array.from({
              length:
                toolbarTableInsertPreview.rows * toolbarTableInsertPreview.cols,
            }).map((_, index) => (
              <span key={index} className="table-insert-preview-cell" />
            ))}
          </div>
          <div className="table-insert-preview-label">
            {toolbarTableInsertPreview.rows} × {toolbarTableInsertPreview.cols}
          </div>
        </div>
      ) : null}

      {tableInsertPreview !== null &&
      tableInsertPreview.worldX !== undefined &&
      tableInsertPreview.worldY !== undefined &&
      tableInsertPreview.width !== undefined &&
      tableInsertPreview.height !== undefined ? (
        <div
          className="table-insert-canvas-preview"
          style={{
            left: viewport.x + tableInsertPreview.worldX * viewport.zoom,
            top: viewport.y + tableInsertPreview.worldY * viewport.zoom,
            width: tableInsertPreview.width * viewport.zoom,
            height: tableInsertPreview.height * viewport.zoom,
          }}
        >
          <div
            className="table-insert-canvas-preview-grid"
            style={{
              gridTemplateColumns: `repeat(${tableInsertPreview.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${tableInsertPreview.rows}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({
              length: tableInsertPreview.rows * tableInsertPreview.cols,
            }).map((_, index) => (
              <span
                key={`table-insert-preview-${index}`}
                className="table-insert-canvas-preview-cell"
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}