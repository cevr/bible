// Narration drives the clock. A scene's length is its spoken line plus
// breathing room, and animation cues are named marks inside the text:
//
//   "God's word {speak}speaks, and what it says {is}is."
//
// `{speak}` resolves to the moment the next word is spoken — measured from the
// recorded voice when timings exist, estimated from the text when they don't.
// A film read by a cast hands a line to another voice the same way:
//
//   "That's the law. {@ask}So where does that leave us? {@lead}Stuck."
//
// And how a line is said is marked in it too (`delivery.ts`): a stressed
// word, a breath, a hold.
//
//   "Not by sewing a better garment. {//} By taking God at his {*}word."
//
// Pure: runs in the browser, in scripts, and in tests.

import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  DELIVERY,
  type Mark,
  inOrder,
  isPause,
  markAt,
  markOfToken,
  marksMisfit,
  tokenOf,
} from './delivery.ts';
import {
  AlignmentMismatch,
  DeliveryInvalid,
  DuplicateMark,
  type LineError,
  TurnInvalid,
  UnknownVoice,
} from './errors.ts';
import { fnv1a } from './random.ts';
import {
  type TakeSource,
  type TakeWord,
  type Timings,
  type Voice,
  VoiceKey,
  type VoiceTiming,
  type Word,
  isCast,
} from './schema.ts';
import { heardAtOrAfter, justBefore } from './time.ts';
import { unmeasured } from './voiced.ts';

/** Another voice takes the line: `{@name}` before a word. */
export interface Turn {
  /** The voice's name in the cast. */
  readonly voice: string;
  /** Index of the first word it reads. */
  readonly word: number;
}

export interface Parsed {
  /** Text as spoken, marks, turns and delivery marks removed. */
  readonly spoken: string;
  /** Mark name → index of the word it precedes. */
  readonly marks: ReadonlyMap<string, number>;
  /** Where the line changes voice, in order. */
  readonly turns: ReadonlyArray<Turn>;
  /** How the line is said (`delivery.ts`), in reading order. */
  readonly delivery: ReadonlyArray<Mark>;
}

/** `{name}` is a mark, `{@name}` a turn. */
const TOKEN = /\{(@?)([a-zA-Z0-9_-]+)\}/g;

/**
 * Scene `scene`'s line `text` read: its spoken words, its marks, its turns
 * and its delivery marks. A mark named twice, a turn with no word of its own,
 * a brace that is none of these, or a delivery mark that does not fit the
 * words (`marksMisfit`) fails naming the scene.
 */
export const parse = (scene: string, text: string): Result.Result<Parsed, LineError> => {
  const marks = new Map<string, number>();
  const turns: Turn[] = [];
  const words: string[] = [];
  const delivery: Mark[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const said = deliveryIn(scene, token, words.length);
    if (Result.isFailure(said)) return Result.fail(said.failure);
    delivery.push(...said.success);
    for (const [, at, name] of token.matchAll(TOKEN)) {
      if (name === undefined) continue;
      if (at === '@') {
        if (Arr.last(turns).pipe(Option.exists((t) => t.word === words.length)))
          return Result.fail(
            TurnInvalid.make({
              scene,
              voice: name,
              reason: 'follows another turn before any word',
            }),
          );
        turns.push({ voice: name, word: words.length });
        continue;
      }
      if (marks.has(name)) return Result.fail(DuplicateMark.make({ scene, mark: name }));
      marks.set(name, words.length);
    }
    const word = wordOf(scene, token);
    if (Result.isFailure(word)) return Result.fail(word.failure);
    words.push(...word.success);
  }
  return finished(scene, { spoken: words.join(' '), marks, turns, delivery: inOrder(delivery) });
};

/** The delivery marks token `token` writes at word `at`, or the first that names no mark. */
const deliveryIn = (
  scene: string,
  token: string,
  at: number,
): Result.Result<ReadonlyArray<Mark>, DeliveryInvalid> =>
  Result.all(
    [...token.matchAll(DELIVERY)].map(([raw, sigil = '', arg]) =>
      Result.fromOption(markOfToken(sigil, Option.fromUndefinedOr(arg), at), () =>
        DeliveryInvalid.make({ scene, mark: raw, reason: 'takes no seconds' }),
      ),
    ),
  );

/**
 * The word a token says once its cues, turns and marks are out: none for a
 * token of those alone. A brace left in it is a token no reader knows, and
 * fails: it is never spoken.
 */
