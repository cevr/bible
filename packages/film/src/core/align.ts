// A person's take is timed by what speech-to-text heard in it: the words it
// heard carry the times, the script's words carry the text. The two are lined
// up word by word (an edit-distance alignment), so a misheard word keeps its
// place and a word nobody heard shares the gap its neighbours leave. The same
// line-up places each beat inside one recording of the whole script.
//
// Pure: runs in the tools and the tests alike.

import { Array as Arr, Option, Result } from 'effect';
import { BeatUnplaced } from './errors.ts';
import { normalizeWords } from './narration.ts';
import type { Word } from './schema.ts';

/** Word-level edit distance, as a share of the script's words. */
export const wordError = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): number => {
  let previous: ReadonlyArray<number> = Arr.makeBy(got.length + 1, (j) => j);
  for (const [i, w] of want.entries()) {
    const row: Array<number> = [i + 1];
    for (const [j, g] of got.entries()) {
      const substitute = Arr.getUnsafe(previous, j) + Number(w !== g);
      row.push(Math.min(Arr.getUnsafe(previous, j + 1) + 1, Arr.getUnsafe(row, j) + 1, substitute));
    }
    previous = row;
  }
  return Arr.getUnsafe(previous, got.length) / Math.max(1, want.length);
};

/** A normalized word and the index of the word it came from. */
interface Token {
  readonly text: string;
  readonly owner: number;
}

const tokensOf = (words: ReadonlyArray<string>): ReadonlyArray<Token> =>
  words.flatMap((word, owner) => normalizeWords(word).map((text) => ({ text, owner })));

/** Where a token of the script landed among the tokens heard. */
interface Paired {
  readonly got: number;
  /** Heard as written, not misheard. */
  readonly exact: boolean;
}

/** The edit-distance table between two token lists, row by row. */
const costs = (want: ReadonlyArray<string>, got: ReadonlyArray<string>) => {
  const rows: Array<ReadonlyArray<number>> = [Arr.makeBy(got.length + 1, (j) => j)];
  for (const [i, w] of want.entries()) {
    const above = Arr.getUnsafe(rows, i);
    const row: Array<number> = [i + 1];
    for (const [j, g] of got.entries())
      row.push(
        Math.min(
          Arr.getUnsafe(above, j + 1) + 1,
          Arr.getUnsafe(row, j) + 1,
          Arr.getUnsafe(above, j) + Number(w !== g),
        ),
      );
    rows.push(row);
  }
  return rows;
};

/**
 * Each script token's partner among the heard tokens, if any: the pairs of
 * one least-cost alignment. Where two alignments cost the same, a script
 * token is left unpaired first, so the heard words pair with the earliest
 * script words that fit them.
 */
export const lineUp = (
  want: ReadonlyArray<string>,
  got: ReadonlyArray<string>,
): ReadonlyArray<Option.Option<Paired>> => {
  const rows = costs(want, got);
  const cost = (i: number, j: number) => Arr.getUnsafe(Arr.getUnsafe(rows, i), j);
  const out: Array<Option.Option<Paired>> = Arr.makeBy(want.length, () => Option.none());
  let i = want.length;
  let j = got.length;
  while (i > 0 && j > 0) {
    const here = cost(i, j);
    const exact = Arr.getUnsafe(want, i - 1) === Arr.getUnsafe(got, j - 1);
    if (here === cost(i - 1, j) + 1) i -= 1;
    else if (here === cost(i - 1, j - 1) + Number(!exact)) {
      out[i - 1] = Option.some({ got: j - 1, exact });
      i -= 1;
      j -= 1;
    } else j -= 1;
  }
  return out;
};

interface Span {
  readonly start: number;
  readonly end: number;
}

/** The span of `b` widened to cover `a`, when there is one. */
const widen = (a: Option.Option<Span>, b: Span): Span =>
  Option.match(a, {
    onNone: () => b,
    onSome: (s) => ({ start: Math.min(s.start, b.start), end: Math.max(s.end, b.end) }),
  });

/** Runs of unheard words share the gap between the words either side of them. */
const fillGaps = (heard: ReadonlyArray<Option.Option<Span>>, duration: number): Array<Span> => {
  const out: Array<Span> = [];
  let i = 0;
  while (i < heard.length) {
    const found = Arr.getUnsafe(heard, i);
    if (Option.isSome(found)) {
      out.push(found.value);
      i += 1;
      continue;
    }
    const next = Arr.findFirstIndex(heard, (s, k) => k > i && Option.isSome(s));
    const to = Option.getOrElse(next, () => heard.length);
    const from = Option.getOrElse(
      Option.map(Arr.last(out), (s) => s.end),
      () => 0,
    );
    const until = Option.getOrElse(
      Option.flatMap(next, (k) => Option.map(Arr.getUnsafe(heard, k), (s) => s.start)),
      () => duration,
    );
    const gap = Math.max(0, until - from);
    const n = to - i;
    for (let r = 0; r < n; r++)
      out.push({ start: from + (gap * r) / n, end: from + (gap * (r + 1)) / n });
    i = to;
  }
  return out;
};

