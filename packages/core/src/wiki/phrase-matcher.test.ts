/** The §4 rule set, one test per rule.
 *
 *  Every assertion here is a rule a naive implementation gets wrong in a
 *  specific, named way — the spec's §4.4 and §4.5 exist because a prototype got
 *  them wrong first. The Daniel 8 verses are a *named fixture* rather than
 *  invented sentences for the same reason: `the daily` and `sanctuary` share
 *  v11, and the literal one-link-per-section reading starved the second (§4.5).
 */

// `bun:test` rather than `effect-bun-test`: the matcher is a pure function with
// no services, no layers, and nothing to run inside an `Effect`. The repo's
// other pure-function suites (`bible/parse.test.ts`,
// `bible-cross-refs/authored.test.ts`) read the same way.
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { parseParagraphContent } from '../egw/ast.js';
import { segmentVerseText } from '../bible-rendering/segments.js';
// Namespace imports, because the assertion below is about *what the modules
// export* rather than about any one value: the fixture must be absent from the
// production barrel and present on the testing subpath.
import * as barrel from './index.js';
import * as testing from './testing.js';
import { PhraseDictionary, PhraseDictionaryEntry, topicSlug } from './model.js';
import { normalizeAlias } from './normalize.js';
import {
  DANIEL_8_9,
  DANIEL_8_SECTION,
  PHRASE_FIXTURE_DICTIONARY,
  PHRASE_FIXTURE_NOTE,
} from './phrase-fixture.js';
import {
  matchNodes,
  matchRun,
  matchSection,
  matchSegments,
  PhraseAutomaton,
  SectionMatchState,
  type NodeSpans,
  type PhraseSpan,
} from './phrase-matcher.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Builds a dictionary the way the compiler would: every alias already
 *  normalized, one topic per alias. Slug is derived from the alias so a failing
 *  assertion names the phrase that produced the span. */
const dictionary = (...aliases: readonly string[]): PhraseDictionary =>
  PhraseDictionary.make({
    entries: aliases.map((alias) =>
      PhraseDictionaryEntry.make({
        alias: normalizeAlias(alias),
        display: alias,
        slug: topicSlug(normalizeAlias(alias).replaceAll(' ', '-')),
        canonical: true,
      }),
    ),
    unavailable: Option.none(),
  });

/** The compared shape: the alias and the source text the span actually covers.
 *  Comparing the sliced text rather than the raw offsets makes an off-by-one in
 *  the normalized→source projection visible as a wrong word instead of as a
 *  number nobody can read. */
const covered = (
  text: string,
  spans: readonly PhraseSpan[],
): readonly { readonly alias: string; readonly text: string }[] =>
  spans.map((span) => ({ alias: span.alias, text: text.slice(span.start, span.end) }));

// The Daniel 8 verses and the fixture dictionary live in `phrase-fixture.ts`,
// not here: Milestone 4's adapter check is "one shared fixture, byte-identical
// offsets" across the worker, Electron main, and the CLI, and a fixture defined
// inside a `*.test.ts` cannot be imported by another package's suite.

// ---------------------------------------------------------------------------

describe('overlap resolution (§4.4)', () => {
  it('the longest match wins at the same start', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'heavenly sanctuary'));
    const text = 'Christ ministers in the heavenly sanctuary today.';

    // Both phrases end at the same position; only "heavenly sanctuary" starts
    // where the longer one does, and it is the one that must survive.
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'heavenly sanctuary', text: 'heavenly sanctuary' },
    ]);
  });

  it('a span suppressed inside another is eligible at its next clean occurrence', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'heavenly sanctuary'));
    const text = 'The heavenly sanctuary is the true sanctuary of the Lord.';

    // "sanctuary" loses its first occurrence to the longer span that contains
    // it — but §4.4 says that suppression is for that occurrence only, so the
    // second, clean occurrence is still hot.
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'heavenly sanctuary', text: 'heavenly sanctuary' },
      { alias: 'sanctuary', text: 'sanctuary' },
    ]);
  });

  it('a phrase overlapping an emitted span from the left is suppressed once', () => {
    const automaton = PhraseAutomaton.make(dictionary('day of atonement', 'atonement'));
    const text = 'The day of atonement, and later the atonement itself.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'day of atonement', text: 'day of atonement' },
      { alias: 'atonement', text: 'atonement' },
    ]);
  });
});

