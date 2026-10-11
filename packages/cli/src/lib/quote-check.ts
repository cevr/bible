/**
 * The quotations a teaching document makes, and whether each one is word for
 * word what its source says.
 *
 * A teaching document (see the bible skill's teachings format) quotes in two
 * line shapes, and only these two:
 *
 *   - _Rom 4:3._ "Abraham believed God, and it was counted unto him" — gloss
 *   [SOP DA 25.2] "punchline" — gloss
 *   [PIONEER Waggoner, GCDB March 11, 1891, page 75.13] "punchline" — gloss
 *
 * This module finds those lines and compares text. Fetching the source text
 * is the caller's job, so everything here is pure.
 */

export type Citation =
  | {
      readonly _tag: 'scripture';
      readonly line: number;
      /** The reference as written, normalized to one `bible verse` parses. */
      readonly reference: string;
      readonly quote: string;
    }
  | {
      readonly _tag: 'witness';
      readonly line: number;
      readonly kind: 'SOP' | 'PIONEER';
      /** Refcodes the marker may be naming, most likely first. A PIONEER
       *  marker is `Name, REFCODE`, and both a name ("Himes, Bliss, Hale") and
       *  a periodical refcode contain commas, so every split is a candidate. */
      readonly refcodes: readonly string[];
      readonly quote: string;
    };

/** A witness quotation is a punchline: one contiguous clause, at most this
 *  many words, never spliced. */
export const WITNESS_WORD_LIMIT = 30;

const SCRIPTURE_LINE = /^\s*-\s+_([^_]+?)\._\s+"(.+?)"\s*(?:—|$)/;
const WITNESS_LINE = /^\s*\[(SOP|PIONEER)\s+([^\]]+)\]\s*"(.+?)"\s*(?:—|$)/;

/** `Heb 1:1, 2` is how a document writes what `bible verse` reads as `Heb 1:1-2`. */
const scriptureReference = (written: string): string =>
  written.trim().replace(/:(\d+),\s*(\d+)$/, ':$1-$2');

const witnessRefcodes = (kind: 'SOP' | 'PIONEER', body: string): readonly string[] => {
  if (kind === 'SOP') return [body.trim()];
  const parts = body.split(',');
  return parts.slice(1).map((_, index) =>
    parts
      .slice(index + 1)
      .join(',')
      .trim(),
  );
};

export const citationsIn = (markdown: string): readonly Citation[] =>
  markdown.split('\n').flatMap((text, index): Citation[] => {
    const line = index + 1;
    const scripture = text.match(SCRIPTURE_LINE);
    if (scripture?.[1] && scripture[2]) {
      return [
        {
          _tag: 'scripture',
          line,
          reference: scriptureReference(scripture[1]),
          quote: scripture[2],
        },
      ];
    }
    const witness = text.match(WITNESS_LINE);
    if (witness?.[1] && witness[2] && witness[3]) {
      let kind: 'SOP' | 'PIONEER' = 'PIONEER';
      if (witness[1] === 'SOP') kind = 'SOP';
      return [
        {
          _tag: 'witness',
          line,
          kind,
          refcodes: witnessRefcodes(kind, witness[2]),
          quote: witness[3],
        },
      ];
    }
    return [];
  });

/**
 * Text reduced to what a quotation must preserve: its words, in order.
 * Typography (curly quotes, dashes, diacritics), punctuation and case are not
 * part of that, and neither are the KJV's display marks — `[is]` for a
 * supplied word keeps its word, `‹›` red letters and `¶` go.
 */
const normalizeQuotation = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[[\]‹›¶]/g, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Whether `quote` is word for word in `source`. A bracketed insertion in the
 *  quote (`"[Christ,] who upholds all things"`) is the quoter's own words: the
 *  pieces around it must each appear, in order. */
export const quotationAppearsIn = (source: string, quote: string): boolean => {
  const haystack = normalizeQuotation(source);
  const pieces = quote
    .split(/\[[^\]]*\]/)
    .map(normalizeQuotation)
    .filter((piece) => piece.length > 0);
  let from = 0;
  for (const piece of pieces) {
    const at = haystack.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return pieces.length > 0;
};

export const isSpliced = (quote: string): boolean => /\.\.\.|…/.test(quote);

/** Words the source said: bracketed insertions are not counted. */
export const quotedWordCount = (quote: string): number =>
  normalizeQuotation(quote.replace(/\[[^\]]*\]/g, ' '))
    .split(' ')
    .filter((word) => word.length > 0).length;
