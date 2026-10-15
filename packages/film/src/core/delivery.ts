// Delivery marks: how a line is said, written inside it as its cues are, so
// a mark moves with its word whatever is edited around it. Like `{cue}` and
// `{@turn}`, a mark is in braces and never spoken: the words a card, a
// caption, a transcript pin or the KJV check reads are the line without them
// (`parse` in `narration.ts` drops every brace).
//
//   "He spoke {*}slowly, {/} and {*}impressively. {//1.2} Faith."
//
// - `{*}word`: stress, the word to land on (usually a sentence's last);
// - `{/}`: a breath, a short pause in the gap it stands in (about 0.3 s);
// - `{//}`: a hold, a timed pause (0.6 s unless it names its seconds,
//   `{//3}` for the held beat before a landing's last word).
//
// A stress belongs to the word after it; a breath or a hold to the gap before
// the word after it, which is never the line's first or last gap (silence
// there is the beat's `lead` and `tail`). A new kind of mark is a case of
// `Mark`, its token (`markOfToken`, `tokenOf`) and its row in `MODEL_MARKS`.
//
// The marks compile to what each ElevenLabs model takes (`compileDelivery`;
// the table, its sources and the date it was checked are in the film skill's
// `reference/elevenlabs-delivery.md`): v4 and v3 take audio tags and capitals,
// the earlier models SSML breaks and a speed. A hold is exact on every model:
// its gap is set to its seconds in the take itself (`holdsIn`), since no
// model times a pause to the tenth. Pure.

import { Array as Arr, Match, Option, Schema } from 'effect';
import { toMs } from './time.ts';

/** A hold's seconds when its mark names none (`{//}`). */
export const HOLD_DEFAULT = 0.6;

/** The seconds a hold may name: the longest pause ElevenLabs' break takes is 3 s. */
const HOLD_SECONDS = { min: 0.4, max: 3, step: 0.1 } as const;

/** A breath's pause, as the reader and the pace read it. */
const BREATH_SECONDS = 0.3;

/** The pace the delivery rules time a line at, in words a minute (CRAFT rule 9). */
const PACE = { min: 150, max: 165, aim: 155 } as const;

/** One delivery mark, placed on the line's spoken words by index. */
export const Mark = Schema.Union([
  /** The word `word` is stressed. */
  Schema.TaggedStruct('Stress', { word: Schema.Int }),
  /** A breath in the gap before word `before`. */
  Schema.TaggedStruct('Breath', { before: Schema.Int }),
  /** A pause of `seconds` in the gap before word `before`. */
  Schema.TaggedStruct('Hold', { before: Schema.Int, seconds: Schema.Finite }),
]);
export type Mark = typeof Mark.Type;

/** The kinds of mark. */
type MarkKind = Mark['_tag'];

/** A pause mark: what stands in a gap. */
type Pause = Extract<Mark, { readonly _tag: 'Breath' | 'Hold' }>;

/** Whether a mark stands in a gap rather than on a word. */
export const isPause = (mark: Mark): mark is Pause => mark._tag !== 'Stress';

/** Where a mark is: the word it is on, or the word whose gap before it holds it. */
export const markAt: (mark: Mark) => number = Match.type<Mark>().pipe(
  Match.tagsExhaustive({
    Stress: (m) => m.word,
    Breath: (m) => m.before,
    Hold: (m) => m.before,
  }),
);

/** A hold's seconds, on the tenth. */
const holdSeconds = (seconds: number): number => Math.round(seconds * 10) / 10;

/** A delivery mark in a line: `{*}`, `{/}`, `{//}`, `{//1.5}`. Never a cue's or a turn's name. */
export const DELIVERY = /\{(\*|\/\/?)(\d+(?:\.\d+)?)?\}/g;

/**
 * The mark token `sigil` with `arg` writes at word `at` of the line (the word
 * after it): none when it names no mark (a stress or a breath given seconds).
 */
export const markOfToken = (
  sigil: string,
  arg: Option.Option<string>,
  at: number,
): Option.Option<Mark> => {
  if (sigil === '//')
    return Option.some({
      _tag: 'Hold',
      before: at,
      seconds: holdSeconds(Option.getOrElse(Option.map(arg, Number), () => HOLD_DEFAULT)),
    });
  if (Option.isSome(arg)) return Option.none();
  if (sigil === '*') return Option.some({ _tag: 'Stress', word: at });
  return Option.some({ _tag: 'Breath', before: at });
};