describe('first-occurrence rule (§4.5) — the Daniel 8 fixture', () => {
  it('gives each distinct phrase of the chapter its own first occurrence', () => {
    // **The named regression** (§10, Milestone 4). One link per *section* gave
    // Daniel 8 a single slot, `little horn` took it, and every other phrase in
    // the chapter went cold. §4.5 replaced that with one slot *per phrase*, so a
    // chapter carrying three distinct matchable phrases lights three links, in
    // the verses where each first appears.
    //
    // The pair the spec names is `the daily` / `sanctuary`, both in v11: two
    // distinct phrases sharing one verse, which is precisely what the disproved
    // reading could not express. (`pleasant land` was named first and is not
    // matchable — the KJV writes `pleasant [land]`. Its own test is below and
    // §10's footnote records why the spec moved the pair.)
    const automaton = PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY);
    const spans = matchSection(automaton, DANIEL_8_SECTION);

    expect(spans.map((run, index) => covered(DANIEL_8_SECTION[index] ?? '', run))).toEqual([
      // v9 — `little horn`.
      [{ alias: 'little horn', text: 'little horn' }],
      // v11 — the named pair, both hot, in one verse.
      [
        { alias: 'the daily', text: 'the daily' },
        { alias: 'sanctuary', text: 'sanctuary' },
      ],
      // v14 — `sanctuary` again. Cold: the phrase already spent its one slot in
      // v11, and the section is the chapter.
      [],
    ]);
  });

  it('records why pleasant land is not hot in Daniel 8:9', () => {
    // Not a defect and not an accident: the KJV writes the translator-supplied
    // word as `pleasant [land]`, and the bracket survives §4.3 (whose soft set
    // is commas and semicolons) exactly as it survives §4.6 (which will not let
    // a span cross out of a `text` segment into the `italic` one the bracket
    // becomes). Both paths reach the same answer, which is the property that
    // matters — the CLI matching raw verse text and the reader matching rendered
    // segments must not disagree about which phrases are hot.
    const automaton = PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY);

    const raw = matchRun(automaton, DANIEL_8_9).map((span) => span.alias);
    const rendered = matchSegments(automaton, segmentVerseText(DANIEL_8_9))
      .flat()
      .map((span) => span.alias);

    expect(raw).toEqual(['little horn']);
    expect(rendered).toEqual(raw);
    expect(PHRASE_FIXTURE_NOTE).toContain('§4.6');
  });

  it('only the first occurrence of a phrase is hot within one run', () => {
    // Two clean, non-overlapping occurrences in one string. The state is
    // consulted once per candidate *inside* the resolution sweep, not only
    // before it — filtering against the pre-run state alone would let both
    // through.
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'The little horn of Daniel 7 and the little horn of Daniel 8.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little horn' },
    ]);
  });

  it('the section, not the run, is the first-occurrence scope', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn', 'pleasant land'));
    // Two verses of one chapter. §4.5's table makes the chapter the section for
    // Bible text, so the second verse's repeat is cold — but a phrase that has
    // not appeared yet is still hot wherever it first lands.
    const verses = ['A little horn came forth.', 'The little horn took the pleasant land.'];

    const spans = matchSection(automaton, verses);
    expect(covered(verses[0] ?? '', spans[0] ?? [])).toEqual([
      { alias: 'little horn', text: 'little horn' },
    ]);
    expect(covered(verses[1] ?? '', spans[1] ?? [])).toEqual([
      { alias: 'pleasant land', text: 'pleasant land' },
    ]);
  });

  it('a new section starts every phrase cold again', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'The little horn.';

    // Two calls with two states — one chapter's exhausted slots must not leak
    // into the next chapter the reader scrolls into.
    expect(matchSection(automaton, [text], new SectionMatchState())[0]?.length).toBe(1);
    expect(matchSection(automaton, [text], new SectionMatchState())[0]?.length).toBe(1);
  });
});

