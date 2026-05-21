/**
 * EGW Paragraph Component
 *
 * Renders a single EGW paragraph with Bible reference highlighting.
 */

import { segmentTextWithReferences } from '@bible/core/bible-reader';
import { nodesToText } from '@bible/core/egw';
import type { EGWParagraph } from '@bible/core/egw-reader';
import { createMemo, For, Show } from 'solid-js';

import { useTheme } from '../../context/theme.js';

interface EGWParagraphViewProps {
  id: string;
  paragraph: EGWParagraph;
  isSelected: boolean;
  showRefcode?: boolean;
}

export function EGWParagraphView(props: EGWParagraphViewProps) {
  const { theme } = useTheme();

  const refcode = () => props.paragraph.refcodeShort ?? props.paragraph.refcodeLong ?? '';
  const cleanContent = createMemo(() => nodesToText(props.paragraph.nodes));

  // Segment content with Bible references highlighted
  const segments = createMemo(() => segmentTextWithReferences(cleanContent()));

  // Determine if this is a heading based on element_type
  const isHeading = () => {
    const type = props.paragraph.elementType;
    return type === 'heading' || type === 'title' || type === 'chapter';
  };

  const textColor = () => (props.isSelected ? theme().textHighlight : theme().text);
  const refColor = () => (props.isSelected ? theme().warning : theme().accent);

  return (
    <box
      id={props.id}
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      backgroundColor={props.isSelected ? theme().verseHighlight : undefined}
    >
      {/* Content with Bible references highlighted and refcode at end */}
      <text fg={textColor()} wrapMode="word">
        <For each={segments()}>
          {(segment) => {
            if (segment.type === 'ref') {
              return (
                <span style={{ fg: refColor() }}>
                  {isHeading() ? <strong>{segment.text}</strong> : segment.text}
                </span>
              );
            }
            return isHeading() ? <strong>{segment.text}</strong> : <span>{segment.text}</span>;
          }}
        </For>
        <Show when={props.showRefcode !== false && refcode()}>
          <span
            style={{
              fg: props.isSelected ? theme().accent : theme().textMuted,
            }}
          >
            {' '}
            {props.isSelected ? <strong>{refcode()}</strong> : refcode()}
          </span>
        </Show>
      </text>
    </box>
  );
}