/** Starts never go back, a word never ends before it starts, and nothing ends past the take. */
const ordered = (spans: ReadonlyArray<Span>, duration: number): ReadonlyArray<Span> => {
  let floor = 0;
  return spans.map((s) => {
    const end = Math.min(duration, Math.max(s.end, s.start, floor));
    const start = Math.min(Math.max(s.start, floor), end);
    floor = start;
    return { start, end };
  });
};

/**
 * The words of `spoken`, timed by the words `heard` in a take `duration`
 * seconds long: each script word spans the heard words its own words line up
 * with (a misheard word too), and a word nobody heard shares the gap between
 * its neighbours. Words keep the script's text, punctuation and all.
 */
export const timeScript = (
  spoken: string,
  heard: ReadonlyArray<Word>,
  duration: number,
): Array<Word> => {
  const words = spoken.split(/\s+/).filter((w) => w.length > 0);
  const want = tokensOf(words);
  const got = tokensOf(heard.map((h) => h.text));
  const pairs = lineUp(
    want.map((t) => t.text),
    got.map((t) => t.text),
  );
  const spans: Array<Option.Option<Span>> = words.map(() => Option.none());
  for (const [k, pair] of pairs.entries()) {
    if (Option.isNone(pair)) continue;
    const owner = Arr.getUnsafe(want, k).owner;
    const at = Arr.getUnsafe(heard, Arr.getUnsafe(got, pair.value.got).owner);
    spans[owner] = Option.some(widen(Arr.getUnsafe(spans, owner), at));
  }
  const timed = ordered(fillGaps(spans, duration), duration);
  return words.map((text, i) => ({ text, ...Arr.getUnsafe(timed, i) }));
};

/** A beat's spoken words. */
export interface BeatText {
  readonly id: string;
  readonly text: string;
}

/** Where a beat was read in one recording of the whole script. */
export interface BeatSpan {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}

/** A beat is found when at least this share of its words were heard as written. */
export const MIN_HEARD = 0.5;

/**
 * Each beat's span in one recording of the whole script, read in order:
 * from the first to the last heard word its words line up with. A beat with
 * less than `MIN_HEARD` of its words heard fails, naming it.
 */
export const placeBeats = (
  beats: ReadonlyArray<BeatText>,
  heard: ReadonlyArray<Word>,
): Result.Result<ReadonlyArray<BeatSpan>, BeatUnplaced> => {
  const want = beats.flatMap((beat, owner) =>
    normalizeWords(beat.text).map((text) => ({ text, owner })),
  );
  const got = tokensOf(heard.map((h) => h.text));
  const pairs = lineUp(
    want.map((t) => t.text),
    got.map((t) => t.text),
  );
  return Result.all(
    beats.map((beat, owner) => {
      const mine = pairs.filter((_, k) => Arr.getUnsafe(want, k).owner === owner);
      const found = Arr.getSomes(mine);
      const exact = found.filter((p) => p.exact).length / Math.max(1, mine.length);
      const first = Arr.head(found);
      const last = Arr.last(found);
      if (exact < MIN_HEARD || Option.isNone(first) || Option.isNone(last))
        return Result.fail(BeatUnplaced.make({ beat: beat.id, heard: exact }));
      const at = (p: Paired) => Arr.getUnsafe(heard, Arr.getUnsafe(got, p.got).owner);
      return Result.succeed({ id: beat.id, start: at(first.value).start, end: at(last.value).end });
    }),
  );
};

/** A stretch of a recording, in seconds. */
export interface Cut {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

/**
 * Where to cut a recording `duration` seconds long into its beats: halfway
 * through the silence between one beat's last word and the next beat's
 * first, the first beat from the start and the last to the end.
 */
export const cutsBetween = (spans: ReadonlyArray<BeatSpan>, duration: number): ReadonlyArray<Cut> =>
  spans.map((span, i) => {
    const before = Arr.get(spans, i - 1).pipe(Option.filter(() => i > 0));
    const after = Arr.get(spans, i + 1);
    return {
      id: span.id,
      from: Option.getOrElse(
        Option.map(before, (b) => (b.end + span.start) / 2),
        () => 0,
      ),
      to: Option.getOrElse(
        Option.map(after, (a) => (span.end + a.start) / 2),
        () => duration,
      ),
    };
  });
