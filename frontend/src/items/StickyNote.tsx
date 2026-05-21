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
      <div className="sticky-note-shell" style={cardStyle}>
        <textarea
          ref={textareaRef}
          className="sticky-note-editor"
          value={item.content ?? ''}
          onChange={handleChange}
          onBlur={onEditEnd}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <div className="sticky-note-shell" style={cardStyle}>
      <div className="sticky-note-display">
        {item.content ? (
          <span className="sticky-note-content">{item.content}</span>
        ) : null}
      </div>
    </div>
  );
}
