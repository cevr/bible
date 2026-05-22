/**
 * Pure text segmentation for verse rendering. Framework-agnostic — produces
 * a typed `TextSegment[]` that any UI (React, Solid, plain HTML) can map
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

/** A single styled chunk of verse text. The renderer maps each variant to
 *  its own UI primitive (e.g. `<em>`, `<mark>`, popover anchor, …). */
export type TextSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'italic'; readonly text: string }
  | { readonly type: 'highlight'; readonly text: string }
  | { readonly type: 'redLetter'; readonly text: string }
  | { readonly type: 'redLetterItalic'; readonly text: string }
  | { readonly type: 'redLetterQuote'; readonly text: string }
  | { readonly type: 'margin'; readonly noteIndex: number };

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
    const italicType: TextSegment['type'] =
      segment.type === 'redLetter' ? 'redLetterItalic' : 'italic';
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
 *  superscripts inserted mid-quote don't break the parsing. */
export const applyRedLetterSegments = (segments: readonly TextSegment[]): TextSegment[] => {
  const result: TextSegment[] = [];
  let inRedLetter = false;

  for (const segment of segments) {
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
): TextSegment[] => {
  const text = raw.replace(/^¶\s*/, '');
  const phraseMatches: { start: number; end: number; noteIndex: number }[] = [];

  for (const note of marginNotes) {
    const pos = text.toLowerCase().indexOf(note.phrase.toLowerCase());
    if (pos !== -1) {
      phraseMatches.push({
        start: pos,
        end: pos + note.phrase.length,
        noteIndex: note.noteIndex,
      });
    }
  }

  phraseMatches.sort((a, b) => a.end - b.end);

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of phraseMatches) {
    if (match.end > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.end) });
    }
    segments.push({ type: 'margin', noteIndex: match.noteIndex });
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', text });
  }

  const highlighted =
    searchQuery !== undefined && searchQuery.length > 0
      ? applySearchHighlights(segments, searchQuery)
      : segments;

  return applyItalicSegments(applyRedLetterSegments(highlighted));
};