/** How a hold of `seconds` is written: a hold of the default seconds names none. */
const holdToken = (seconds: number): string => {
  if (holdSeconds(seconds) === HOLD_DEFAULT) return '{//}';
  return `{//${holdSeconds(seconds)}}`;
};

/** The token a mark is written as. */
export const tokenOf: (mark: Mark) => string = Match.type<Mark>().pipe(
  Match.tagsExhaustive({
    Stress: () => '{*}',
    Breath: () => '{/}',
    Hold: (m) => holdToken(m.seconds),
  }),
);

/** A mark that does not fit its line, and why. */
interface Misfit {
  readonly mark: Mark;
  readonly reason: string;
}

/**
 * Why a line's marks do not fit its `words` words, if they do not: a stress
 * on no word, a pause in the line's first or last gap or outside it, two
 * pauses in one gap, a word stressed twice, or a hold outside `HOLD_SECONDS`.
 */
export const marksMisfit = (marks: ReadonlyArray<Mark>, words: number): Option.Option<Misfit> =>
  Arr.findFirst(marks, (mark, i) =>
    Option.map(misfit(mark, marks.slice(0, i), words), (reason) => ({ mark, reason })),
  );

/** Why a stress at word `at` does not fit, after the marks `before` it. */
const stressMisfit = (at: number, before: ReadonlyArray<Mark>, words: number) => {
  if (at < 0 || at >= words) return Option.some('stresses no word');
  if (before.some((m) => m._tag === 'Stress' && m.word === at))
    return Option.some('stresses a word twice');
  return Option.none();
};

/** Why a pause in the gap before word `at` does not fit, after the marks `before` it. */
const pauseMisfit = (pause: Pause, before: ReadonlyArray<Mark>, words: number) => {
  const at = pause.before;
  if (at <= 0 || at >= words)
    return Option.some('pauses outside the line (its lead and tail are the beat’s)');
  if (before.some((m) => isPause(m) && m.before === at))
    return Option.some('is a second pause in one gap');
  if (
    pause._tag === 'Hold' &&
    (pause.seconds < HOLD_SECONDS.min || pause.seconds > HOLD_SECONDS.max)
  )
    return Option.some(
      `holds ${pause.seconds} s, outside ${HOLD_SECONDS.min}–${HOLD_SECONDS.max} s`,
    );
  return Option.none();
};

const misfit = (mark: Mark, before: ReadonlyArray<Mark>, words: number): Option.Option<string> => {
  if (isPause(mark)) return pauseMisfit(mark, before, words);
  return stressMisfit(mark.word, before, words);
};

/** The marks in reading order: by place, a gap's pause before its word's stress. */
export const inOrder = (marks: ReadonlyArray<Mark>): ReadonlyArray<Mark> =>
  marks.toSorted((a, b) => markAt(a) - markAt(b) || Number(isPause(b)) - Number(isPause(a)));

/** A line's pace, in words a minute, over `seconds` of speech. None for a line with no words or no time. */
export const wordsAMinute = (words: number, seconds: number): Option.Option<number> =>
  Option.liftPredicate((words * 60) / seconds, () => words > 0 && seconds > 0);

/** Where a pace stands against `PACE`: under it, in it, or over it. */
export const paceBand = (wpm: number): 'slow' | 'in' | 'fast' => {
  if (wpm < PACE.min) return 'slow';
  if (wpm > PACE.max) return 'fast';
  return 'in';
};

// ---------------------------------------------------------------------------
// Compiled for ElevenLabs

/**
 * How a model is told how to say a line: audio tags and capitals (`tags`:
 * eleven_v4 and eleven_v3), or SSML breaks and a speed (`ssml`: the earlier
 * models, eleven_multilingual_v2 and eleven_flash_v2_5).
 */
type Dialect = 'tags' | 'ssml';

/** The dialect a model id is of: v4 and v3 (and their variants) take tags, every earlier model SSML. */
const dialectOf = (model: string): Dialect => {
  if (model.startsWith('eleven_v3') || model.startsWith('eleven_v4')) return 'tags';
  return 'ssml';
};

/** What a dialect sends for one kind of mark, and whether the model says it as asked. */
interface MarkSent {
  readonly as: string;
  readonly exact: boolean;
  readonly sent: boolean;
}

/**
 * What each dialect is sent for each kind of mark, and whether it says the
 * mark as asked (`exact`) or only near it. A mark a dialect cannot say at all
 * is `sent: false`, and the take reads it as unmarked.
 */
