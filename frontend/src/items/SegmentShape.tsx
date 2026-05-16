import { type BoardItem } from '../api';
import {
  parseBoardItemStyle,
  type ProjectDefaultStyle,
  resolveBoardItemStyle,
} from '../itemStyles';
import {
  getSegmentLocalPoints,
  getSegmentWaypoints,
  type Point,
  type SegmentEndpoint,
} from '../segmentData';
import { ITEM_TYPE } from '../types';

type Props = {
  item: BoardItem;
  isSelected: boolean;
  isEditing?: boolean;
  canTranslate: boolean;
  onMouseDown: (e: React.MouseEvent<SVGPathElement>) => void;
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
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onUpdate?: (item: BoardItem) => void;
  onEditEnd?: () => void;
  deletingWaypointIndex?: number;
  projectDefaultStyle?: ProjectDefaultStyle;
};

function getStrokeDasharray(
  style: 'solid' | 'dashed' | 'dotted',
): string | undefined {
  switch (style) {
    case 'dashed':
      return '14 10';
    case 'dotted':
      return '2 8';
    default:
      return undefined;
  }
}

function getPathData(points: Point[], cornerType: 'sharp' | 'rounded'): string {
  if (points.length < 2) {
    return '';
  }

  if (cornerType === 'sharp') {
    return (
      `M ${points[0].x},${points[0].y} ` +
      points
        .slice(1)
        .map((p) => `L ${p.x},${p.y}`)
        .join(' ')
    );
  }

  // Rounded corners
  const radius = 20;
  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    // Vectors
    const vIn = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
    const vOut = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

    const dIn = Math.sqrt(vIn.x * vIn.x + vIn.y * vIn.y);
    const dOut = Math.sqrt(vOut.x * vOut.x + vOut.y * vOut.y);

    const r = Math.min(radius, dIn / 2, dOut / 2);

    if (r > 0) {
      const p1 = {
        x: pCurr.x - (vIn.x / dIn) * r,
        y: pCurr.y - (vIn.y / dIn) * r,
      };
      const p2 = {
        x: pCurr.x + (vOut.x / dOut) * r,
        y: pCurr.y + (vOut.y / dOut) * r,
      };
      d += ` L ${p1.x},${p1.y} Q ${pCurr.x},${pCurr.y} ${p2.x},${p2.y}`;
    } else {
      d += ` L ${pCurr.x},${pCurr.y}`;
    }
  }

  d += ` L ${points[points.length - 1].x},${points[points.length - 1].y}`;
  return d;
}

function getDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

type SegmentTextPlacement = {
  point: Point;
  angle: number;
};

function normalizeReadableAngle(angle: number): number {
  if (angle > 90) {
    return angle - 180;
  }

  if (angle < -90) {
    return angle + 180;
  }

  return angle;
}

function getPlacementAtDistance(
  points: Point[],
  targetDistance: number,
): SegmentTextPlacement {
  let remainingDistance = targetDistance;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) {
      continue;
    }

    const segmentLength = getDistance(start, end);
    if (segmentLength <= 0) {
      continue;
    }

    if (remainingDistance <= segmentLength) {
      const ratio = remainingDistance / segmentLength;
      return {
        point: {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        },
        angle: normalizeReadableAngle(
          (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
        ),
      };
    }

    remainingDistance -= segmentLength;
  }

  const fallbackEnd = points[points.length - 1] ?? { x: 0, y: 0 };
  const fallbackStart = points[points.length - 2] ?? fallbackEnd;
  return {
    point: fallbackEnd,
    angle: normalizeReadableAngle(
      (Math.atan2(
        fallbackEnd.y - fallbackStart.y,
        fallbackEnd.x - fallbackStart.x,
      ) *
        180) /
        Math.PI,
    ),
  };
}

function getSegmentTextPlacement(
  points: Point[],
  position: 'start' | 'center' | 'end',
): SegmentTextPlacement {
  const totalLength = points.reduce((sum, point, index) => {
    const next = points[index + 1];
    return next ? sum + getDistance(point, next) : sum;
  }, 0);

  if (totalLength <= 0) {
    return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
  }

  const targetDistance =
    position === 'start'
      ? totalLength * 0.18
      : position === 'end'
        ? totalLength * 0.82
        : totalLength * 0.5;

  return getPlacementAtDistance(points, targetDistance);
}

function getTextTransform(
  verticalPosition: 'top' | 'middle' | 'bottom',
  angle: number,
): string {
  const offset =
    verticalPosition === 'top'
      ? ' translateY(calc(-50% - 8px))'
      : verticalPosition === 'bottom'
        ? ' translateY(calc(50% + 8px))'
        : '';

  return `translate(-50%, -50%) rotate(${angle}deg)${offset}`;
}

