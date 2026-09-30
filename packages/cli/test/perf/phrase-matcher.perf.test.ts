/** The §4.1 budget, asserted rather than cited.
 *
 *  Phrase matching runs at render time over the text a client is about to draw,
 *  so its cost lands inside a frame. The research the spec cites measured a
 *  30-paragraph screenful at 0.38 ms on an M4 Pro under Bun and a naive
 *  automaton building over 1,000 phrases in ~1 ms — under 1% of a 60 fps frame
 *  budget. Those numbers are the reason §4.1 chose render-time matching over
 *  precomputed spans, so a regression that quietly makes them false invalidates
 *  the decision rather than merely slowing something down.
 *
 *  What this has to catch is a *class* change — a trie that stops sharing
 *  prefixes, a walk that backtracks per phrase, or a fallback to regex
 *  alternation — each of which costs an order of magnitude, not 30%. So it
 *  counts the work rather than timing it (the automaton's `edges` and the
 *  `transitions` its walk takes): a count does not move when the machine is
 *  busy, where a stopwatch fails on a loaded box and teaches everyone to
 *  ignore it. (A rebuild per paragraph cannot happen: `matchSection` takes a
 *  built automaton and never sees the dictionary.)
 */

import {
  matchSection,
  PhraseAutomaton,
  PhraseDictionary,
  PhraseDictionaryEntry,
  normalizeAlias,
  normalizeScan,
  topicSlug,
} from '@bible/core/wiki';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

/** The transitions a walk over every text takes. */
const transitions = (automaton: PhraseAutomaton, texts: readonly string[]) =>
  texts.reduce((n, text) => n + automaton.transitions(normalizeScan(text)), 0);

/** A dictionary the size §4.1 calls the realistic v1 ceiling and then some:
 *  1,000 phrases against a realistic 250-400, so the assertion holds with
 *  headroom for the catalog long tail growing into the dictionary later.
 *
 *  The aliases are synthetic multi-word phrases rather than the real topic list
 *  because what the automaton's cost depends on is the node count and the
 *  fan-out, not which words they spell — and a synthetic set keeps the test
 *  independent of whatever content happens to be authored. */
const WORDS = [
  'sanctuary',
  'judgment',
  'covenant',
  'atonement',
  'prophecy',
  'remnant',
  'kingdom',
  'temple',
  'witness',
  'testimony',
];

/** The alias at a given index. One definition, so the paragraph below quotes
 *  phrases the dictionary really carries instead of near-misses that would
 *  leave the match loop measuring an empty walk. */
const phrase = (index: number): string =>
  `${WORDS[index % WORDS.length] ?? 'sanctuary'} of the ${String(index)}`;

const dictionary = (count: number): PhraseDictionary =>
  PhraseDictionary.make({
    entries: Array.from({ length: count }, (_, index) =>
      PhraseDictionaryEntry.make({
        alias: normalizeAlias(phrase(index)),
        display: phrase(index),
        slug: topicSlug(`topic-${String(index)}`),
        canonical: false,
      }),
    ),
    unavailable: Option.none(),
  });

/** A screenful, at the shape §4.1 measured: 30 EGW-length paragraphs. Six
 *  distinct dictionary phrases each, so the match loop does real work. */
const PARAGRAPH =
  `The ${phrase(3)} stood in the wilderness, and the ${phrase(7)} was set. ` +
  `And the ${phrase(11)} was confirmed, while the ${phrase(19)} remained sealed ` +
  `until the time of the end, when the ${phrase(23)} should understand the vision and ` +
  `the ${phrase(29)} should be borne to every nation, kindred, tongue, and people.`;

const SCREENFUL: readonly string[] = Array.from({ length: 30 }, () => PARAGRAPH);

/** The screenful's length in characters: what one pass of the walk steps over. */
const SCREENFUL_CHARS = SCREENFUL.reduce((n, text) => n + text.length, 0);

describe('phrase matcher performance (§4.1)', () => {
  it.live('builds the automaton over 1,000 phrases, one trie edge per new character', () =>
    Effect.gen(function* () {
      const entries = dictionary(1000);
      const automaton = PhraseAutomaton.make(entries);
      const aliasChars = entries.entries.reduce((n, entry) => n + entry.alias.length, 0);
      yield* Effect.logInfo(
        `perf.phraseAutomaton.build edges=${automaton.edges} aliasChars=${aliasChars}`,
      );

      // A trie shares prefixes: never more edges than the aliases have
      // characters (2,047 against 18,690 measured).
      expect(automaton.edges).toBeLessThanOrEqual(aliasChars);
      // The automaton is real, not an empty trie.
      expect(matchSection(automaton, [PARAGRAPH])[0]?.length).toBeGreaterThan(0);
    }),
  );

  it.live('matches a 30-paragraph screenful in about one transition per character', () =>
    Effect.gen(function* () {
      const automaton = PhraseAutomaton.make(dictionary(1000));
      const spans = matchSection(automaton, SCREENFUL);
      const steps = transitions(automaton, SCREENFUL);
      yield* Effect.logInfo(
        `perf.phraseMatcher.screenful steps=${steps} chars=${SCREENFUL_CHARS} runs=${String(spans.length)}`,
      );

      // Aho-Corasick steps each character once, plus a failure link now and
      // then: a walk that backtracks per phrase costs a multiple.
      expect(steps).toBeGreaterThanOrEqual(SCREENFUL_CHARS);
      expect(steps).toBeLessThan(2 * SCREENFUL_CHARS);
      expect(spans.length).toBe(30);
      // §4.5 across the section: the six distinct phrases are hot in the first
      // paragraph and cold in the other twenty-nine.
      expect(spans[0]?.length).toBe(6);
      expect(spans.slice(1).every((run) => run.length === 0)).toBe(true);
    }),
  );

  it.live('stays flat as the dictionary grows', () =>
    Effect.gen(function* () {
      // §4.1's load-bearing property: Aho-Corasick is flat in dictionary size
      // where regex alternation degrades superlinearly (13 µs → 603 µs from
      // 100 to 2,000 phrases). The walk over the same text takes as many
      // transitions against a dictionary twenty times the size.
      const smallSteps = transitions(PhraseAutomaton.make(dictionary(100)), SCREENFUL);
      const largeSteps = transitions(PhraseAutomaton.make(dictionary(2000)), SCREENFUL);
      yield* Effect.logInfo(
        `perf.phraseMatcher.scaling smallSteps=${smallSteps} largeSteps=${largeSteps}`,
      );

      expect(largeSteps).toBeLessThanOrEqual(smallSteps * 1.25);
    }),
  );
});