const MODEL_MARKS = {
  tags: {
    Stress: { as: 'the word in CAPITALS', exact: false, sent: true },
    Breath: { as: '[pause] in the gap', exact: false, sent: true },
    Hold: { as: '[pause] in the gap, then the gap set to its seconds', exact: true, sent: true },
  },
  ssml: {
    Stress: { as: 'not sent: these models have no emphasis control', exact: false, sent: false },
    Breath: { as: `<break time="${BREATH_SECONDS}s" /> in the gap`, exact: false, sent: true },
    Hold: {
      as: '<break time="…s" /> in the gap, then the gap set to its seconds',
      exact: true,
      sent: true,
    },
  },
} as const satisfies Readonly<Record<Dialect, Readonly<Record<MarkKind, MarkSent>>>>;

/** The `speed` setting's range where a model takes it (`ssml` models, text-to-speech only). */
const SPEED = { min: 0.7, max: 1.2 } as const;

/** A hold to set in a take: the gap before word `before` made `seconds` long. */
interface HoldGap {
  readonly before: number;
  readonly seconds: number;
}

/** A line compiled for one model: what to send, and what to do to the take after. */
export interface Compiled {
  /** Each spoken word as it is sent, a pause in the gap before it written first: `[pause] WORD.` */
  readonly words: ReadonlyArray<string>;
  /** The holds to set in the take once it is made (`holdsIn`). */
  readonly holds: ReadonlyArray<HoldGap>;
  /** `speed` for the request: none when the model takes none or the voice's own pace is not known. */
  readonly speed: Option.Option<number>;
  /** The marks the model says only near what they ask, or not at all (`MODEL_MARKS`). */
  readonly approximate: ReadonlyArray<Mark>;
}

/** The seconds an SSML break asks for a pause mark. */
const breakSeconds: (pause: Pause) => number = Match.type<Pause>().pipe(
  Match.tagsExhaustive({
    Breath: () => BREATH_SECONDS,
    Hold: (m) => Math.min(m.seconds, HOLD_SECONDS.max),
  }),
);

/** What a dialect writes in the gap before a word for a pause mark. */
const pauseText = (dialect: Dialect, pause: Pause): string => {
  if (dialect === 'tags') return '[pause]';
  return `<break time="${breakSeconds(pause)}s" />`;
};

/**
 * The `speed` that brings a voice whose own pace is `natural` words a minute
 * to `PACE.aim`, inside `SPEED`, for a model that takes one; none for v4 and
 * v3, which take no speed (their pace is the voice's own, shown against
 * `PACE` in the reader).
 */
const speedFor = (model: string, natural: Option.Option<number>): Option.Option<number> =>
  Option.map(
    Option.filter(natural, (wpm) => dialectOf(model) === 'ssml' && wpm > 0),
    (wpm) => Math.round(Math.min(SPEED.max, Math.max(SPEED.min, PACE.aim / wpm)) * 100) / 100,
  );

/** Word `word` at `i` as `dialect` sends it, stressed or not by `marks`. */
const sentWord = (dialect: Dialect, marks: ReadonlyArray<Mark>, word: string, i: number) => {
  const stressed = marks.some((m) => m._tag === 'Stress' && m.word === i);
  const said = Option.getOrElse(
    Option.map(
      Option.liftPredicate(word, () => stressed && MODEL_MARKS[dialect].Stress.sent),
      (w) => w.toUpperCase(),
    ),
    () => word,
  );
  return Option.match(
    Arr.findFirst(marks, (m): m is Pause => isPause(m) && m.before === i),
    {
      onNone: () => said,
      onSome: (pause) => `${pauseText(dialect, pause)} ${said}`,
    },
  );
};

/**
 * A line's spoken `words` with its `marks`, compiled for `model`: each word
 * as it is sent (stressed in capitals on v4 and v3), each pause written in
 * its gap as the model takes one, every hold also kept to be set exactly in
 * the take, and the speed that aims the voice at `PACE.aim` where the model
 * takes one. Pure: the same line, marks, model and pace compile the same.
 */
export const compileDelivery = (
  words: ReadonlyArray<string>,
  marks: ReadonlyArray<Mark>,
  model: string,
  natural: Option.Option<number> = Option.none(),
): Compiled => {
  const dialect = dialectOf(model);
  return {
    words: words.map((word, i) => sentWord(dialect, marks, word, i)),
    holds: marks
      .filter((m): m is Extract<Mark, { readonly _tag: 'Hold' }> => m._tag === 'Hold')
      .map((m) => ({ before: m.before, seconds: m.seconds })),
    speed: speedFor(model, natural),
    approximate: marks.filter((m) => !MODEL_MARKS[dialect][m._tag].exact),
  };
};

