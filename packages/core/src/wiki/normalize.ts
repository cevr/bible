/** §4.3 normalization, in core because two things depend on agreeing about it.
 *
 *  The compiler keys `topic_aliases` on the normalized form (`topics-compiler/
 *  compile.ts`), and the render-time matcher (`phrase-matcher.ts`) has to
 *  produce the *same* key from running text or the dictionary it was handed is
 *  unreachable. Two copies of one rule is the classic drift: widen the
 *  compiler's punctuation set and every host silently stops matching phrases
 *  the artifact still lists. One module, imported by both, makes that
 *  impossible.
 *
 *  There is exactly one normalizing scan here — `normalizeScan` — and both
 *  sides call it. `normalizeAlias` is that scan with the offset table thrown
 *  away; the matcher is that scan with the offset table kept. A dictionary key
 *  and a run of text therefore cannot normalize differently, because there is
 *  no second definition of "normalized" for them to disagree about.
 *
 *  This module is deliberately dependency-free — no Effect, no schemas, no
 *  services. It is pure string arithmetic that the matcher's inner loop calls
 *  once per code point, and it is what a Bun build script imports without
 *  dragging a runtime with it.
 */

/** "Soft punctuation" is exactly the §4.3 set — commas and semicolons — and is
 *  transparent to matching: "faith, hope" and "faith hope" normalize alike.
 *
 *  Nothing else is folded. An apostrophe distinguishes "the Lord's day" from
 *  "the lords day", and collapsing them would let two genuinely different
 *  phrases collide onto one dictionary key and be rejected at compile time as a
 *  duplicate alias. Normalizing more than the spec allows is a silent widening
 *  of the matcher, so the set stays closed here rather than growing at a call
 *  site. */
export const isSoftPunctuation = (character: string): boolean =>
  character === ',' || character === ';';

/** ECMAScript `\s`, as a predicate over one code point.
 *
 *  Not an explicit list. An explicit list was tried and it silently dropped
 *  U+00A0's neighbours — U+1680, the U+2000 block, U+2028/U+2029, U+202F,
 *  U+205F, U+3000, and the U+FEFF byte-order mark that leads half the text
 *  files in the wild. §4.3 says "whitespace collapsed", and the only
 *  self-maintaining spelling of "whitespace" available without a dependency is
 *  the engine's own: a `\s` test, which tracks the Unicode `White_Space`
 *  property plus the line terminators and the BOM as the language defines
 *  them. A hand-kept set is a set that goes stale against a corpus nobody
 *  audits for exotic separators. */
const WHITESPACE = /\s/u;

export const isWhitespace = (character: string): boolean => WHITESPACE.test(character);

/** True when the character is transparent to §4.3: it collapses to a single
 *  separator rather than contributing a normalized character of its own. */
export const isSeparator = (character: string): boolean =>
  isWhitespace(character) || isSoftPunctuation(character);

/** Case folding for one code point.
 *
 *  Per code point rather than over the whole string, because the matcher needs
 *  to know which source characters produced which normalized characters and a
 *  whole-string `toLowerCase` hands back a string with no provenance. Per code
 *  point costs one context-sensitive rule, and this is it:
 *
 *  `String.prototype.toLowerCase` lowers a *final* Greek sigma to ς and a
 *  medial one to σ, a decision it can only make with the following character in
 *  hand. Folded one code point at a time, "ΟΣ" would end in σ while the
 *  authored alias "ος" ends in ς, and the two would never meet. Folding ς onward
 *  to σ removes the context: every sigma, in every position, on both sides,
 *  normalizes to σ. "ΟΣ", "Ος", and "ος" are then one key. The cost is that a
 *  hypothetical alias pair distinguished *only* by final-sigma form would
 *  collide — and the compiler would reject it as a duplicate alias, which is the
 *  correct outcome for two spellings of one Greek word.
 *
 *  Expansions are kept: U+0130 (İ) folds to "i" + U+0307, two UTF-16 units from
 *  one source code point. The offset table below is what makes that safe. */
const FINAL_SIGMA = 'ς';
const MEDIAL_SIGMA = 'σ';

export const foldCodePoint = (codePoint: string): string => {
  const lowered = codePoint.toLowerCase();
  if (lowered === FINAL_SIGMA) return MEDIAL_SIGMA;
  return lowered;
};

/** One normalized string and the map back to the source it came from.
 *
 *  `starts[i]` / `ends[i]` are the source UTF-16 offsets of the source text
 *  that produced normalized UTF-16 unit `i`. Every unit carries the *whole*
 *  extent of its source character, so:
 *
 *  - A surrogate pair contributes one code point and its two normalized units
 *    both map to the full pair — a span can never cut a pair in half.
 *  - A one-to-many fold (İ → i + U+0307) has both units map to the single
 *    source unit the İ occupied, so a span over the fold covers the İ exactly.
 *  - A collapsed separator run emits one space whose extent is the entire run,
 *    so a phrase ending at a collapsed boundary never reports an offset that
 *    slices a separator in half.
 */
export interface NormalizedText {
  /** The §4.3 normalized text. This is what a trie is built from and what an
   *  automaton walks — both sides consume this same unit stream. */
  readonly text: string;
  /** Source offset of the character that produced each normalized unit. */
  readonly starts: Int32Array;
  /** Source offset one past that character. */
  readonly ends: Int32Array;
}

