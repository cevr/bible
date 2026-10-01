// A short's captions: the take's words set two to four at a time, each phrase
// on screen from its first word until the next phrase (or a moment after its
// last word), so the eye reads what the ear hears. Words inside a quotation
// (the script's “…”, which the take's words carry) are flagged, for the page
// to light them as they are read. The page draws these phrases and the
// renderer writes them as the sidecar, so the two cannot disagree. Pure.

import { Array as Arr, Option } from 'effect';
import type { CaptionCue } from './captions.ts';
import type { Placed } from './layout.ts';
import { CLAUSE, SENTENCE } from './narration.ts';
import type { HeardWord, Word } from './schema.ts';
import type { ResolvedShort } from './shorts.ts';
import { heard } from './voiced.ts';

/** The most words a phrase holds. */
const PHRASE_MAX = 4;
/** A phrase holds this long after its last word, unless the next comes first. */
export const PHRASE_HOLD = 0.6;

/** A word as a short's caption sets it: its time on the short's clock, and whether it is quoted. */
interface PhraseWord extends Word {
  readonly quoted: boolean;
}

/** Two to four words shown together, from `start` until `end`. */
export interface Phrase {
  readonly start: number;
  readonly end: number;
  readonly words: ReadonlyArray<PhraseWord>;
}

/** A lone word joins a neighbour only across a pause in the voice of at most this, in seconds. */
export const PHRASE_GAP = 0.3;

/** Whether each word sits inside a quotation: from the word that opens “ to the one that closes ”. */
export const quotedWords = (words: ReadonlyArray<Word>): ReadonlyArray<boolean> => {
  let inside = false;
  return words.map((w) => {
    if (w.text.includes('“')) inside = true;
    const quoted = inside;
    if (w.text.includes('”')) inside = false;
    return quoted;
  });
};

/** Consecutive indices `[from, to)`. */
const run = (from: number, to: number) => Arr.makeBy(to - from, (i) => from + i);

/** `items` cut before each item `cut` names, keeping order; no empty group. */
const cutBefore = <A>(items: ReadonlyArray<A>, cut: (a: A, i: number) => boolean) =>
  items.reduce<Array<Array<A>>>((groups, a, i) => {
    Option.match(
      Option.filter(Arr.last(groups), () => !cut(a, i)),
      {
        onNone: () => groups.push([a]),
        onSome: (last) => last.push(a),
      },
    );
    return groups;
  }, []);

/** `n` indices in `ceil(n / PHRASE_MAX)` runs, as even as can be (5 → 3 + 2, 10 → 4 + 3 + 3). */
const balanced = (indices: ReadonlyArray<number>): Array<ReadonlyArray<number>> => {
  const k = Math.ceil(indices.length / PHRASE_MAX);
  const base = Math.floor(indices.length / k);
  const extra = indices.length % k;
  return Arr.makeBy(k, (j) => {
    const from = j * base + Math.min(j, extra);
    return indices.slice(from, from + base + Number(j < extra));
  });
};

/**
 * One-word groups joined to a neighbour: to the next group when `joins(it,
 * next)`, else to the group before when `joins(before, it)`, else left alone.
 */
const joinLone = (
  groups: ReadonlyArray<ReadonlyArray<number>>,
  joins: (first: ReadonlyArray<number>, then: ReadonlyArray<number>) => boolean,
): Array<ReadonlyArray<number>> => {
  const out: Array<ReadonlyArray<number>> = [];
  let carry: ReadonlyArray<number> = [];
  groups.forEach((g, i) => {
    const group = [...carry, ...g];
    carry = [];
    const lone = group.length === 1;
    const forward = Option.filter(Arr.get(groups, i + 1), (next) => joins(group, next));
    const back = Option.filter(Arr.last(out), (before) => joins(before, group));
    if (lone && Option.isSome(forward)) carry = group;
    else if (lone && Option.isSome(back)) out[out.length - 1] = [...back.value, ...group];
    else out.push(group);
  });
  return out;
};

/**
 * The phrases of a take's `words`, each two to four words: broken at every
 * sentence and at each voice's turn (`turns`, word indices), then at clauses,
 * each clause cut evenly. No phrase crosses a sentence end, so a one-word
 * sentence ("Justified?") stands as its own phrase; a one-word clause joins
 * the next clause of its sentence (or the one before), unless the voice
 * pauses over `PHRASE_GAP` between them. Each phrase shows from its first
 * word until the next phrase's, or `PHRASE_HOLD` after its last word when
 * that comes first.
 */
