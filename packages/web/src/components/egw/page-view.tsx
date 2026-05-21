/**
 * EGW page view — renders paragraphs with heading detection and selection.
 *
 * Headings (h1-h6) render as styled section titles, not selectable paragraphs.
 * Body paragraphs are selectable with refcode suffix and highlight on selection.
 * Bible references are rendered inline as clickable links.
 */
import { useMemo } from 'react';
import { isChapterHeading, headingLevel, nodesToText } from '@bible/core/egw';
import { segmentTextWithReferences } from '@bible/core/bible-reader';
import type { EGWParagraph } from '@/data/egw/api';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PageViewProps {
  paragraphs: readonly EGWParagraph[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onRefClick?: (ref: { book: number; chapter: number; verse?: number }) => void;
}

export function PageView({ paragraphs, selectedIndex, onSelect, onRefClick }: PageViewProps) {
  let bodyIndex = 0;
  const items = paragraphs.map((para) => {
    const heading = isChapterHeading(para.elementType);
    const idx = heading ? -1 : bodyIndex++;
    return { para, heading, bodyIndex: idx };
  });

  return (
    <div className="reading-text space-y-4">
      {items.map((item, i) =>
        item.heading ? (
          <HeadingElement
            key={i}
            text={nodesToText(item.para.nodes)}
            level={headingLevel(item.para.elementType)}
          />
        ) : (
          <ParagraphElement
            key={item.para.puborder}
            para={item.para}
            isSelected={item.bodyIndex === selectedIndex}
            onClick={() => onSelect(item.bodyIndex)}
            onRefClick={onRefClick}
          />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heading element
// ---------------------------------------------------------------------------

function HeadingElement({ text, level }: { text: string; level: number }) {
  if (!text) return null;

  const base = 'font-sans font-semibold text-foreground';
  const classes =
    level === 1
      ? `${base} text-2xl mt-8 mb-4`
      : level === 2
        ? `${base} text-xl mt-6 mb-3`
        : `${base} text-lg mt-4 mb-2`;

  return <div className={classes}>{text}</div>;
}

// ---------------------------------------------------------------------------
// Paragraph element
// ---------------------------------------------------------------------------

function ParagraphElement({
  para,
  isSelected,
  onClick,
  onRefClick,
}: {
  para: EGWParagraph;
  isSelected: boolean;
  onClick: () => void;
  onRefClick?: (ref: { book: number; chapter: number; verse?: number }) => void;
}) {
  const text = nodesToText(para.nodes);
  const segments = useMemo(() => segmentTextWithReferences(text), [text]);
  const hasRefs = segments.some((s) => s.type === 'ref');

  return (
    <p
      data-para={para.puborder}
      data-selected={isSelected ? 'true' : undefined}
      className={`cursor-pointer rounded-sm px-2 py-1 transition-colors duration-100 ${
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
      onClick={onClick}
    >
      {hasRefs
        ? segments.map((seg, i) =>
            seg.type === 'text' ? (
              <span key={i}>{seg.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefClick?.(seg.ref);
                }}
              >
                {seg.text}
              </button>
            ),
          )
        : text}
      {para.refcodeShort && (
        <span className="ml-2 text-xs text-muted-foreground select-none">{para.refcodeShort}</span>
      )}
    </p>
  );
}