describe('boundary rules (§4.6)', () => {
  it('no span crosses a TextSegment boundary', () => {
    // A phrase whose two words land in two different segments. `applyItalicSegments`
    // splits `[shall be]` out as `italic`, so "vision shall be" exists in the
    // verse the reader sees but in no single run — and the matcher must not
    // reach across to claim it. The control is in the same assertion: a phrase
    // wholly inside the first `text` segment is found, so the empty result for
    // the split phrase is the boundary rule and not a dead automaton.
    const automaton = PhraseAutomaton.make(dictionary('the daily', 'vision shall be'));
    const segments = segmentVerseText('the daily service; the vision [shall be] sealed.');

    expect(segments.map((segment) => segment.type)).toEqual(['text', 'italic', 'text']);
    expect(matchSegments(automaton, segments).map((run) => run.map((span) => span.alias))).toEqual([
      ['the daily'],
      [],
      [],
    ]);
  });

  it('non-text segments are kept in place and never matched', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const segments = segmentVerseText('The [sanctuary] shall be cleansed.');

    // The result is aligned with the input index for index, so a renderer can
    // zip them; the italic segment carrying "sanctuary" contributes no span.
    expect(segments.map((segment) => segment.type)).toEqual(['text', 'italic', 'text']);
    expect(matchSegments(automaton, segments).map((run) => run.length)).toEqual([0, 0, 0]);
  });

  it('no span enters a ScriptureRef or a BookRef node', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'great controversy'));
    const nodes = parseParagraphContent(
      'The sanctuary is described in ' +
        '<span class="egwlink egwlink_bible" title="Daniel 8:14" data-link="1965.119">' +
        'the sanctuary passage</span> and in ' +
        '<span class="egwlink egwlink_book" title="GC" data-link="132.1">' +
        'The Great Controversy</span>.',
    );

    // Both link nodes carry text the dictionary would otherwise match. §4.6
    // keeps a second link layer out of a node that is already a link, and the
    // rule is enforced by never descending — the only span is the one in the
    // surrounding prose.
    const matched = matchNodes(automaton, nodes);
    expect(matched.flatMap((entry) => entry.spans.map((span) => span.alias))).toEqual([
      'sanctuary',
    ]);
  });

  it('emphasis and comment wrappers are descended, link nodes are not', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const nodes = parseParagraphContent('The <em>sanctuary</em> stands.');

    // Styling is not link semantics: a phrase inside an `<em>` is still a
    // phrase, and its offsets are local to that `Text` node.
    const matched = matchNodes(automaton, nodes);
    expect(matched.flatMap((entry) => entry.spans.map((span) => span.start))).toEqual([0]);
  });

  it('each Text node is its own run, so no span crosses a line break', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const nodes = parseParagraphContent('a little<br />horn came');

    expect(matchNodes(automaton, nodes).flatMap((entry) => entry.spans)).toEqual([]);
  });

  it('NodeSpans carries the Text node it matched, so a renderer needs no narrowing', () => {
    // A type-level assertion with a runtime tail. `matchNodes` emits an entry
    // for exactly one AST variant, and typing `node` as the whole `Node` union
    // pushed that fact out of the type and into every consumer: Milestone 6's
    // renderer would have to switch on a `_tag` the producer already decided, or
    // cast, to reach the text it slices the spans out of.
    //
    // `render` below is that consumer, written the way M6 will write it. It
    // reads `entry.node.text` with no narrowing, so if `NodeSpans.node` widens
    // back to `Node` this file stops type-checking — `typecheck` is the gate the
    // assertion runs in, and the runtime expectation only proves the consumer is
    // reached.
    const render = (entry: NodeSpans): readonly string[] =>
      entry.spans.map((span) => entry.node.text.slice(span.start, span.end));

    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const nodes = parseParagraphContent('The <em>heavenly sanctuary</em> stands.');

    expect(matchNodes(automaton, nodes).flatMap(render)).toEqual(['sanctuary']);
  });
});

