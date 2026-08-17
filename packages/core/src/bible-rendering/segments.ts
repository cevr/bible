/**
 * Pure text segmentation for verse rendering. Framework-agnostic — produces
 * a typed `TextSegment[]` that any UI or plain HTML renderer can map
 * to its own primitives.
 *
 * Handles the KJV editorial conventions in our source JSON:
 *   - leading pilcrow `¶` marking new paragraphs (stripped inline)
 *   - `[bracketed]` words added by translators → italic
 *   - `‹ … ›` single angle quotes around Christ's words → red letter spans,
 *     with the angle quotes themselves converted to typographic `"` `"`.
 *
 * Margin note anchors (footnote letters inserted after a matched phrase) and
 * search-result highlighting are also produced as discrete segment types so
 * the caller's renderer never has to re-tokenize the verse.
 */

import { Predicate } from 'effect';

/** A single styled chunk of verse text. The renderer maps each variant to
 *  its own UI primitive (e.g. `<em>`, `<mark>`, popover anchor, …). */
export type TextSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'italic'; readonly text: string }
  | { readonly type: 'highlight'; readonly text: string }
  | { readonly type: 'redLetter'; readonly text: string }
  | { readonly type: 'redLetterItalic'; readonly text: string }
  | { readonly type: 'redLetterQuote'; readonly text: string }
  | { readonly type: 'margin'; readonly noteIndex: number }
  /** A wiki phrase link (§4.6). Carries the topic it opens and the normalized
   *  alias that claimed it, so the renderer needs neither the dictionary nor the
   *  span list to draw the span — the segment *is* the decision.
   *
   *  `text` is the surface text as the verse writes it, not the alias: the
   *  reader must see the words that are actually there ("The sanctuary,") while
   *  the link still resolves to the entry the dictionary keyed ("sanctuary"). */
  | {
      readonly type: 'phrase';
      readonly text: string;
      readonly slug: string;
      readonly alias: string;
    };

/** Every variant that carries prose — the union minus `margin`, which is a
 *  point rather than a run. A layer that re-splits a segment narrows to this
 *  first, so the split halves stay the *same* variant by construction instead
 *  of being asserted back into one. */
export type TextBearingSegment = Exclude<TextSegment, { readonly type: 'margin' }>;

/** Minimal contract the segmenter needs from a margin note. The full note
 *  shape (type, full text, language) is only needed by the renderer when
 *  building the popover — pass it separately. */
export interface MarginNoteAnchor {
  readonly noteIndex: number;
  readonly phrase: string;
}

/** Split text segments on `[brackets]` into italic segments. KJV uses square
 *  brackets to denote words added by translators for clarity. Handles both
 *  `text` → `italic` and `redLetter` → `redLetterItalic`. */
export const applyItalicSegments = (segments: readonly TextSegment[]): TextSegment[] => {
  const result: TextSegment[] = [];
  for (const segment of segments) {
    if (segment.type !== 'text' && segment.type !== 'redLetter') {
      result.push(segment);
      continue;
    }
    let italicType: TextSegment['type'] = 'italic';
    if (segment.type === 'redLetter') italicType = 'redLetterItalic';
    const parts = segment.text.split(/(\[[^\]]+\])/);
    for (const part of parts) {
      if (part.startsWith('[') && part.endsWith(']')) {
        result.push({ type: italicType, text: part.slice(1, -1) });
      } else if (part) {
        result.push({ type: segment.type, text: part });
      }
    }
  }
  return result;
};

/** Split text segments on single angle quotes into redLetter segments,
 *  converting the angle quotes themselves to typographic double quotes.
 *  Tracks red-letter state across segment boundaries so that margin note
 *  superscripts inserted mid-quote don't break the parsing.
 *
 *  An `italic` segment met **inside** a quote is promoted to `redLetterItalic`,
 *  which is what lets the italic layer run *before* this one and still produce
 *  the promotion — see {@link SEGMENT_APPLICATION_ORDER}. Running the two the
 *  other way round produced the same output by having `applyItalicSegments`
 *  split `redLetter` segments instead, and that ordering is the one the
 *  milestone's stated order contradicted. */
