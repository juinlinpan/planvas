import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';
import {
  getBoardItemTypographyStyle,
  type ProjectDefaultStyle,
  resolveBoardItemStyle,
} from '../itemStyles';

function toJustifyContent(
  value: 'left' | 'center' | 'right',
): React.CSSProperties['justifyContent'] {
  if (value === 'left') return 'flex-start';
  if (value === 'right') return 'flex-end';
  return 'center';
}

function toAlignItems(
  value: 'top' | 'middle' | 'bottom',
): React.CSSProperties['alignItems'] {
  if (value === 'top') return 'flex-start';
  if (value === 'bottom') return 'flex-end';
  return 'center';
}

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  projectDefaultStyle?: ProjectDefaultStyle;
};

export function TextBox({
  item,
  isEditing,
  onUpdate,
  onEditEnd,
  projectDefaultStyle,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const contentStyle = {
    background: resolvedStyle.backgroundColor,
    textAlign: resolvedStyle.textHorizontalAlign,
    ...getBoardItemTypographyStyle(item, projectDefaultStyle),
  };
  const displayStyle = {
    ...contentStyle,
    justifyContent: toJustifyContent(resolvedStyle.textHorizontalAlign),
    alignItems: toAlignItems(resolvedStyle.textVerticalAlign),
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate({ ...item, content: e.target.value });
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="text-box-editor"
        style={contentStyle}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="text-box-display" style={displayStyle}>
      {item.content ? (
        <span className="text-box-content">{item.content}</span>
      ) : null}
    </div>
  );
}