describe('normalization (§4.3)', () => {
  it('matches only on word boundaries', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'horn'));

    // A phrase inside a longer word is not a hit that loses a tie-break — it is
    // not a hit.
    expect(matchRun(automaton, 'the sanctuaries were unsanctuary and hornet')).toEqual([]);
    // …and the same phrases with real boundaries around them are.
    expect(matchRun(automaton, 'the sanctuary; the horn').map((span) => span.alias)).toEqual([
      'sanctuary',
      'horn',
    ]);
  });

  it('digits are word characters, so 300 days does not match inside 2300 days', () => {
    const automaton = PhraseAutomaton.make(dictionary('300 days'));

    expect(matchRun(automaton, 'the 2300 days of Daniel 8:14')).toEqual([]);
    expect(matchRun(automaton, 'the 300 days').length).toBe(1);
  });

  it('soft punctuation inside a phrase is transparent', () => {
    const automaton = PhraseAutomaton.make(dictionary('faith hope love'));
    const text = 'He had faith, hope; love in the end.';

    // The comma and the semicolon vanish under §4.3, and the span covers the
    // *source* extent of the phrase, punctuation included — a renderer slices
    // the original string, so the offsets have to describe it.
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'faith hope love', text: 'faith, hope; love' },
    ]);
  });

  it('collapsed whitespace is transparent and the span keeps the source extent', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'a little \n  horn appeared';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little \n  horn' },
    ]);
  });

  it('case is folded on both sides', () => {
    const automaton = PhraseAutomaton.make(dictionary('The Sanctuary'));
    const text = 'THE SANCTUARY of God';

    // The dictionary's alias is normalized by the compiler; the run is
    // normalized by the matcher. Same function, so they meet.
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'the sanctuary', text: 'THE SANCTUARY' },
    ]);
  });

  it('the matcher normalizes exactly what the compiler stored', () => {
    // The shared-function claim, asserted rather than assumed: the alias key the
    // compiler writes into `topic_aliases` is the key the matcher derives from
    // running text.
    expect(normalizeAlias('  The   Daily,  ')).toBe('the daily');
    expect(normalizeAlias("the Lord's Day")).toBe("the lord's day");
    expect(normalizeAlias('Faith, Hope; Love')).toBe('faith hope love');
  });
});

// ---------------------------------------------------------------------------
// Unicode (§4.3)
//
// Case folding is where a matcher quietly stops being a matcher. Each of these
// is a real failure the previous implementation had, and each fails in a
// *different* way — a miss, a nonsense offset, a truncated span — so they are
// separate tests rather than one table.
//
// The fix they all pin is structural: there is exactly one normalizing scan
// (`normalizeScan`), the trie is built from its output and the text is walked
// over its output, and every normalized UTF-16 unit carries the source extent
// that produced it. Asymmetry between the two sides is then not a bug to be
// found; it is a state the code has no way to reach.
// ---------------------------------------------------------------------------

