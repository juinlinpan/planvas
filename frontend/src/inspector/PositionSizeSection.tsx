import type { BoardItem } from '../services/api';
import { ITEM_TYPE } from '../types/index';
import { ITEM_MIN_SIZE } from '../types/index';
import { getTableMinSizeFromDataJson } from '../tableData/tableData';
import { CommitNumberInput } from '../components/Inspector';

function clampDimension(
  item: BoardItem,
  field: 'width' | 'height',
  value: number,
): number {
  const minSize =
    item.type === ITEM_TYPE.table
      ? getTableMinSizeFromDataJson(item.data_json)
      : ITEM_MIN_SIZE[item.type];
  if (field === 'width') {
    return Math.max(minSize?.width ?? 60, value);
  }
  return Math.max(minSize?.height ?? 40, value);
}

type Props = {
  item: BoardItem;
  isSegmentItem: boolean;
  isLine: boolean;
  onUpdate: (item: BoardItem) => void;
};

/**
 * Inspector section for position (X, Y), size (width, height), and rotation.
 * Shown for all item types.
 */
export function PositionSizeSection({ item, isSegmentItem, isLine, onUpdate }: Props) {
  function handleNumberChange(
    field: 'x' | 'y' | 'width' | 'height',
    rawValue: string,
  ) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    const nextValue =
      field === 'width' || field === 'height'
        ? clampDimension(item, field, value)
        : value;
    onUpdate({ ...item, [field]: nextValue });
  }

  function handleRotationChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    const normalized = ((Math.round(value) % 360) + 360) % 360;
    const rotation = normalized > 180 ? normalized - 360 : normalized;
    onUpdate({ ...item, rotation });
  }

  return (
    <>
      <section className="inspector-section">
        <p className="meta-label">Position</p>
        <div className="inspector-grid">
          <label>
            X
            <CommitNumberInput
              inputKey={`${item.id}-pos-x-${Math.round(item.x)}`}
              value={Math.round(item.x)}
              onCommit={(val) => handleNumberChange('x', val)}
            />
          </label>
          <label>
            Y
            <CommitNumberInput
              inputKey={`${item.id}-pos-y-${Math.round(item.y)}`}
              value={Math.round(item.y)}
              onCommit={(val) => handleNumberChange('y', val)}
            />
          </label>
        </div>
      </section>

      {!isSegmentItem ? (
        <section className="inspector-section">
          <p className="meta-label">Size</p>
          <div className="inspector-grid">
            <label>
              Width
              <CommitNumberInput
                inputKey={`${item.id}-size-width-${Math.round(item.width)}`}
                value={Math.round(item.width)}
                onCommit={(val) => handleNumberChange('width', val)}
              />
            </label>
            <label>
              Height
              <CommitNumberInput
                inputKey={`${item.id}-size-height-${Math.round(item.height)}`}
                value={Math.round(item.height)}
                onCommit={(val) => handleNumberChange('height', val)}
              />
            </label>
          </div>
          {isLine ? (
            <label className="inspector-field">
              旋轉
              <CommitNumberInput
                inputKey={`${item.id}-rot-${item.rotation}`}
                min={-180}
                max={180}
                value={item.rotation}
                onCommit={handleRotationChange}
              />
            </label>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