const wordOf = (
  scene: string,
  token: string,
): Result.Result<ReadonlyArray<string>, DeliveryInvalid> => {
  const rest = token.replace(TOKEN, '').replace(DELIVERY, '');
  return Option.match(Option.fromNullishOr(/\{[^}]*\}?|\}/.exec(rest)), {
    onNone: () => Result.succeed([rest].filter((word) => word.length > 0)),
    onSome: (stray) =>
      Result.fail(
        DeliveryInvalid.make({ scene, mark: stray[0], reason: 'is no cue, turn or delivery mark' }),
      ),
  });
};

/** A line read whole, checked: its last turn has a word after it, and its marks fit its words. */
const finished = (scene: string, parsed: Parsed): Result.Result<Parsed, LineError> => {
  const words = parsed.spoken.split(' ').filter((w) => w.length > 0).length;
  const last = Arr.last(parsed.turns);
  if (Option.isSome(last) && last.value.word >= words)
    return Result.fail(
      TurnInvalid.make({ scene, voice: last.value.voice, reason: 'has no word after it' }),
    );
  return Option.match(marksMisfit(parsed.delivery, words), {
    onNone: () => Result.succeed(parsed),
    onSome: (misfit) =>
      Result.fail(
        DeliveryInvalid.make({
          scene,
          mark: `${tokenOf(misfit.mark)} at word ${markAt(misfit.mark)}`,
          reason: misfit.reason,
        }),
      ),
  });
};

/** Each chunk of `text` and the whitespace between, as `withDelivery` rewrites it: chunks at even indices. */
const chunksOf = (text: string): ReadonlyArray<string> => text.trim().split(/(\s+)/);

/**
 * Line `text` with its delivery marks set to `marks` (placed on its spoken
 * words by index, as `parse` reads them): every delivery token it had taken
 * out, and each mark written back where it reads, a stress just before its
 * word (`{cue}{*}word`), a pause as a token of its own after the word before
 * its gap (`word, {/} next`). Everything else, its cues and turns, its words
 * and the spaces between them, stays as written, so a line given the marks
 * it has comes back as it was written canonically. The marks are not
 * checked: `parse` the result.
 */
export const withDelivery = (text: string, marks: ReadonlyArray<Mark>): string => {
  const chunks = chunksOf(text).map((chunk) => chunk.replace(DELIVERY, ''));
  // The chunks that say a word, in order (spacing says none, nor a chunk of cues alone).
  const saying = chunks.flatMap((chunk, i) => {
    if (i % 2 === 1 || chunk.replace(TOKEN, '').length === 0) return [];
    return [i];
  });
  const ordered = inOrder(marks);
  const out = chunks.map((chunk, i) =>
    Option.match(
      Arr.findFirstIndex(saying, (c) => c === i),
      {
        onNone: () => chunk,
        onSome: (word) => markedWord(chunk, word, ordered),
      },
    ),
  );
  // A chunk that held only delivery tokens is empty now: the spaces either side of it close into one.
  return out
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

/** The cues and turns a chunk opens with, before its word. */
const LEADING_TOKENS = /^(?:\{@?[a-zA-Z0-9_-]+\})*/;

/** Chunk `chunk`, which says word `word`, with its stress before the word and the pause after it written in. */
const markedWord = (chunk: string, word: number, marks: ReadonlyArray<Mark>): string => {
  const from = Option.getOrElse(
    Option.map(Option.fromNullishOr(LEADING_TOKENS.exec(chunk)), (lead) => lead[0].length),
    () => 0,
  );
  const stress = marks
    .filter((m) => m._tag === 'Stress' && m.word === word)
    .map(tokenOf)
    .join('');
  const pause = marks
    .filter((m) => isPause(m) && m.before === word + 1)
    .map((m) => ` ${tokenOf(m)}`)
    .join('');
  return `${chunk.slice(0, from)}${stress}${chunk.slice(from)}${pause}`;
};

/**
 * What a take says and who says it: the spoken words, with each turn written
 * `{@name}` before its first word. A take is kept under this text's hash, so
 * moving a turn re-records the take; with no turns it is the spoken text.
 */
export const takeScript = (parsed: Pick<Parsed, 'spoken' | 'turns'>): string => {
  const turns = new Map(parsed.turns.map((t) => [t.word, t.voice]));
  if (turns.size === 0) return parsed.spoken;
  return parsed.spoken
    .split(' ')
    .map((word, i) => {
      const voice = turns.get(i);
      return voice === undefined ? word : `{@${voice}}${word}`;
    })
    .join(' ');
};

/** One voice's stretch of a take. */
export const Line = Schema.Struct({
  /** Its voice's name in the cast; empty when one voice reads the film. */
  name: Schema.String,
  voiceId: Schema.String,
  text: Schema.String,
});
export type Line = typeof Line.Type;

/**
 * The lines a take is read in: the whole take for a film with one voice, and
 * for a cast, a line per turn, the first read by the cast's first voice. A
 * turn to a voice the film does not have fails with the voices it does.
 */
export const linesOf = (
  scene: string,
  parsed: Pick<Parsed, 'spoken' | 'turns'>,
  voice: Voice,
): Result.Result<ReadonlyArray<Line>, UnknownVoice> => {
  if (parsed.spoken.length === 0) return Result.succeed([]);
  if (!isCast(voice))
    return Arr.match(parsed.turns, {
      onEmpty: () => Result.succeed([{ name: '', voiceId: voice.voiceId, text: parsed.spoken }]),
      onNonEmpty: ([turn]) =>
        Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known: [] })),
    });
  const known = voice.voices.map((v) => v.name);
  const words = parsed.spoken.split(' ');
  const lines: Array<Line> = [];
  let reader = Arr.headNonEmpty(voice.voices);
  let from = 0;
  const readTo = (to: number) => {
    if (to <= from) return;
    const text = words.slice(from, to).join(' ');
    const before = lines.at(-1);
    // A turn to the voice already reading continues its line.
    if (before !== undefined && before.name === reader.name)
      lines[lines.length - 1] = { ...before, text: `${before.text} ${text}` };
    else lines.push({ name: reader.name, voiceId: reader.voiceId, text });
    from = to;
  };
  for (const turn of parsed.turns) {
    const next = voice.voices.find((v) => v.name === turn.voice);
    if (next === undefined)
      return Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known }));
    readTo(turn.word);
    reader = next;
  }
  readTo(words.length);
  return Result.succeed(lines);
};