export const applyRedLetterSegments = (segments: readonly TextSegment[]): TextSegment[] => {
  const result: TextSegment[] = [];
  let inRedLetter = false;

  for (const segment of segments) {
    if (segment.type === 'italic' && inRedLetter) {
      result.push({ type: 'redLetterItalic', text: segment.text });
      continue;
    }
    if (segment.type !== 'text') {
      result.push(segment);
      continue;
    }

    let text = segment.text;
    while (text.length > 0) {
      if (inRedLetter) {
        const closeIdx = text.indexOf('›');
        if (closeIdx === -1) {
          result.push({ type: 'redLetter', text });
          text = '';
        } else {
          if (closeIdx > 0) {
            result.push({ type: 'redLetter', text: text.slice(0, closeIdx) });
          }
          result.push({ type: 'redLetterQuote', text: '”' });
          inRedLetter = false;
          text = text.slice(closeIdx + 1);
        }
      } else {
        const openIdx = text.indexOf('‹');
        if (openIdx === -1) {
          if (text.length > 0) {
            result.push({ type: 'text', text });
          }
          text = '';
        } else {
          if (openIdx > 0) {
            result.push({ type: 'text', text: text.slice(0, openIdx) });
          }
          result.push({ type: 'redLetterQuote', text: '“' });
          inRedLetter = true;
          text = text.slice(openIdx + 1);
        }
      }
    }
  }
  return result;
};

/** Insert margin-note anchors after the end of each annotated phrase, over an
 *  **already-segmented** verse (§10 M6's third layer).
 *
 *  A note's `phrase` is a substring of the verse as the corpus wrote it, so the
 *  search runs over the concatenation of the segments' text with a running
 *  offset that maps a match back to the segment it landed in. That is what lets
 *  the margin layer run third — after italic and red letter have already split
 *  the string — rather than first, which is where it had to sit when it indexed
 *  the raw verse directly.
 *
 *  A phrase whose end falls **inside** a segment splits that segment; a phrase
 *  that straddles two segments anchors at the end of the segment its match ends
 *  in, because an anchor is a point and points do not straddle. A phrase the
 *  verse does not contain contributes no anchor, exactly as before.
 *
 *  Notes are anchored in end order so two anchors in one verse stay in reading
 *  order, which is the order `noteIndex` is read in. */
export const applyMarginAnchors = (
  segments: readonly TextSegment[],
  marginNotes: readonly MarginNoteAnchor[],
): TextSegment[] => {
  if (marginNotes.length === 0) return segments.slice();

  /** The verse as the notes see it, plus where each segment starts in it. Only
   *  segments that carry text participate; a `margin` segment has none. */
  let whole = '';
  const starts: number[] = [];
  for (const segment of segments) {
    starts.push(whole.length);
    if (segment.type === 'margin') continue;
    whole += segment.text;
  }
  const lowerWhole = whole.toLowerCase();

  const byEnd: { end: number; noteIndex: number }[] = [];
  for (const note of marginNotes) {
    const at = lowerWhole.indexOf(note.phrase.toLowerCase());
    if (at === -1) continue;
    byEnd.push({ end: at + note.phrase.length, noteIndex: note.noteIndex });
  }
  byEnd.sort((left, right) => left.end - right.end);

  const result: TextSegment[] = [];
  let cursor = 0;
  for (const [index, original] of segments.entries()) {
    if (original.type === 'margin') {
      result.push(original);
      continue;
    }
    /** Rebinding the narrowed segment keeps `{ ...segment, text }` a member of
     *  the union rather than a widened object literal, so re-splitting a
     *  `redLetterItalic` run needs no assertion to stay `redLetterItalic`. */
    const segment: TextBearingSegment = original;
    const start = starts[index] ?? 0;
    const end = start + segment.text.length;
    let local = 0;
    for (const anchor of byEnd) {
      // Anchors land after the *last* character of the phrase, so an anchor at
      // exactly this segment's start belongs to the previous segment.
      if (anchor.end <= start || anchor.end > end) continue;
      const offset = anchor.end - start;
      if (offset > local) {
        result.push({ ...segment, text: segment.text.slice(local, offset) });
      }
      result.push({ type: 'margin', noteIndex: anchor.noteIndex });
      local = offset;
    }
    if (local < segment.text.length) {
      result.push({ ...segment, text: segment.text.slice(local) });
    }
    cursor = end;
  }
  if (cursor < whole.length) result.push({ type: 'text', text: whole.slice(cursor) });
  return result;
};

/** Apply case-insensitive search highlighting to `text` segments only —
 *  margin / red-letter / italic segments are preserved untouched so the
 *  highlight overlay never breaks earlier semantics. Queries shorter than
 *  two characters are ignored to avoid pathological splitting. */