/** The one §4.3 scan: case folded, whitespace collapsed, soft punctuation
 *  transparent, leading and trailing separators dropped.
 *
 *  Iterates by *code point* (`for…of` over a string yields code points, not
 *  UTF-16 units) and emits by *unit*, recording a source extent per emitted
 *  unit. That split is the whole point: astral characters and one-to-many folds
 *  both break the 1:1 index assumption a unit-wise scan makes, and the table is
 *  what replaces it. */
export const normalizeScan = (source: string): NormalizedText => {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingFrom = -1;
  let index = 0;
  for (const codePoint of source) {
    const from = index;
    index += codePoint.length;
    if (isSeparator(codePoint)) {
      // Leading separators never emit: `pendingFrom` only becomes visible once
      // a real character follows, which is `trim` and `collapse` in one pass.
      if (text.length > 0 && pendingFrom < 0) pendingFrom = from;
      continue;
    }
    if (pendingFrom >= 0) {
      text += ' ';
      starts.push(pendingFrom);
      ends.push(from);
      pendingFrom = -1;
    }
    const folded = foldCodePoint(codePoint);
    text += folded;
    for (let unit = 0; unit < folded.length; unit += 1) {
      starts.push(from);
      ends.push(index);
    }
  }
  return { text, starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
};

/** §4.3 normalization as the compiler stores it: the scan's text, without the
 *  offset table a stored key has no use for. */
export const normalizeAlias = (alias: string): string => normalizeScan(alias).text;

/** Word characters, for §4.6's boundary rule. Letters, digits, and combining
 *  marks in any script: the corpus is English but topic aliases carry numerals
 *  ("2300 days", "1844") and a boundary test that treated digits as separators
 *  would match "300 days" inside "2300 days".
 *
 *  Marks are word characters because case folding *creates* them — U+0130 folds
 *  to "i" plus a combining dot — and a mark that read as a separator would turn
 *  the inside of a folded word into a boundary, letting "i" match inside
 *  "İstanbul".
 *
 *  Anchored at the start, and that anchor is load-bearing: `isBoundaryAt` hands
 *  this a two-unit slice so an astral character arrives whole, and an unanchored
 *  pattern would then answer about the *second* character whenever the first is
 *  a separator — reporting no boundary after every space that precedes a letter.
 *  Anchored, the test is about the first code point of what it was given, which
 *  is the contract the name states.
 *
 *  A single compiled pattern rather than a per-call literal — the matcher tests
 *  this once per candidate match, and `RegExp.test` on a shared sticky-free
 *  pattern has no per-call construction cost. */
const WORD_CHARACTER = /^[\p{L}\p{N}\p{M}]/u;

export const isWordCharacter = (character: string): boolean => WORD_CHARACTER.test(character);

/** A normalized string as its §4.6 words: the maximal runs of word characters,
 *  with everything else read as the boundary between them.
 *
 *  This is `isBoundaryAt`'s rule stated as a scan rather than as a test at one
 *  index, and it exists so a consumer that compares *words* — the §7 lookup
 *  resolver's containment and prefix rules — asks the same question the
 *  render-time matcher asks of a candidate span. Splitting the normalized text
 *  on spaces instead is the drift this module exists to prevent: normalization
 *  collapses whitespace and drops soft punctuation, but it deliberately keeps
 *  apostrophes and hyphens (see `isSoftPunctuation`), so `third angel's
 *  message` is three space-separated runs and four words. The matcher links the
 *  authored alias `third angel` inside it, on the boundary the apostrophe
 *  makes; a space-splitting consumer sees the single token `angel's` and
 *  answers nothing, and one phrase is then a link on the page and a miss in the
 *  panel.
 *
 *  Iterates by code point, like `normalizeScan`, so an astral character is one
 *  word character rather than two lone surrogates that match no `\p{…}` class
 *  and would cut a word in half. */
export const normalizedWords = (normalized: string): readonly string[] => {
  const found: string[] = [];
  let current = '';
  for (const codePoint of normalized) {
    if (isWordCharacter(codePoint)) {
      current += codePoint;
      continue;
    }
    if (current.length > 0) {
      found.push(current);
      current = '';
    }
  }
  if (current.length > 0) found.push(current);
  return found;
};

/** Whether the position just outside a match is a word boundary. Positions past
 *  either end of the text are boundaries — a phrase at the start or the end of a
 *  run is bounded by the run itself.
 *
 *  Reads a whole code point rather than a UTF-16 unit. `charAt` on either half
 *  of a surrogate pair yields a lone surrogate, which no `\p{…}` class matches,
 *  so a unit-wise test reports a word boundary in the *middle* of an astral word
 *  and lets a phrase match inside one.
 *
 *  `index` can land on either half. On the high half, the two-unit slice is the
 *  whole pair and the `u`-flagged pattern reads it as one letter. On the low
 *  half — which happens when a match ends between the halves — the slice starts
 *  one unit earlier so the pair is again whole, and the answer is "not a
 *  boundary", which is correct: a match that stops mid-character stopped inside
 *  a word. */
export const isBoundaryAt = (text: string, index: number): boolean => {
  if (index < 0 || index >= text.length) return true;
  const from = index - Number(isLowSurrogate(text.charCodeAt(index)));
  return !isWordCharacter(text.slice(from, from + 2));
};

const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;