/** A text's key for content-addressed assets: its FNV-1a as eight hex digits. */
export const hashText = (s: string): string => fnv1a(s).toString(16).padStart(8, '0');

/** The voice part of `timings.json`: a take recorded under another key is stale. */
export const voiceKey = (voice: Voice): string => {
  const settings = Schema.encodeSync(VoiceKey)(voice.settings);
  if (!isCast(voice)) return `${voice.voiceId}/${voice.model}/${settings}`;
  const voices = voice.voices.map((v) => `${v.name}=${v.voiceId}`).join(',');
  return `${voices}/${voice.model}/${settings}`;
};

/** Why a beat's take no longer fits it: said once, read by the studio and `check`. */
export const TakeStaleReason = Schema.Literals(['missing', 'text changed', 'voice changed']);
export type TakeStaleReason = typeof TakeStaleReason.Type;

/**
 * Where a beat's take stands: current and read by a person (`Recorded`),
 * current and read by the staging voice (`Staging`), or `Stale`. A person's
 * take is read by no voice in the film, so a change of staging voice never
 * stales it; only a change of its words does. `recorded` says whether the
 * stale take was a person's, which staging must not replace unasked.
 */
export type TakeState =
  | { readonly _tag: 'Recorded' }
  | { readonly _tag: 'Staging' }
  | { readonly _tag: 'Stale'; readonly reason: TakeStaleReason; readonly recorded: boolean };

/**
 * A line's delivery marks as a staging take keeps them (`VoiceTiming.delivered`):
 * none for a line with none, so a take of an unmarked line is stored as before.
 */
const deliveryKey = (marks: ReadonlyArray<Mark>): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(inOrder(marks), (m) => m.length > 0),
    (m) => hashText(m.map((mark) => `${markAt(mark)}${tokenOf(mark)}`).join(' ')),
  );

/** A staging take's `delivered`, for a line marked `marks`: absent for a line with none. */
export const deliveredAs = (marks: ReadonlyArray<Mark>): Pick<VoiceTiming, 'delivered'> =>
  Option.match(deliveryKey(marks), {
    onNone: () => ({}),
    onSome: (delivered) => ({ delivered }),
  });

/**
 * The state of the take `timings` keep for beat `id`, whose take script is
 * `script` and whose line is marked `delivery`, under `voice` (`voiceKey`).
 * A staging take read with other marks is stale (`text changed`: the marks
 * are part of the line as written); a person's take is judged by its words.
 */