describe('Unicode normalization (§4.3)', () => {
  it('Greek final sigma folds to the same key on both sides', () => {
    // `'ΟΣ'.toLowerCase()` is "ος" — a whole-string lowercase resolves a
    // *final* sigma from the following context. Folded one code point at a
    // time, the same input gives "οσ". A matcher that lowercased the dictionary
    // one way and the text the other made "ΟΣ" fail to match itself.
    //
    // The rule is fixed here by folding ς onward to σ, so every sigma in every
    // position normalizes to σ on both sides — the dictionary key and the
    // running text meet regardless of which form either was authored in.
    expect(normalizeAlias('ΟΣ')).toBe(normalizeAlias('ος'));
    expect(normalizeAlias('ΟΣ')).toBe(normalizeAlias('Ος'));

    // …and it matches through the automaton, in both directions, with offsets
    // that cover the whole source token.
    const upper = PhraseAutomaton.make(dictionary('ΟΣ'));
    expect(covered('λόγος ΟΣ τέλος', matchRun(upper, 'λόγος ΟΣ τέλος'))).toEqual([
      { alias: normalizeAlias('ΟΣ'), text: 'ΟΣ' },
    ]);

    const lower = PhraseAutomaton.make(dictionary('ος'));
    expect(covered('πρὸ ΟΣ μετά', matchRun(lower, 'πρὸ ΟΣ μετά'))).toEqual([
      { alias: normalizeAlias('ος'), text: 'ΟΣ' },
    ]);
  });

  it('a one-to-many lowercase expansion keeps the span over the whole source token', () => {
    // U+0130 (İ) lowercases to *two* UTF-16 units — "i" plus a combining dot —
    // from one source unit. A scan that assumed one normalized unit per source
    // unit produced a span of `start: 0, end: 0`: the offsets ran off the end of
    // its index arrays and both ends fell back to zero, so the renderer would
    // have sliced an empty string out of a real match.
    //
    // The offset table maps *both* folded units back to the single İ they came
    // from, so the span covers the source token exactly.
    const automaton = PhraseAutomaton.make(dictionary('İstanbul'));
    const text = 'He sailed to İSTANBUL in the spring.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: normalizeAlias('İstanbul'), text: 'İSTANBUL' },
    ]);

    // Not vacuously zero, and not a prefix: the span is the full eight
    // characters of the source token.
    const [span] = matchRun(automaton, text);
    expect(span?.start).toBe(13);
    expect(span?.end).toBe(21);
  });

  it('a dotless i is not the dotted one — the expansion is folded, not stripped', () => {
    // The decision pinned rather than left to be rediscovered. Unicode caseless
    // matching folds U+0130 to "i" + U+0307 and does *not* equate it with a bare
    // "i"; §4.3 says case-insensitive, not accent-insensitive, and stripping
    // combining marks would also fold "é" onto "e" and let one alias claim two
    // words. So `istanbul` does not match `İstanbul`, and the combining dot the
    // fold produces counts as a word character — otherwise it would read as a
    // boundary and let the bare `i` match *inside* the folded token.
    const automaton = PhraseAutomaton.make(dictionary('istanbul', 'i'));

    expect(matchRun(automaton, 'He sailed to İstanbul.')).toEqual([]);
  });

  it('an astral-plane alias matches itself with offsets over the whole surrogate pair', () => {
    // Gothic letters are outside the BMP: each is one code point and two UTF-16
    // units. The previous trie mixed the two — it built edges by code point,
    // stored pattern lengths in units, and matched by unit — so an astral alias
    // built a one-edge path the two-unit match loop could never walk, and the
    // phrase did not match itself.
    //
    // The unit is now the alphabet on both sides, and the offset table maps both
    // units of a pair to the whole pair, so no span can ever cut one in half.
    const word = '\u{10330}\u{10331}\u{10332}'; // 𐌰𐌱𐌲
    const automaton = PhraseAutomaton.make(dictionary(word));
    const text = `a ${word} b`;

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: normalizeAlias(word), text: word },
    ]);
    const [span] = matchRun(automaton, text);
    expect(span?.end).toBe((span?.start ?? 0) + word.length);
  });

  it('an astral letter is a word character, so a boundary is not found inside one', () => {
    // The boundary test reads a whole code point. Reading a UTF-16 unit would
    // hand `\p{L}` an unpaired surrogate — not a letter — and report a word
    // boundary in the middle of an astral word, letting a phrase match inside
    // one.
    const word = '\u{10330}\u{10331}'; // 𐌰𐌱
    const automaton = PhraseAutomaton.make(dictionary(word));

    // The alias occurs as a *prefix* of a longer astral word, so it is not a hit.
    expect(matchRun(automaton, `x ${word}\u{10332} y`)).toEqual([]);
  });

  it('composed and decomposed accents are distinct keys — NFC is out of §4.3 scope', () => {
    // §4.3 lists case, whitespace, and soft punctuation. It does not mention
    // Unicode normalization forms, and adding NFC to the matcher alone would be
    // the exact drift this module exists to prevent: the compiler keys
    // `topic_aliases` through the same function, so either both sides compose or
    // neither does. Neither does, and the choice is pinned here so a later
    // reader changes it deliberately, on both sides, rather than by accident on
    // one.
    const precomposed = 'café'; // café
    const decomposed = 'café'; // cafe + combining acute

    expect(normalizeAlias(precomposed)).not.toBe(normalizeAlias(decomposed));

    const automaton = PhraseAutomaton.make(dictionary(precomposed));
    expect(matchRun(automaton, `a ${decomposed} b`)).toEqual([]);
    expect(matchRun(automaton, `a ${precomposed} b`).length).toBe(1);
  });

  it('whitespace is ECMAScript whitespace, not a hand-kept ASCII set', () => {
    // §4.3 says "whitespace collapsed", and the set that used to implement it was
    // seven ASCII characters plus U+00A0 — which silently made every other
    // Unicode separator an ordinary character, so a phrase joined by one could
    // not be found at all. Each of these appears in real text: U+00A0 and U+202F
    // in typographic prose, U+2009 and the U+2000 block in typeset quotations,
    // U+3000 in CJK, U+2028/U+2029 in text pasted from a word processor, and
    // U+FEFF at the head of half the files in the wild.
    const separators = [
      '\u00A0',
      '\u1680',
      '\u2000',
      '\u2003',
      '\u2009',
      '\u2028',
      '\u2029',
      '\u202F',
      '\u205F',
      '\u3000',
      '\uFEFF',
    ];
    for (const separator of separators) {
      expect(normalizeAlias(`little${separator}horn`)).toBe('little horn');
    }

    // …and the collapsed run is transparent to the automaton, with the span
    // covering the source extent the separator occupies.
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'a little\u2009\u00A0horn b';
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little\u2009\u00A0horn' },
    ]);
  });
});

