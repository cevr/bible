import { type TextSegment, segmentVerseText } from '@bible/core/bible-rendering';
import { type Component, For, Match, Switch } from 'solid-js';

// Solid mapping of the framework-agnostic TextSegment[] from
// @bible/core/bible-rendering. Margin-note anchors render inline next to the
// phrase they annotate (mirrors the web verse-renderer pattern); when an
// `onMarginNoteSelected` callback is provided the anchor becomes a focusable
// button that opens the Notes drawer.
//
// Red-letter / red-letter-italic / red-letter-quote all consume the
// `--color-red-letter` Tailwind token defined in styles/tailwind.css; the
// quote variant exists as its own segment type so a future tweak (e.g. a
// slightly fainter quote glyph) can target it without re-tokenizing.

interface MarginNoteAnchorLite {
  readonly idx: number;
  readonly phrase: string;
}

const Segment: Component<{
  readonly segment: TextSegment;
  readonly notes: readonly MarginNoteAnchorLite[];
  readonly onMarginNoteSelected: ((noteIdx: number) => void) | undefined;
}> = (props) => (
  <Switch>
    <Match when={props.segment.type === 'text' ? props.segment : null}>
      {(s) => <>{s().text}</>}
    </Match>
    <Match when={props.segment.type === 'italic' ? props.segment : null}>
      {(s) => <em class="italic opacity-85">{s().text}</em>}
    </Match>
    <Match when={props.segment.type === 'highlight' ? props.segment : null}>
      {(s) => (
        <mark class="rounded-sm bg-accent-soft px-[1px] font-medium text-fg">{s().text}</mark>
      )}
    </Match>
    <Match when={props.segment.type === 'redLetter' ? props.segment : null}>
      {(s) => <span class="text-red-letter">{s().text}</span>}
    </Match>
    <Match when={props.segment.type === 'redLetterItalic' ? props.segment : null}>
      {(s) => <em class="italic opacity-85 text-red-letter">{s().text}</em>}
    </Match>
    <Match when={props.segment.type === 'redLetterQuote' ? props.segment : null}>
      {(s) => <span class="text-red-letter">{s().text}</span>}
    </Match>
    <Match when={props.segment.type === 'margin' ? props.segment : null}>
      {(s) => {
        const onClick = props.onMarginNoteSelected;
        const note = props.notes.find((n) => n.idx === s().noteIndex);
        const title =
          note === undefined
            ? `Margin note ${String(s().noteIndex + 1)}`
            : `Margin note: ${note.phrase}`;
        if (onClick === undefined) {
          return (
            <sup
              class="mx-[0.05em] cursor-help text-[0.7em] font-medium text-muted select-none"
              title={title}
            >
              {indexToLetter(s().noteIndex)}
            </sup>
          );
        }
        return (
          <button
            type="button"
            class="mx-[0.05em] cursor-pointer bg-transparent border-0 p-0 text-[0.7em] font-medium text-muted align-super select-none hover:text-accent hover:underline focus-visible:text-accent focus-visible:outline-none"
            title={title}
            onClick={() => onClick(s().noteIndex)}
          >
            {indexToLetter(s().noteIndex)}
          </button>
        );
      }}
    </Match>
  </Switch>
);

// Cheap inline copy of noteLabel so the renderer is self-contained; we don't
// want a Solid component module to take a dependency on core just to format
// a single integer when the engine already exports the function. (Importing
// it from core would also work — keeping a local copy avoids the round-trip
// through the bundler resolver for one identifier.)
const indexToLetter = (index: number): string => {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

export interface VerseRendererProps {
  readonly text: string;
  readonly searchQuery?: string;
  /** Optional per-verse margin notes. Each note's `idx` matches the
   *  `noteIndex` on the segmenter's `margin` segments, so anchors render
   *  next to the matched phrase rather than at the start of the verse. */
  readonly marginNotes?: readonly { readonly idx: number; readonly phrase: string }[];
  /** Click handler for margin-note anchors. When provided, anchors render as
   *  focusable buttons that route to the Notes drawer. When omitted (e.g. in
   *  the drawer's own read-only verse preview), anchors render as static
   *  superscripts. */
  readonly onMarginNoteSelected?: (noteIdx: number) => void;
}

/** Render a single verse's text with shared segmentation (italics, red-letter,
 *  pilcrow, optional search highlights). Pass raw KJV verse text — the
 *  segmenter strips the leading pilcrow internally. */
export const VerseRenderer: Component<VerseRendererProps> = (props) => {
  const anchors = (): readonly { readonly idx: number; readonly phrase: string }[] =>
    props.marginNotes ?? [];
  // segmentVerseText expects `noteIndex` keys, which match the on-disk `idx`.
  const segmentAnchors = (): readonly { readonly noteIndex: number; readonly phrase: string }[] =>
    anchors().map((n) => ({ noteIndex: n.idx, phrase: n.phrase }));
  const segments = (): readonly TextSegment[] =>
    segmentVerseText(props.text, segmentAnchors(), props.searchQuery);
  return (
    <For each={segments()}>
      {(seg) => (
        <Segment
          segment={seg}
          notes={anchors()}
          onMarginNoteSelected={props.onMarginNoteSelected}
        />
      )}
    </For>
  );
};