export const takeState = (
  id: string,
  script: string,
  timings: Timings,
  voice: string,
  delivery: ReadonlyArray<Mark> = [],
): TakeState => {
  const take = timings.scenes[id];
  if (take === undefined) return { _tag: 'Stale', reason: 'missing', recorded: false };
  const recorded = take.source === 'recorded';
  if (!recorded && timings.voice !== voice)
    return { _tag: 'Stale', reason: 'voice changed', recorded };
  if (take.hash !== hashText(script)) return { _tag: 'Stale', reason: 'text changed', recorded };
  if (recorded) return { _tag: 'Recorded' };
  const read = Option.getOrElse(Option.fromUndefinedOr(take.delivered), () => '');
  if (read !== Option.getOrElse(deliveryKey(delivery), () => ''))
    return { _tag: 'Stale', reason: 'text changed', recorded };
  return { _tag: 'Staging' };
};

/**
 * Words with estimated times: ~2.7 words/s, longer words take longer, and
 * punctuation adds a pause. Close enough to lay out a cut before recording.
 */
export const estimate = (spoken: string): Word[] => {
  const out: Word[] = [];
  let t = 0;
  for (const w of spoken.split(/\s+/).filter((x) => x.length > 0)) {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    const dur = 0.16 + letters * 0.045;
    out.push({ text: w, start: t, end: t + dur });
    t += dur + 0.05;
    if (endsSentence(w)) t += 0.45;
    else if (endsClause(w)) t += 0.22;
  }
  return out;
};

/**
 * Words only, as a take is checked against its script (`narrator`'s word
 * error): composed (NFC, so an accent is one letter however it was typed),
 * lower case, apostrophes dropped (`God’s` is `gods`), and every other mark a
 * break (`cover-up` is `cover`, `up`). Letters are any script's, accents kept.
 */
export const normalizeWords = (s: string): ReadonlyArray<string> =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

/**
 * Whether a spoken word reads `word`, both normalised as a take is checked
 * (`normalizeWords`): `“Not,` reads `not`, `God’s` reads `god's`, and
 * `cover-up` reads `cover`, `up` and `cover-up`, a whole part at a time.
 */
export const readsWord = (text: string, word: string): boolean => {
  const said = normalizeWords(text);
  const want = normalizeWords(word);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= said.length; i++)
    if (want.every((w, k) => said[i + k] === w)) return true;
  return false;
};

