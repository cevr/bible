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
 *  The thresholds here are deliberately loose multiples of the measured values.
 *  A perf test that fails on a busy laptop teaches everyone to ignore it; what
 *  this one has to catch is a *class* change — an accidental per-character
 *  normalization pass, an automaton rebuilt per paragraph, or a fallback to
 *  regex alternation — each of which costs an order of magnitude, not 30%.
 */

import {
  matchSection,
  PhraseAutomaton,
  PhraseDictionary,
  PhraseDictionaryEntry,
  normalizeAlias,
  topicSlug,
} from '@bible/core/wiki';
import { Clock, Duration, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

const timed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeNanos;
    const value = yield* effect;
    const end = yield* Clock.currentTimeNanos;
    return [value, Duration.toMillis(Duration.nanos(end - start))] as const;
  });

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

/** Repetitions per measurement. A single screenful is sub-millisecond, and
 *  `Clock.currentTimeNanos` on this host quantizes to about that — so one pass
 *  measures 0.00 ms and the assertion becomes vacuous. Timing a hundred passes
 *  and dividing gives a number with signal in it. */
const REPEATS = 100;

describe('phrase matcher performance (§4.1)', () => {
  it.live('builds the automaton over 1,000 phrases in well under 20 ms', () =>
    Effect.gen(function* () {
      const entries = dictionary(1000);
      const [automaton, elapsed] = yield* timed(Effect.sync(() => PhraseAutomaton.make(entries)));
      yield* Effect.logInfo(`perf.phraseAutomaton.build elapsedMs=${elapsed.toFixed(2)}`);

      // Construct-once is the contract (§4.2); the measured build is ~1 ms and
      // the bound is a class check, not a stopwatch.
      expect(elapsed).toBeLessThan(20);
      // The automaton is real, not an empty trie the timer flew through.
      expect(matchSection(automaton, [PARAGRAPH])[0]?.length).toBeGreaterThan(0);
    }),
  );

  it.live('matches a 30-paragraph screenful in well under 5 ms', () =>
    Effect.gen(function* () {
      const automaton = PhraseAutomaton.make(dictionary(1000));
      const [spans, total] = yield* timed(
        Effect.sync(() => {
          let last = matchSection(automaton, SCREENFUL);
          for (let pass = 1; pass < REPEATS; pass += 1) {
            last = matchSection(automaton, SCREENFUL);
          }
          return last;
        }),
      );
      const elapsed = total / REPEATS;
      yield* Effect.logInfo(
        `perf.phraseMatcher.screenful elapsedMs=${elapsed.toFixed(3)} runs=${String(spans.length)}`,
      );

      // 0.38 ms measured on an M4 Pro; 5 ms catches the order-of-magnitude
      // regressions this test exists for without flaking on a loaded machine.
      expect(elapsed).toBeLessThan(5);
      expect(spans.length).toBe(30);
      // §4.5 across the section: the six distinct phrases are hot in the first
      // paragraph and cold in the other twenty-nine — which is also why the
      // later paragraphs cost the match loop and not the span allocator.
      expect(spans[0]?.length).toBe(6);
      expect(spans.slice(1).every((run) => run.length === 0)).toBe(true);
    }),
  );

  it.live('stays flat as the dictionary grows', () =>
    Effect.gen(function* () {
      // §4.1's load-bearing property: Aho-Corasick is flat in dictionary size
      // (11.9 µs at 100 phrases, 16.3 µs at 2,000) where regex alternation
      // degrades superlinearly (13 µs → 603 µs). A rewrite that reintroduced
      // alternation would pass the absolute bound above on a fast machine and
      // fail here.
      const small = PhraseAutomaton.make(dictionary(100));
      const large = PhraseAutomaton.make(dictionary(2000));

      const measure = (automaton: PhraseAutomaton) =>
        timed(
          Effect.sync(() => {
            for (let pass = 0; pass < REPEATS; pass += 1) matchSection(automaton, SCREENFUL);
          }),
        );

      const [, smallMs] = yield* measure(small);
      const [, largeMs] = yield* measure(large);
      yield* Effect.logInfo(
        `perf.phraseMatcher.scaling smallMs=${(smallMs / REPEATS).toFixed(3)} ` +
          `largeMs=${(largeMs / REPEATS).toFixed(3)}`,
      );

      // A 20x dictionary must not cost 20x. The generous factor absorbs timer
      // noise; alternation's measured 46x would not fit inside it.
      expect(largeMs).toBeLessThan(smallMs * 8);
    }),
  );
});
