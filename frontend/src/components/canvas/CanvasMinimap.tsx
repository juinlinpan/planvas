import type { BoardItem } from '../../services/api';
import type { ProjectDefaultStyle } from '../../items/itemStyles';
import { resolveBoardItemStyle } from '../../items/itemStyles';
import type { MinimapLayout } from '../../utils/minimap';
import { worldToMinimap } from '../../utils/minimap';
import { ITEM_TYPE } from '../../types/index';

export const MINIMAP_WIDTH = 190;
export const MINIMAP_HEIGHT = 130;
const MINIMAP_VIEWPORT_FRAME_WIDTH = 44;
const MINIMAP_VIEWPORT_FRAME_HEIGHT = 30;

type Props = {
  items: BoardItem[];
  minimapLayout: MinimapLayout;
  projectDefaultStyle?: ProjectDefaultStyle;
};

/**
 * Mini-map overlay that shows item positions and current viewport within the
 * canvas world. Extracted from Canvas.tsx for clearer rendering boundaries.
 */
export function CanvasMinimap({ items, minimapLayout, projectDefaultStyle }: Props) {
  return (
    <div className="canvas-minimap" aria-hidden="true">
      <div className="canvas-minimap-title">Map</div>
      <div
        className="canvas-minimap-surface"
        style={{
          width: `${MINIMAP_WIDTH}px`,
          height: `${MINIMAP_HEIGHT}px`,
        }}
      >
        {items
          .filter(
            (item) =>
              item.type !== ITEM_TYPE.arrow && item.type !== ITEM_TYPE.line,
          )
          .map((item) => {
            const style = resolveBoardItemStyle(item, projectDefaultStyle);
            const point = worldToMinimap(
              item.x + item.width / 2,
              item.y + item.height / 2,
              minimapLayout,
            );
            return (
              <span
                key={`minimap-${item.id}`}
                className="canvas-minimap-dot"
                style={{
                  left: `${point.x}px`,
                  top: `${point.y}px`,
                  backgroundColor: style.backgroundColor,
                }}
              />
            );
          })}
        <div
          className="canvas-minimap-viewport"
          style={{
            left: `${Math.min(
              Math.max(
                worldToMinimap(
                  minimapLayout.viewportBounds.x +
                    minimapLayout.viewportBounds.width / 2,
                  minimapLayout.viewportBounds.y +
                    minimapLayout.viewportBounds.height / 2,
                  minimapLayout,
                ).x -
                  MINIMAP_VIEWPORT_FRAME_WIDTH / 2,
                0,
              ),
              MINIMAP_WIDTH - MINIMAP_VIEWPORT_FRAME_WIDTH,
            )}px`,
            top: `${Math.min(
              Math.max(
                worldToMinimap(
                  minimapLayout.viewportBounds.x +
                    minimapLayout.viewportBounds.width / 2,
                  minimapLayout.viewportBounds.y +
                    minimapLayout.viewportBounds.height / 2,
                  minimapLayout,
                ).y -
                  MINIMAP_VIEWPORT_FRAME_HEIGHT / 2,
                0,
              ),
              MINIMAP_HEIGHT - MINIMAP_VIEWPORT_FRAME_HEIGHT,
            )}px`,
            width: `${MINIMAP_VIEWPORT_FRAME_WIDTH}px`,
            height: `${MINIMAP_VIEWPORT_FRAME_HEIGHT}px`,
          }}
        />
      </div>
    </div>
  );
}