/** A sentence ends here: on a full stop, a question or an exclamation, before any closing quote or bracket. */
export const SENTENCE = /[.?!][”’"')\]]*$/;
/** A clause ends here: on a comma, a dash, a colon, a semicolon or an ellipsis, before any closing quote or bracket. */
export const CLAUSE = /[,—–;:…][”’"')\]]*$/;

/** Whether a spoken word ends a sentence (`SENTENCE`). */
export const endsSentence = (text: string): boolean => SENTENCE.test(text);
/** Whether a spoken word ends a clause (`CLAUSE`). */
export const endsClause = (text: string): boolean => CLAUSE.test(text);

/**
 * When the first word said at or after `from` (seconds, on the words' clock)
 * that reads `word` starts; none when the line never says it there. A word
 * pin (`{ mark, word }`) lands here.
 */
export const wordAfter = (
  words: ReadonlyArray<Word>,
  from: number,
  word: string,
): Option.Option<number> =>
  Option.map(
    Arr.findFirst(words, (w) => heardAtOrAfter(w, from) && readsWord(w.text, word)),
    (w) => w.start,
  );

/**
 * The words a card sets (`PanelText`'s `Card`) from a line's `words`, each
 * with when it starts on the clock `marks` keep: those heard from mark
 * `card.from` to mark `card.to` (the line's end when none), and the index of
 * the first that reads `card.payoff`; or why none: a mark the line lacks, no
 * word between the marks, or no word that reads the payoff. The engine's card
 * (`canvas/card.ts`) and the studio's timeline set a card by this one rule.
 */
export const cardSaid = <W extends { readonly text: string; readonly start: number }>(
  scene: string,
  words: ReadonlyArray<W>,
  marks: ReadonlyMap<string, number>,
  card: { readonly from: string; readonly to?: string; readonly payoff: string },
): Result.Result<{ readonly said: ReadonlyArray<W>; readonly payoff: number }, string> => {
  const markAt = (name: string) =>
    Result.fromOption(
      Option.fromUndefinedOr(marks.get(name)),
      () => `scene ${scene}: its card starts or ends at {${name}}, which its line does not mark`,
    );
  const to = Option.match(Option.fromUndefinedOr(card.to), {
    onNone: () => Result.succeed(Infinity),
    onSome: markAt,
  });
  return Result.flatMap(markAt(card.from), (from) =>
    Result.flatMap(to, (until) => {
      const said = words.filter((w) => heardAtOrAfter(w, from) && w.start < justBefore(until));
      if (said.length === 0)
        return Result.fail(`scene ${scene}: its card from {${card.from}} sets no words`);
      const payoff = said.findIndex((w) => readsWord(w.text, card.payoff));
      if (payoff < 0)
        return Result.fail(
          `scene ${scene}: its card's payoff "${card.payoff}" is none of its words (${said.map((w) => w.text).join(' ')})`,
        );
      return Result.succeed({ said, payoff });
    }),
  );
};

/**
 * Words as spoken in a recorded take. ElevenLabs aligns characters; group them
 * back into the words of `spoken`. A dialogue joins its lines with nothing
 * between them, so each line's first character (`breaks`) starts a word too.
 */
export const wordsFromAlignment = (
  spoken: string,
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
  breaks: ReadonlyArray<number> = [],
): Result.Result<Word[], AlignmentMismatch> => {
  const out: Word[] = [];
  const lineStarts = new Set(breaks);
  let start = -1;
  let end = 0;
  let text = '';
  const flush = () => {
    if (text.length > 0) out.push({ text, start, end });
    text = '';
    start = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? '';
    if (lineStarts.has(i)) flush();
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (start < 0) start = starts[i] ?? 0;
    end = ends[i] ?? end;
    text += c;
  }
  flush();
  const expected = spoken.split(/\s+/).filter((x) => x.length > 0).length;
  if (out.length !== expected)
    return Result.fail(AlignmentMismatch.make({ spoken, words: out.length, expected }));
  return Result.succeed(out);
};

/**
 * Words held inside a take `duration` seconds long. The alignment runs on the
 * speech model's clock and the take is measured from its encoded file; the
 * two can disagree by a frame or, at the end of a long line, by more. A word
 * past the end ends at it (and starts there at the latest), so the timings
 * always fit the audio they time.
 */
export const heldInside = (words: ReadonlyArray<Word>, duration: number): Word[] =>
  words.map((w) => {
    const start = Math.min(Math.max(0, w.start), duration);
    return { text: w.text, start, end: Math.min(Math.max(start, w.end), duration) };
  });

export interface SceneVoice {
  readonly spoken: string;
  /** Each word's aligned span and where it is heard; an estimate is heard over its span. */
  readonly words: ReadonlyArray<TakeWord>;
  /** Seconds of speech (0 for a silent scene). */
  readonly duration: number;
  readonly marks: ReadonlyMap<string, number>;
  /** Where another voice takes the line. */
  readonly turns: ReadonlyArray<Turn>;
  /** How the line is said (`delivery.ts`), in reading order. */
  readonly delivery: ReadonlyArray<Mark>;
  /** Audio file, when a current recording exists. */
  readonly file: string | undefined;
  readonly recorded: boolean;
  /** Who read the current take (the staging voice or a person); none without one. */
  readonly source: TakeSource | undefined;
}

/**
 * Where a scene's voice stops speaking, in seconds from its start: the end of
 * the last word heard, so silence a take trails is not counted as speech.
 * The take's length when it has no words.
 */
export const lastVoiced = (voice: SceneVoice): number =>
  Math.min(
    voice.duration,
    Option.getOrElse(
      Arr.last(voice.words.map((w) => w.voiced.end).toSorted((a, b) => a - b)),
      () => voice.duration,
    ),
  );

/**
 * The voice for one scene: recorded when the take matches the text,
 * estimated otherwise; a line that does not parse fails naming the scene.
 */
export const voiceFor = (
  id: string,
  text: string,
  timings: Timings | undefined,
): Result.Result<SceneVoice, LineError> =>
  Result.map(parse(id, text), (parsed): SceneVoice => {
    const { spoken, marks, turns, delivery } = parsed;
    if (spoken.length === 0)
      return {
        spoken,
        words: [],
        duration: 0,
        marks: new Map(),
        turns: [],
        delivery: [],
        file: undefined,
        recorded: false,
        source: undefined,
      };
    const take = timings?.scenes[id];
    const recorded = take !== undefined && take.hash === hashText(takeScript(parsed));
    const words = recorded ? take.words : unmeasured(estimate(spoken));
    const duration = recorded ? take.duration : (words[words.length - 1]?.end ?? 0);
    const times = new Map<string, number>();
    for (const [name, index] of marks) {
      const w = words[index] ?? words[words.length - 1];
      times.set(name, index >= words.length ? duration : (w?.start ?? 0));
    }
    return {
      spoken,
      words,
      duration,
      marks: times,
      turns,
      delivery,
      file: recorded ? take.file : undefined,
      recorded,
      source: recorded ? take.source : undefined,
    };
  });
