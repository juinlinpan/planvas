import { type BoardItem, type ConnectorLink } from '../api';
import { resolveBoardItemStyle } from '../itemStyles';

type Point = {
  x: number;
  y: number;
};

type Props = {
  item: BoardItem;
  connector: ConnectorLink;
  fromPoint: Point;
  toPoint: Point;
  isSelected: boolean;
  isEditing?: boolean;
  onMouseDown: (e: React.MouseEvent<SVGLineElement>) => void;
  onDoubleClick?: () => void;
  onUpdate?: (item: BoardItem) => void;
  onEditEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

const PADDING = 20;

function getBounds(fromPoint: Point, toPoint: Point) {
  const left = Math.min(fromPoint.x, toPoint.x) - PADDING;
  const top = Math.min(fromPoint.y, toPoint.y) - PADDING;
  const width = Math.max(Math.abs(toPoint.x - fromPoint.x) + PADDING * 2, 40);
  const height = Math.max(Math.abs(toPoint.y - fromPoint.y) + PADDING * 2, 40);

  return { left, top, width, height };
}

function normalizeReadableAngle(angle: number): number {
  if (angle > 90) {
    return angle - 180;
  }
  if (angle < -90) {
    return angle + 180;
  }
  return angle;
}

export function ArrowConnector({
  item,
  connector,
  fromPoint,
  toPoint,
  isSelected,
  isEditing = false,
  onMouseDown,
  onDoubleClick,
  onUpdate,
  onEditEnd,
  onContextMenu,
}: Props) {
  const bounds = getBounds(fromPoint, toPoint);
  const start = {
    x: fromPoint.x - bounds.left,
    y: fromPoint.y - bounds.top,
  };
  const end = {
    x: toPoint.x - bounds.left,
    y: toPoint.y - bounds.top,
  };
  const markerId = `arrow-head-${connector.id}`;
  const resolvedStyle = resolveBoardItemStyle(item);

  const midPoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };

  const angle =
    (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const textAngle =
    resolvedStyle.segmentTextOrientation === 'slope'
      ? normalizeReadableAngle(angle)
      : 0;

  const hasText = (item.content ?? '').trim().length > 0;
  const shouldShowText = hasText || isEditing;

  const verticalClass =
    resolvedStyle.segmentTextVerticalPosition === 'top'
      ? 'is-above'
      : resolvedStyle.segmentTextVerticalPosition === 'bottom'
        ? 'is-below'
        : 'is-middle';

  const verticalOffset =
    resolvedStyle.segmentTextVerticalPosition === 'top'
      ? ' translateY(calc(-50% - 8px))'
      : resolvedStyle.segmentTextVerticalPosition === 'bottom'
        ? ' translateY(calc(50% + 8px))'
        : '';

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate?.({ ...item, content: e.target.value });
  }

  return (
    <div
      className={`arrow-connector ${isSelected ? 'is-selected' : ''}`}
      style={{
        position: 'absolute',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: item.z_index,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <svg width={bounds.width} height={bounds.height} className="arrow-svg">
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className="arrow-head-shape"
              style={{ fill: resolvedStyle.strokeColor }}
            />
          </marker>
        </defs>

        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="arrow-line"
          style={{
            stroke: resolvedStyle.strokeColor,
            strokeWidth: resolvedStyle.strokeWidth,
          }}
          markerEnd={`url(#${markerId})`}
        />
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="arrow-hit-line"
          onMouseDown={onMouseDown}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onContextMenu={onContextMenu}
          markerEnd={`url(#${markerId})`}
        />
      </svg>

      {shouldShowText ? (
        <div
          className={`segment-text-label ${verticalClass} ${
            isEditing ? 'is-editing' : ''
          }`}
          style={{
            position: 'absolute',
            left: midPoint.x,
            top: midPoint.y,
            transform: `translate(-50%, -50%) rotate(${textAngle}deg)${verticalOffset}`,
            pointerEvents: 'auto',
            backgroundColor: resolvedStyle.backgroundColor,
            color: resolvedStyle.textColor,
            fontSize: resolvedStyle.fontSize,
            fontWeight: resolvedStyle.fontWeight,
            fontStyle: resolvedStyle.fontStyle,
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={onContextMenu}
        >
          {isEditing ? (
            <textarea
              className="segment-text-editor"
              value={item.content ?? ''}
              autoFocus
              onChange={handleTextChange}
              onBlur={onEditEnd}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            item.content
          )}
        </div>
      ) : null}
    </div>
  );
}