export const applySearchHighlights = (
  segments: readonly TextSegment[],
  searchQuery: string,
): TextSegment[] => {
  if (searchQuery.length < 2) return segments.slice();

  const result: TextSegment[] = [];
  const lowerQuery = searchQuery.toLowerCase();

  for (const segment of segments) {
    if (segment.type !== 'text') {
      result.push(segment);
      continue;
    }

    const segText = segment.text;
    const lowerSegText = segText.toLowerCase();
    let pos = 0;
    let searchPos = lowerSegText.indexOf(lowerQuery, pos);

    while (searchPos !== -1) {
      if (searchPos > pos) {
        result.push({ type: 'text', text: segText.slice(pos, searchPos) });
      }
      result.push({
        type: 'highlight',
        text: segText.slice(searchPos, searchPos + searchQuery.length),
      });
      pos = searchPos + searchQuery.length;
      searchPos = lowerSegText.indexOf(lowerQuery, pos);
    }

    if (pos < segText.length) {
      result.push({ type: 'text', text: segText.slice(pos) });
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// §4.6 — the phrase-link layer
// ---------------------------------------------------------------------------

/** Exactly what this module needs from a matched phrase.
 *
 *  Stated structurally rather than imported from `wiki/phrase-matcher.ts`, and
 *  the direction of the dependency is the reason: the matcher already imports
 *  `TextSegment` from *here* to declare `matchSegments`, so importing
 *  `PhraseSpan` back would close a cycle between the two modules. A
 *  `PhraseSpan` is assignable to this shape, so the caller passes the matcher's
 *  own output unchanged and nothing has to be re-projected.
 *
 *  `slug` is a plain `string` for the same reason: the brand lives in the wiki
 *  model, and a rendering module that had to construct one would need the
 *  schema. The renderer only ever puts it in an `href`. */
export interface PhraseSpanInput {
  readonly start: number;
  readonly end: number;
  readonly slug: string;
  readonly alias: string;
}

/** One span list per segment, aligned by index — the shape `matchSegments`
 *  returns, taken as-is so the two cannot drift. */
export type SegmentPhraseSpans = readonly (readonly PhraseSpanInput[])[];

/** Splits `text` segments on their matched phrase spans, on the same discipline
 *  {@link applySearchHighlights} uses: nothing else is entered.
 *
 *  §4.6 states the rule as *a phrase span never crosses a `TextSegment`
 *  boundary*, and this function is the second half of enforcing it — the first
 *  half is `matchSegments`, which never lets the matcher see a non-`text`
 *  segment's text at all. So the spans arriving here are already local to one
 *  `text` segment, and the only job left is to slice.
 *
 *  `spans` is parallel to `segments` by index rather than flattened, exactly as
 *  `matchSegments` emits it: a span's offsets are local to its own segment, and
 *  a flat list would lose which string they index into. A segment with no entry
 *  — a shorter list, a non-`text` segment — passes through whole.
 *
 *  Spans are consumed in the order given and each one must start at or after
 *  the previous one's end; the matcher's `resolve` already guarantees that by
 *  sweeping in start order with a reach cursor, so a span that would overlap is
 *  dropped here rather than producing crossed output. */
export const applyPhraseSegments = (
  segments: readonly TextSegment[],
  spans: SegmentPhraseSpans,
): TextSegment[] => {
  const result: TextSegment[] = [];
  for (const [index, segment] of segments.entries()) {
    const matched = spans[index] ?? [];
    if (segment.type !== 'text' || matched.length === 0) {
      result.push(segment);
      continue;
    }
    let cursor = 0;
    for (const span of matched) {
      if (span.start < cursor || span.end > segment.text.length) continue;
      if (span.start > cursor) {
        result.push({ type: 'text', text: segment.text.slice(cursor, span.start) });
      }
      result.push({
        type: 'phrase',
        text: segment.text.slice(span.start, span.end),
        slug: span.slug,
        alias: span.alias,
      });
      cursor = span.end;
    }
    if (cursor < segment.text.length) {
      result.push({ type: 'text', text: segment.text.slice(cursor) });
    }
  }
  return result;
};

/** Split verse text into segments, with margin-note anchors inserted after
 *  the end of each matching phrase. Optionally applies search highlighting.
 *  The leading pilcrow (`¶`) — paragraph marker in the KJV source — is
 *  stripped before tokenization so callers never have to pre-clean the input.
 *  The returned array always contains at least one segment (empty input
 *  yields a single empty `text` segment). */
export const segmentVerseText = (
  raw: string,
  marginNotes: readonly MarginNoteAnchor[] = [],
  searchQuery?: string,
): TextSegment[] => composeSegments({ text: raw, marginNotes, searchQuery });

// ---------------------------------------------------------------------------
// The reader's pipeline (§10, Milestone 6)
// ---------------------------------------------------------------------------

/** The four layers, named. */
export type SegmentLayer = 'italic' | 'redLetter' | 'margin' | 'phrase';

/** The order the four layers are applied in — **executably**, not as a claim
 *  beside the call.
 *
 *  §10's Milestone 6 names the order *italic, red letter, margin, phrase*, and
 *  {@link composeSegments} below literally iterates this array and applies the
 *  layer each element names. Reorder the constant and the pipeline reorders with
 *  it; that is what the pairwise tests in `segments.test.ts` exploit to prove the
 *  order is load-bearing rather than decorative.
 *
 *  Two of the four used to be pinned the other way round, and both were freed
 *  rather than excused:
 *
 *  - **margin ran first** because a note's anchor was an offset into the raw
 *    verse string and every later layer split that string. It now runs third,
 *    over the segment list, matching each note's phrase against the concatenated
 *    segment text and mapping the match back to the segment it landed in
 *    ({@link applyMarginAnchors}).
 *  - **red letter ran before italic** because `applyItalicSegments` was the half
 *    that promoted a bracket inside Christ's words to `redLetterItalic`. The
 *    promotion now lives in `applyRedLetterSegments`, which meets an `italic`
 *    segment inside an open quote and promotes it — so italic can run first and
 *    `‹Blessed [are]›` still renders as red-letter italic.
 *
 *  What the order *means* is which layer wins where two could claim the same
 *  characters: italic outranks red letter (a bracket inside a quote stays
 *  italic, as `redLetterItalic`), red letter outranks margin (an anchor mid-quote
 *  does not end the quote), margin outranks phrase (a phrase cannot bridge an
 *  anchor), and **phrase is last and outranks nothing** — it is only ever offered
 *  the `text` segments the first three did not claim, which is §4.6 exactly. */
export const SEGMENT_APPLICATION_ORDER: readonly SegmentLayer[] = [
  'italic',
  'redLetter',
  'margin',
  'phrase',
];

/** How the caller supplies the phrase layer: given the editorial segments, say
 *  which spans each one carries.
 *
 *  A callback rather than a span list, because the matcher's offsets are only
 *  meaningful against the segments this pipeline just produced — and the caller
 *  cannot have them until it runs. Handing the segments *out* and taking the
 *  spans back is what makes it impossible to pass spans computed against some
 *  other segmentation of the same verse. In the app this closure is
 *  `(segments) => matchSegments(automaton, segments, sectionState)`; in a CLI
 *  formatter it is simply omitted. */
export type PhraseLayer = (segments: readonly TextSegment[]) => SegmentPhraseSpans;

/** No phrase layer: a host with no dictionary, or a surface the wiki does not
 *  overlay. Every segment gets an empty span list, so the pipeline's last step
 *  is a no-op rather than a branch. */
const NO_PHRASES: PhraseLayer = () => [];

export interface SegmentComposition {
  readonly text: string;
  readonly marginNotes?: readonly MarginNoteAnchor[];
  readonly searchQuery?: string;
  readonly phrases?: PhraseLayer;
}

/** The one ordered composition: the four layers, applied by walking
 *  {@link SEGMENT_APPLICATION_ORDER}.
 *
 *  The pilcrow strip and the optional search highlight are not layers — the
 *  first is input cleaning (§10 names four layers, and `¶` is none of them) and
 *  the second is a transient overlay the reader does not run. Both happen before
 *  the walk, over the single `text` segment the verse starts as.
 *
 *  Every branch of the switch is reachable and none of them is a no-op the
 *  compiler could fold away, which is the property that makes the constant a
 *  *fact about execution*: delete an element and that layer stops being applied.
 */
export const composeSegments = (input: SegmentComposition): TextSegment[] => {
  const text = input.text.replace(/^¶\s*/, '');
  let segments: TextSegment[] = [{ type: 'text', text }];
  if (Predicate.isNotUndefined(input.searchQuery) && input.searchQuery.length > 0) {
    segments = applySearchHighlights(segments, input.searchQuery);
  }

  for (const layer of SEGMENT_APPLICATION_ORDER) {
    switch (layer) {
      case 'italic':
        segments = applyItalicSegments(segments);
        break;
      case 'redLetter':
        segments = applyRedLetterSegments(segments);
        break;
      case 'margin':
        segments = applyMarginAnchors(segments, input.marginNotes ?? []);
        break;
      case 'phrase': {
        const phrases = input.phrases ?? NO_PHRASES;
        segments = applyPhraseSegments(segments, phrases(segments));
        break;
      }
    }
  }
  return segments;
};

/** The reader's whole verse pipeline: the KJV editorial layers plus the wiki
 *  phrase overlay, in the fixed {@link SEGMENT_APPLICATION_ORDER}.
 *
 *  One function rather than four calls at the call site, because "the order is
 *  fixed" has to be a property of the code and not of two hosts remembering to
 *  write the same four lines in the same sequence.
 *  `packages/app/src/reading/match-plan.ts` calls this and nothing else.
 *
 *  Omit `phrases` and this is `segmentVerseText` exactly — the same four layers
 *  the reader has always needed and never had, with the fourth simply empty. */
export const renderVerseSegments = (input: SegmentComposition): TextSegment[] =>
  composeSegments(input);
