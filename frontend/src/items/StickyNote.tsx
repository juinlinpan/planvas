import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';
import {
  getBoardItemTypographyStyle,
  type ProjectDefaultStyle,
  resolveBoardItemStyle,
} from '../itemStyles';

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  projectDefaultStyle?: ProjectDefaultStyle;
};

export function StickyNote({
  item,
  isEditing,
  onUpdate,
  onEditEnd,
  projectDefaultStyle,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const typographyStyle = getBoardItemTypographyStyle(
    item,
    projectDefaultStyle,
  );
  const cardStyle = {
    background: resolvedStyle.backgroundColor,
    ...typographyStyle,
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate({ ...item, content: e.target.value });
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="sticky-note-editor"
        style={cardStyle}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="sticky-note-display" style={cardStyle}>
      {item.content ? <span className="sticky-note-content">{item.content}</span> : null}
    </div>
  );
}