export const phrasesOf = (
  words: ReadonlyArray<Word>,
  turns: ReadonlySet<number> = new Set(),
  quoted: ReadonlyArray<boolean> = quotedWords(words),
): ReadonlyArray<Phrase> => {
  /** Whether word `i` closes on `pattern`. */
  const closes = (pattern: RegExp) => (i: number) =>
    Option.exists(Arr.get(words, i), (w) => pattern.test(w.text));
  const ends = closes(SENTENCE);
  const pauses = closes(CLAUSE);
  /** Whether the voice runs on from `first` into `then`: no pause over `PHRASE_GAP` between them. */
  const runsOn = (first: ReadonlyArray<number>, then: ReadonlyArray<number>) =>
    Option.exists(
      Option.all([
        Option.flatMap(Arr.last(first), (i) => Arr.get(words, i)),
        Option.flatMap(Arr.head(then), (i) => Arr.get(words, i)),
      ]),
      ([last, next]) => next.start - last.end <= PHRASE_GAP + 1e-9,
    );
  const sentences = cutBefore(run(0, words.length), (i) => turns.has(i) || ends(i - 1));
  const chunks = sentences.flatMap((sentence) =>
    joinLone(
      cutBefore(sentence, (i, at) => at > 0 && pauses(i - 1)),
      runsOn,
    ).flatMap(balanced),
  );
  const phrased = chunks.flatMap((chunk) =>
    Option.toArray(
      Option.map(Arr.head(chunk), (first) => ({
        first,
        words: chunk.flatMap((i) =>
          Option.toArray(
            Option.map(Arr.get(words, i), (w) => ({ ...w, quoted: quoted[i] === true })),
          ),
        ),
      })),
    ),
  );
  return phrased.flatMap((p, i) =>
    Option.toArray(
      Option.map(Option.all([Arr.head(p.words), Arr.last(p.words)]), ([first, last]) => {
        const held = last.end + PHRASE_HOLD;
        const next = Option.flatMap(Arr.get(phrased, i + 1), (q) => Arr.head(q.words));
        const end = Option.match(next, {
          onNone: () => held,
          onSome: (n) => Math.min(n.start, held),
        });
        return { start: first.start, end, words: p.words };
      }),
    ),
  );
};

/**
 * One span's phrases, from its scene's words timed by the voice: only heard
 * seconds reach here (a word shows when it is heard, not when the aligner
 * starts it, with the pause before it), so an aligned take is a type error.
 */
const spanPhrases = (
  words: ReadonlyArray<HeardWord>,
  p: Placed,
  span: ResolvedShort['spans'][number],
  fps: number,
): ReadonlyArray<Phrase> => {
  const quoted = quotedWords(words);
  const offset = p.start + p.speechStart;
  // A span's ends sit on frames, within half a frame of the words they name.
  const slack = 0.5 / fps + 1e-6;
  const inside = run(0, words.length).filter((i) =>
    Option.exists(Arr.get(words, i), (w) => {
      const at = offset + w.start;
      return at >= span.from - slack && at < span.to - slack;
    }),
  );
  const shift = span.at - span.from + offset;
  const turnAt = new Set(p.voice.turns.map((t) => t.word));
  const local = inside.flatMap((i) =>
    Option.toArray(
      Option.map(Arr.get(words, i), (w) => ({
        text: w.text,
        start: w.start + shift,
        end: w.end + shift,
      })),
    ),
  );
  const turns = new Set(
    inside.flatMap((i, j) => Option.toArray(Option.liftPredicate(j, () => turnAt.has(i)))),
  );
  const spanEnd = span.at + (span.to - span.from);
  return phrasesOf(
    local,
    turns,
    inside.map((i) => quoted[i] === true),
  ).map((phrase) => ({
    ...phrase,
    // Shown from the frame nearest its first word, so a span cut on
    // that word's mark shows it on its first frame; ends move with
    // starts, so no phrase overlaps the next.
    start: Math.max(phrase.start - slack, span.at),
    end: Math.min(phrase.end - slack, spanEnd),
  }));
};

/**
 * A short's phrases on its clock, timed by the voice (`heard`): each span's
 * words (those first heard inside it), phrased apart so no phrase crosses a
 * join, each ended by its span's end. A word keeps the quotation its scene's
 * take gives it, even when the span opens inside the quotation.
 */
export const shortPhrases = (
  placed: ReadonlyArray<Placed>,
  short: ResolvedShort,
): ReadonlyArray<Phrase> =>
  short.spans.flatMap((span) =>
    Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === span.scene),
      {
        onNone: () => [],
        onSome: (p) => spanPhrases(heard(p.voice.words), p, span, short.fps),
      },
    ),
  );

/** The phrases as caption cues, for the sidecar: what the page shows, as it shows it. */
export const phraseCues = (phrases: ReadonlyArray<Phrase>): Array<CaptionCue> =>
  phrases.map((p) => ({ start: p.start, end: p.end, text: p.words.map((w) => w.text).join(' ') }));