describe('the dictionary (§4.8, §3.5)', () => {
  it('a noise-flagged alias is absent from the dictionary and therefore never matches', () => {
    // §4.8 excludes bare `judgment` at *authoring* time — the stub records the
    // exclusion and the compiler emits no row. The matcher needs no rule for it:
    // a phrase the dictionary does not carry is a phrase the automaton has no
    // path for. A matcher that special-cased the word would be a second,
    // divergent copy of the exclusion list.
    const automaton = PhraseAutomaton.make(dictionary('investigative judgment'));
    const text = 'The judgment is set, and the investigative judgment began in 1844.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'investigative judgment', text: 'investigative judgment' },
    ]);
  });

  it('the Daniel 8 fixture is reachable from the testing subpath, not the production barrel', () => {
    // The fixture has to be *one* module — §10's adapter check is "one shared
    // fixture, byte-identical offsets" across three hosts — and it therefore
    // cannot hide in a `*.test.ts` the CLI's suite could not import. But
    // importable is not shippable: exported from `./wiki`, a verse of Daniel 8
    // and a five-entry dictionary sit in the namespace an app imports
    // `WikiService` from, and a fallback path could reach for the test
    // dictionary when the real one is unavailable.
    //
    // `./wiki/testing` is the seam. The assertion is on the *barrel*, because
    // that is the surface an app imports: the fixture's names must not appear
    // in it, and must appear in the testing module.
    expect(Object.keys(barrel)).not.toContain('PHRASE_FIXTURE_DICTIONARY');
    expect(Object.keys(barrel)).not.toContain('DANIEL_8_9');
    expect(Object.keys(testing)).toContain('PHRASE_FIXTURE_DICTIONARY');
    expect(Object.keys(testing)).toContain('DANIEL_8_9');

    // …and it is the same module, not a copy: the value the testing subpath
    // exports is identical to the one this file imported relatively.
    expect(testing.PHRASE_FIXTURE_DICTIONARY).toBe(PHRASE_FIXTURE_DICTIONARY);
    expect(testing.DANIEL_8_9).toBe(DANIEL_8_9);

    // The matcher itself is still on the barrel — the exclusion is the fixture,
    // not the module it lives beside.
    expect(Object.keys(barrel)).toContain('PhraseAutomaton');
  });

  it('an empty dictionary matches nothing rather than failing', () => {
    // §3.5: with no topics artifact the dictionary is empty and carries its
    // reason. Matching nothing is the correct behavior for a wiki with no pages.
    const automaton = PhraseAutomaton.make(
      PhraseDictionary.make({ entries: [], unavailable: Option.some('artifact-not-installed') }),
    );
    expect(matchRun(automaton, DANIEL_8_9)).toEqual([]);
  });

  it('one automaton serves many runs without carrying state between them', () => {
    // §4.2's construct-once contract. If the automaton held match state, the
    // second call would differ from the first.
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    expect(matchRun(automaton, DANIEL_8_9)).toEqual(matchRun(automaton, DANIEL_8_9));
  });
});