export function SegmentShape({
  item,
  isSelected,
  isEditing = false,
  canTranslate,
  onMouseDown,
  onEndpointMouseDown,
  onWaypointMouseDown,
  onMidpointMouseDown,
  onContextMenu,
  onDoubleClick,
  onUpdate,
  onEditEnd,
  deletingWaypointIndex,
  projectDefaultStyle,
}: Props) {
  const points = getSegmentLocalPoints(item);
  const localWaypoints = getSegmentWaypoints(item);
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const parsedStyle = parseBoardItemStyle(item.style_json);
  const markerId = `segment-arrow-head-${item.id}`;
  // Calculate arrow head dimensions based on size preference
  const arrowSize = resolvedStyle.arrowHeadSize;
  const arrowWidth = arrowSize;
  const arrowHeight = (arrowSize * 7) / 10;

  if (points === null) {
    return null;
  }

  // All points in local (item-relative) coordinates
  const allLocalPoints = [points.start, ...localWaypoints, points.end];
  const pathData = getPathData(allLocalPoints, resolvedStyle.lineCornerType);
  const strokeDasharray = getStrokeDasharray(resolvedStyle.strokeStyle);
  const hitStrokeWidth = Math.max(resolvedStyle.strokeWidth + 12, 14);
  const textPlacement = getSegmentTextPlacement(
    allLocalPoints,
    resolvedStyle.segmentTextHorizontalPosition,
  );
  const textAngle =
    resolvedStyle.segmentTextOrientation === 'slope' ? textPlacement.angle : 0;
  const hasText = (item.content ?? '').trim().length > 0;
  const shouldShowText =
    (item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow) &&
    (hasText || isEditing);
  const verticalClass =
    resolvedStyle.segmentTextVerticalPosition === 'top'
      ? 'is-above'
      : resolvedStyle.segmentTextVerticalPosition === 'bottom'
        ? 'is-below'
        : 'is-middle';

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate?.({ ...item, content: e.target.value });
  }

  return (
    <div className="segment-shape">
      <svg
        className="segment-shape-svg"
        aria-hidden="true"
        width={item.width}
        height={item.height}
        viewBox={`0 0 ${item.width} ${item.height}`}
      >
        {item.type === ITEM_TYPE.arrow ? (
          <defs>
            <marker
              id={markerId}
              markerWidth={arrowWidth}
              markerHeight={arrowHeight}
              refX={arrowWidth - 2}
              refY={arrowHeight / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d={`M 0 0 L ${arrowWidth} ${arrowHeight / 2} L 0 ${arrowHeight} z`}
                className="segment-marker-head"
                style={{ fill: resolvedStyle.strokeColor }}
              />
            </marker>
          </defs>
        ) : null}

        <path
          d={pathData}
          fill="none"
          className={`segment-line ${isSelected ? 'is-selected' : ''}`}
          style={{
            stroke: resolvedStyle.strokeColor,
            strokeWidth: resolvedStyle.strokeWidth,
            strokeDasharray,
          }}
          markerEnd={
            item.type === ITEM_TYPE.arrow ? `url(#${markerId})` : undefined
          }
        />
        <path
          d={pathData}
          fill="none"
          className={`segment-hit-line${canTranslate ? ' is-translatable' : ''}`}
          style={{ strokeWidth: hitStrokeWidth }}
          onMouseDown={onMouseDown}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          onContextMenu={onContextMenu}
        />
      </svg>

      {shouldShowText ? (
        <div
          className={`segment-text-label ${verticalClass} ${
            isEditing ? 'is-editing' : ''
          }`}
          style={{
            left: textPlacement.point.x,
            top: textPlacement.point.y,
            transform: getTextTransform(
              resolvedStyle.segmentTextVerticalPosition,
              textAngle,
            ),
            backgroundColor:
              parsedStyle.backgroundColor ??
              (item.type === ITEM_TYPE.line
                ? 'transparent'
                : resolvedStyle.backgroundColor),
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

      {isSelected ? (
        <>
          {/* Start endpoint handle */}
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.start.x, top: points.start.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'start')}
            aria-label="Adjust start point"
          />
          {/* End endpoint handle */}
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.end.x, top: points.end.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'end')}
            aria-label="Adjust end point"
          />
          {/* Waypoint handles */}
          {localWaypoints.map((wp, i) => (
            <button
              key={`wp-${i}`}
              type="button"
              className={`segment-waypoint-handle${i === deletingWaypointIndex ? ' is-deleting' : ''}`}
              style={{ left: wp.x, top: wp.y }}
              onMouseDown={(e) => onWaypointMouseDown(e, i)}
              aria-label={`Waypoint ${i + 1}`}
            />
          ))}
          {/* Midpoint add-bend handles (one per segment) */}
          {allLocalPoints.map((pt, i) => {
            if (i === allLocalPoints.length - 1) {
              return null;
            }
            const next = allLocalPoints[i + 1];
            if (next === undefined) {
              return null;
            }
            const midX = (pt.x + next.x) / 2;
            const midY = (pt.y + next.y) / 2;
            return (
              <button
                key={`mid-${i}`}
                type="button"
                className="segment-midpoint-handle"
                style={{ left: midX, top: midY }}
                onMouseDown={(e) => onMidpointMouseDown(e, i)}
                aria-label={`Add bend point`}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
}