/** The text a compiled line sends for its words `from` to `to` (a cast's line), all of it by default. */
export const sentText = (compiled: Compiled, from = 0, to = compiled.words.length): string =>
  compiled.words.slice(from, to).join(' ');

/** An alignment: each character, and when it starts and ends. */
interface Alignment {
  readonly chars: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
  readonly ends: ReadonlyArray<number>;
  /** Where each line starts, by character. */
  readonly breaks: ReadonlyArray<number>;
}

/** Each character's index, but those inside a direction (`[pause]`, `<break … />`), brackets and all. */
const spokenIndices = (chars: ReadonlyArray<string>): ReadonlyArray<number> =>
  chars.reduce<{ readonly kept: ReadonlyArray<number>; readonly closing: Option.Option<string> }>(
    (acc, c, i) =>
      Option.match(acc.closing, {
        onSome: (close) => ({
          kept: acc.kept,
          closing: Option.liftPredicate(close, () => c !== close),
        }),
        onNone: () => {
          if (c === '[') return { kept: acc.kept, closing: Option.some(']') };
          if (c === '<') return { kept: acc.kept, closing: Option.some('>') };
          return { kept: [...acc.kept, i], closing: Option.none() };
        },
      }),
    { kept: [], closing: Option.none() },
  ).kept;

/**
 * An alignment with the directions a compiled line sent (`[pause]`,
 * `<break … />`) taken out, should the reply align them as characters, and
 * each line's first character (`breaks`) moved to where it lands without
 * them. A reply that aligns only what was spoken comes back as it was.
 */
export const spokenAlignment = (
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
  breaks: ReadonlyArray<number> = [],
): Alignment => {
  const kept = spokenIndices(chars);
  const at = <A>(values: ReadonlyArray<A>, empty: A) =>
    kept.map((i) => Option.getOrElse(Arr.get(values, i), () => empty));
  return {
    chars: at(chars, ''),
    starts: at(starts, 0),
    ends: at(ends, 0),
    // A line that starts on a direction starts on the first character kept after it.
    breaks: breaks.flatMap((b) => Option.toArray(Arr.findFirstIndex(kept, (k) => k >= b))),
  };
};

/** One change a hold makes to a take: `by` seconds put in (or, below zero, taken out) at second `at`. */
interface GapEdit {
  readonly at: number;
  readonly by: number;
}

/** A span of a take, in seconds. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** The edit that sets the gap between `before` and `after` to `seconds`, if it is not within a hundredth already. */
const gapEdit = (before: Span, after: Span, seconds: number): ReadonlyArray<GapEdit> => {
  const gap = Math.max(0, after.start - before.end);
  const by = seconds - gap;
  if (Math.abs(by) < 0.01) return [];
  return [{ at: before.end + gap / 2, by }];
};

/**
 * The edits that set each hold's gap to its seconds in a take whose words
 * are `words`: the silence between the word before the gap and the word
 * after it lengthened, or shortened, at its middle, latest first so each
 * edit's second is where the take still has it. A gap within a hundredth of
 * its seconds is left alone; a hold on a gap the words do not have, too.
 */
export const holdsIn = (
  words: ReadonlyArray<Span>,
  holds: ReadonlyArray<HoldGap>,
): ReadonlyArray<GapEdit> =>
  holds
    .flatMap((hold) =>
      Option.getOrElse(
        Option.zipWith(
          Arr.get(words, hold.before - 1),
          Arr.get(words, hold.before),
          (before, after) => gapEdit(before, after, hold.seconds),
        ),
        () => [],
      ),
    )
    .toSorted((a, b) => b.at - a.at);

/** Words moved by gap edits (`holdsIn`): every word after an edit's second moves by its seconds. */
export const shiftedBy = <W extends Span>(
  words: ReadonlyArray<W>,
  edits: ReadonlyArray<GapEdit>,
): ReadonlyArray<W> =>
  words.map((w) => {
    const by = edits.filter((e) => e.at <= w.start).reduce((sum, e) => sum + e.by, 0);
    return { ...w, start: toMs(w.start + by), end: toMs(w.end + by) };
  });
