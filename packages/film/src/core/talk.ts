// A talk: a vertical talking-head short (TV's "piece to camera"), cut on its
// speaker's own words. Its edit is data (`talk.ts`, a literal `satisfies
// Talk`, so the lab rewrites the literal itself): the takes
// it reads (footage names; each pins its transcript by hash in the footage
// library's lock), and its sections, each a run of one take's words, from
// one word to another, with the words struck from it (`cut`, the paper
// edit: Cut and Restore are inverse writes on one array) and its marks. A
// word is named by its index into the take's transcript, which never
// changes: a take and its transcript are kept by hash.
//
// Sections are the scenes. What each plays is derived here, never stored,
// and the page and the tools both derive it with this one function
// (`talkCut`): its kept words; its seams, where it leaves the take and comes
// back to it (a struck word, or a pause longer than `gaps`), each at the
// frame boundary of the silence whose loudness (the transcript's 10 ms
// envelope) is lowest, one instant for picture and sound; the pieces of the
// take it plays, back to back (take seconds to section seconds); and so the
// section's voice (its words retimed onto the section), its line (the kept
// words, with `{mark}` before each marked word) and its `Timed`. A talk has
// no `timings.json`: `layout()` reads the derived timings as it reads a
// film's.
//
// A talk declares its format: "One Question" (45 to 65 s, the speaker on
// screen 40 to 55% of it) or "Episode" (2:15 to 2:50, 20 to 30%). The
// numbers are data (`TALK_FORMATS`): `film talk words` sets a talk's length
// against its format's, as the short checks do; the cut never reads them.
//
// A talk's page (`canvas/talk.ts`) plays at `TALK_FPS`, its words set inside
// every platform's zone (`TALK_LAYOUT`), its captions the kept words as they
// are heard, spelt as the talk fixes them, a quoted word gold (`talkPhrases`).
//
// The takes a talk is cut on come from the footage library by one
// derivation (`talkTakes`): the lock names each take's source and current
// transcript, and the transcript gives its words and loudness. The page
// (over the footage route) and the tools (over the disk) read the same files
// and cut with it, so the picture and the sound play the same pieces.

import { Array as Arr, Option, Order, Result, Schema } from 'effect';
import { PartId } from './address-schema.ts';
import { DuplicateScene } from './errors.ts';
import {
  FOOTAGE_RECIPES,
  type FootageLock,
  type FootageTranscript,
  sourceFile,
  sourceOf,
} from './footage.ts';
import type { Placed } from './layout.ts';
import { hashText } from './narration.ts';
import { type Phrase, phrasesOf } from './phrases.ts';
import { SAFE_ZONES, SHORT_LAYOUT, roomAcross, safeRect } from './shorts.ts';
import {
  Knobs,
  Seconds,
  type TakeWord,
  type Timed,
  Timeline,
  type Timings,
  type VoiceTiming,
} from './schema.ts';
import { frameAtOrAfter, frameAtOrBefore } from './time.ts';
import { heard, voicedAt } from './voiced.ts';

/** The two formats a talk is cut to, by the study's benchmarks. */
const TalkFormat = Schema.Literals(['question', 'episode']);
type TalkFormat = typeof TalkFormat.Type;

/** A span of numbers, both ends included. */
interface Between {
  readonly min: number;
  readonly max: number;
}

/** Each format's timing: how long a talk runs, in seconds, and the share of it the speaker is on screen. */
export const TALK_FORMATS = {
  question: {
    title: 'One Question',
    seconds: { min: 45, max: 65 },
    speaker: { min: 0.4, max: 0.55 },
  },
  episode: { title: 'Episode', seconds: { min: 135, max: 170 }, speaker: { min: 0.2, max: 0.3 } },
} as const satisfies Record<
  TalkFormat,
  { readonly title: string; readonly seconds: Between; readonly speaker: Between }
>;

/** The rate a talk plays at: its mezzanine's, so a seam falls on a frame of both. */
export const TALK_FPS = FOOTAGE_RECIPES.mezzanine.fps;

/** Where every platform's buttons leave a talk's words room (`SAFE_ZONES.platforms`), in 1080 × 1920 px. */
const ROOM = safeRect(SAFE_ZONES.platforms);

/** How far above the room's foot a talk's captions are centred: two lines of caption clear it. */
const CAPTION_LIFT = 120;

/** The room across the hook's rows: a block centred where a short's is, no taller than the room above its centre. */
const HOOK_ACROSS = roomAcross(SAFE_ZONES.platforms, 2 * SHORT_LAYOUT.hook.y - ROOM.top);

/** The room across the captions' rows, down to the room's foot: beside TikTok's buttons. */
const CAPTION_ACROSS = roomAcross(SAFE_ZONES.platforms, ROOM.bottom);

/**
 * Where a talk sets its words, in 1080 × 1920 px, inside every platform's
 * zone: the hook where a short's is (inside the top, above every button
 * column), centred on the frame's middle and no wider than the room either
 * side of it allows; the captions `CAPTION_LIFT` above the room's foot,
 * centred in the room beside the buttons and as wide as it.
 */
export const TALK_LAYOUT = {
  centre: SHORT_LAYOUT.centre,
  hook: {
    y: SHORT_LAYOUT.hook.y,
    width:
      2 * Math.min(SHORT_LAYOUT.centre - HOOK_ACROSS.left, HOOK_ACROSS.right - SHORT_LAYOUT.centre),
  },
  caption: {
    centre: (CAPTION_ACROSS.left + CAPTION_ACROSS.right) / 2,
    y: ROOM.bottom - CAPTION_LIFT,
    width: CAPTION_ACROSS.right - CAPTION_ACROSS.left,
  },
};

/** The longest pause a talk keeps between two words when it names none (seconds). */
const DEFAULT_GAPS = 0.25;

/** A word of a take, by its index into the take's transcript. */
const WordIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** Words struck from a section: from one index to another, both struck. */
const Strike = Schema.Tuple([WordIndex, WordIndex]);
type Strike = typeof Strike.Type;

/** A word as a caption spells it: one word, no space, no `{` or `}` (which mark a cue). */
const CaptionWord = Schema.String.check(
  Schema.isPattern(/^[^\s{}]+$/, { message: 'a fix is one word, with no space and no { or }' }),
);

/** A mark's name, as a line writes it (`{law}`). */
const MarkName = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9_-]+$/, { message: 'a mark is letters, digits, _ and -' }),
);

/** `index` is inside `[from, to]` and struck by none of `cut`. */
const keptAt = (index: number, from: number, to: number, cut: ReadonlyArray<Strike>) =>
  index >= from && index <= to && !cut.some(([a, b]) => index >= a && index <= b);

/** One section of a talk: a run of one take's words, less those struck, and its cues and knobs. */
const TalkSection = Schema.Struct({
  /** Names the scene: its notes, approvals, renders and `#t=` links keep to it through a re-cut. */
  id: PartId,
  /** The take it plays: a key of the talk's `takes`. */
  take: Schema.String,
  /** Its first word and its last, both played. */
  from: WordIndex,
  to: WordIndex,
  /** The words struck from it (a false start, an "um"). */
  cut: Schema.optionalKey(Schema.Array(Strike)),
  /** Named moments, each on a word: the cues of its timeline anchor on them. */
  marks: Schema.optionalKey(Schema.Record(MarkName, WordIndex)),
  /** Its cues, anchored to its marks, as a scene's are. */
  timeline: Schema.optionalKey(Timeline),
  /** Its framing: `frame` (the crop's centre, in source pixels) and `zoom`, as a scene's knobs are. */
  knobs: Schema.optionalKey(Knobs),
}).check(
  Schema.makeFilter((section) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (section.from > section.to)
      issues.push({
        path: ['to'],
        issue: `ends at word ${section.to}, before its first, ${section.from}`,
      });
    for (const [i, [a, b]] of (section.cut ?? []).entries())
      if (a > b || a < section.from || b > section.to)
        issues.push({
          path: ['cut', i],
          issue: `strikes words ${a}–${b}, which are not inside ${section.from}–${section.to}`,
        });
    for (const [name, index] of Object.entries(section.marks ?? {}))
      if (!keptAt(index, section.from, section.to, section.cut ?? []))
        issues.push({
          path: ['marks', name],
          issue: `marks word ${index}, which the section does not play`,
        });
    return issues;
  }),
);
type TalkSection = typeof TalkSection.Type;

/** Words a talk quotes (a verse): played in gold in the captions. */
const TalkQuote = Schema.Struct({ take: Schema.String, from: WordIndex, to: WordIndex });

/** A talk's edit (`talk.ts`). */
export const Talk = Schema.Struct({
  title: Schema.String,
  /** The format it is cut to (`TALK_FORMATS`). */
  format: TalkFormat,
  /** The line the short opens on, over its first seconds. */
  hook: Schema.optionalKey(Schema.String),
  /** Its takes: a key each, for the footage name it plays. */
  takes: Schema.Record(Schema.String, Schema.String),
  /** The longest pause kept between two words, in seconds; a longer one is tightened to it. */
  gaps: Schema.optionalKey(Seconds),
  /** A word's caption spelling where speech-to-text misheard it: take → word index → word. */
  fixes: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, CaptionWord)),
  ),
  /** Words it quotes, gold in the captions. */
  quotes: Schema.optionalKey(Schema.Array(TalkQuote)),
  /** What it says, in order: the outline it was recorded from. */
  outline: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Its sections, played in this order (a hook is often a later line pulled to the front). */
  sections: Schema.NonEmptyArray(TalkSection),
}).check(
  Schema.makeFilter((talk) => {
    const takes = Object.keys(talk.takes);
    const issues: Array<Schema.FilterIssue> = [];
    const unknown = (take: string) => !takes.includes(take);
    for (const [i, section] of talk.sections.entries())
      if (unknown(section.take))
        issues.push({
          path: ['sections', i, 'take'],
          issue: `plays take "${section.take}", which the talk's takes (${takes.join(', ')}) do not name`,
        });
    for (const take of Object.keys(talk.fixes ?? {}))
      if (unknown(take))
        issues.push({
          path: ['fixes', take],
          issue: `fixes take "${take}", which the talk does not name`,
        });
    for (const [i, quote] of (talk.quotes ?? []).entries()) {
      if (unknown(quote.take))
        issues.push({
          path: ['quotes', i, 'take'],
          issue: `quotes take "${quote.take}", which the talk does not name`,
        });
      if (quote.from > quote.to)
        issues.push({
          path: ['quotes', i, 'to'],
          issue: `ends at word ${quote.to}, before its first, ${quote.from}`,
        });
    }
    for (const [key, fixes] of Object.entries(talk.fixes ?? {}))
      for (const index of Object.keys(fixes))
        if (!/^\d+$/.test(index))
          issues.push({ path: ['fixes', key, index], issue: `"${index}" is no word index` });
    return issues;
  }),
);
export type Talk = typeof Talk.Type;

/**
 * What a section is cut from, as the footage library keeps the take
 * (`talkTakes`): the footage source it is (`<name>/<sha12>`: the copies the
 * page decodes, the voice the mix plays), its current transcript's words and
 * loudness every 10 ms, and its picture's size as displayed.
 */
export interface TalkTake {
  readonly source: string;
  readonly words: ReadonlyArray<TakeWord>;
  /** The voice's loudness every `ENVELOPE_STEP` (10 ms), in whole dB. */
  readonly envelope: ReadonlyArray<number>;
  /** Its picture as displayed, in px: what a section's `frame` knob is given in. */
  readonly width: number;
  readonly height: number;
}

/** A take a talk plays that the footage library cannot give it yet. */
class TalkTakeUnready extends Schema.TaggedError<TalkTakeUnready>()('TalkTakeUnready', {
  take: Schema.String,
  footage: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `talk: take "${this.take}" plays footage "${this.footage}", ${this.reason}`;
  }
}

/**
 * The transcript files `talk`'s takes are cut on, as `lock` names them: what
 * a reader fetches before `talkTakes` (a take the lock has not heard names
 * none, and `talkTakes` says so).
 */
export const talkTranscripts = (talk: Talk, lock: FootageLock): ReadonlyArray<string> =>
  Arr.dedupe(
    Object.values(talk.takes).flatMap((name) =>
      Option.toArray(
        Option.flatMap(Option.fromUndefinedOr(lock.footage[name]), (entry) =>
          Option.fromUndefinedOr(entry.transcript),
        ),
      ),
    ),
  );

/**
 * `talk`'s takes, by its keys for them, as the footage library keeps each:
 * its source, its picture's size, and the words and loudness of the
 * transcript the lock names, read from `transcripts` (by file). The one
 * derivation the page and the tools both cut on, so the picture's pieces and
 * the sound's are the same. Pure.
 */
export const talkTakes = (
  talk: Talk,
  lock: FootageLock,
  transcripts: ReadonlyMap<string, FootageTranscript>,
): Result.Result<Readonly<Record<string, TalkTake>>, TalkTakeUnready> =>
  Result.gen(function* () {
    const takes: Record<string, TalkTake> = {};
    for (const [key, name] of Object.entries(talk.takes)) {
      const unready = (reason: string) => () =>
        TalkTakeUnready.make({ take: key, footage: name, reason });
      const entry = yield* Result.fromOption(
        Option.fromUndefinedOr(lock.footage[name]),
        unready('which the footage library does not have (film footage import)'),
      );
      if (entry.kind !== 'take')
        return yield* Result.fail(
          unready('which is a clip: a talk is cut on a take (film footage import --take)')(),
        );
      const file = yield* Result.fromOption(
        Option.fromUndefinedOr(entry.transcript),
        unready(`which has not been heard (film footage make ${name})`),
      );
      const heard = yield* Result.fromOption(
        Option.fromUndefinedOr(transcripts.get(file)),
        unready(`whose transcript ${file} is not here`),
      );
      const source = sourceOf(name, entry.sha256);
      if (heard.source !== source)
        return yield* Result.fail(
          unready(`whose transcript ${file} was heard from ${heard.source}, not ${source}`)(),
        );
      takes[key] = {
        source,
        words: heard.words,
        envelope: heard.envelope,
        width: entry.probe.picture.width,
        height: entry.probe.picture.height,
      };
    }
    return takes;
  });

/** One stretch of a take a section plays: take seconds `from`–`to`, at `at` section seconds. */
export interface Piece {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

/** A section as it plays (`talkCut`). */
export interface CutSection {
  readonly id: string;
  /** The take it plays, as the talk names it. */
  readonly take: string;
  /** The words it plays, by index into the take, in order. */
  readonly kept: ReadonlyArray<number>;
  /** The stretches of the take it plays, back to back from zero. */
  readonly pieces: ReadonlyArray<Piece>;
  /** Where one piece gives way to the next, in section seconds. */
  readonly seams: ReadonlyArray<number>;
  /** Its voice: the kept words retimed onto the section, recorded. */
  readonly voice: VoiceTiming;
  /** The scene the clock reads. */
  readonly timed: Timed;
}

/** A talk as it plays: its sections, the scenes they are, and the timings `layout()` reads. */
export interface TalkCut {
  readonly sections: ReadonlyArray<CutSection>;
  readonly scenes: ReadonlyArray<Timed>;
  readonly timings: Timings;
}

/** A section plays a word its take does not have: its transcript is shorter. */
class TalkWordMissing extends Schema.TaggedError<TalkWordMissing>()('TalkWordMissing', {
  section: Schema.String,
  take: Schema.String,
  index: Schema.Int,
  words: Schema.Int,
}) {
  override get message() {
    return `talk: section "${this.section}" plays word ${this.index} of take "${this.take}", which has ${this.words} words (film talk words)`;
  }
}

/** A section plays a take whose transcript the cut was not given. */
class TalkTakeMissing extends Schema.TaggedError<TalkTakeMissing>()('TalkTakeMissing', {
  section: Schema.String,
  take: Schema.String,
}) {
  override get message() {
    return `talk: section "${this.section}" plays take "${this.take}", which has no transcript here (film footage make)`;
  }
}

/** A section whose every word is struck: it would play nothing. */
class TalkSectionSilent extends Schema.TaggedError<TalkSectionSilent>()('TalkSectionSilent', {
  section: Schema.String,
}) {
  override get message() {
    return `talk: section "${this.section}" strikes every word it has, so it plays nothing (restore a word, or remove the section)`;
  }
}

/** Why a talk does not cut. */
type TalkCutError = TalkWordMissing | TalkTakeMissing | TalkSectionSilent | DuplicateScene;

/** The envelope's step, in seconds (`core/footage.ts`'s). */
const STEP = 0.01;

/** How loud the voice is at the instant `t`: the louder of the 10 ms steps either side of it. */
const levelAt = (envelope: ReadonlyArray<number>, t: number): number => {
  const i = frameAtOrBefore(t, 1 / STEP);
  // Past the voice's end there is no silence to cut in: it reads as loud as can be.
  return Arr.match(Arr.getSomes([Arr.get(envelope, i - 1), Arr.get(envelope, i)]), {
    onEmpty: () => 0,
    onNonEmpty: (either) => Math.max(...either),
  });
};

/** A frame boundary to cut at: how loud it is, and how far from the word it is cut beside. */
interface Candidate {
  readonly b: number;
  readonly level: number;
  readonly off: number;
}

/** Candidates to cut at, quietest first, then nearest. */
const QUIETEST: Order.Order<Candidate> = Order.combine(
  Order.mapInput(Order.Number, (c: Candidate) => c.level),
  Order.mapInput(Order.Number, (c: Candidate) => c.off),
);

/**
 * The frame boundary to cut at inside the silence `[from, to]`: the one
 * whose loudness is lowest, the nearest to `toward` (the kept word's edge)
 * among equals. None when no boundary falls inside it (two words under a
 * frame apart).
 */
const quietestIn = (
  envelope: ReadonlyArray<number>,
  from: number,
  to: number,
  toward: number,
): Option.Option<number> => {
  const first = frameAtOrAfter(from, TALK_FPS);
  const last = frameAtOrBefore(to, TALK_FPS);
  // `Array.from`, not `Arr.makeBy`: that makes at least one, and an empty silence has none.
  const boundaries = Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, k) => (first + k) / TALK_FPS,
  );
  return Arr.head(
    Arr.sort(
      boundaries.map((b) => ({ b, level: levelAt(envelope, b), off: Math.abs(b - toward) })),
      QUIETEST,
    ).map((c) => c.b),
  );
};

/** A word a section plays: its index into the take, and the word. */
interface KeptWord {
  readonly index: number;
  readonly word: TakeWord;
}

/** Where the take's word `i` stops being voiced: 0 before the first. */
const voicedEndOf = (words: ReadonlyArray<TakeWord>, i: number): number =>
  Option.match(Arr.get(words, i), { onNone: () => 0, onSome: (w) => w.voiced.end });

/** Where the take's word `i` starts being voiced: `end` (the voice's) after the last. */
const voicedStartOf = (words: ReadonlyArray<TakeWord>, i: number, end: number): number =>
  Option.match(Arr.get(words, i), { onNone: () => end, onSome: (w) => w.voiced.start });

/** A run of kept words the take plays unbroken, and the piece of the take that plays it. */
interface Run {
  readonly words: Arr.NonEmptyReadonlyArray<KeptWord>;
  readonly piece: Piece;
}

/**
 * The runs of `take` that play `kept`, back to back from zero: a seam at each
 * strike and each pause longer than `gaps`. Each run is played from the
 * quietest frame boundary of the silence before its first word (at most half
 * a gap early) to the quietest of the silence after its last (at most half a
 * gap late), so a seam is on a frame of the take and in its silence. Where
 * two words are under a frame apart and no boundary falls between them, the
 * seam takes the boundary just past the kept word's edge: the kept word
 * plays whole, and under a frame of its struck neighbour is faded out with
 * the piece. A last word voiced to within a frame of the take's end plays
 * whole too: its run ends on the first frame past its voice, under a frame
 * past the take's end, where the voice is silent and the picture holds the
 * take's last frame.
 */
const runsOf = (take: TalkTake, kept: ReadonlyArray<KeptWord>, gaps: number): Array<Run> => {
  const { words, envelope } = take;
  const end = envelope.length * STEP;
  const inBefore = ({ index, word }: KeptWord) =>
    Option.getOrElse(
      quietestIn(
        envelope,
        Math.max(word.voiced.start - gaps / 2, voicedEndOf(words, index - 1)),
        word.voiced.start,
        word.voiced.start,
      ),
      () => frameAtOrBefore(word.voiced.start, TALK_FPS) / TALK_FPS,
    );
  const outAfter = ({ index, word }: KeptWord) =>
    Option.getOrElse(
      quietestIn(
        envelope,
        word.voiced.end,
        Math.min(word.voiced.end + gaps / 2, voicedStartOf(words, index + 1, end)),
        word.voiced.end,
      ),
      () => frameAtOrAfter(word.voiced.end, TALK_FPS) / TALK_FPS,
    );
  const grouped: Array<Arr.NonEmptyArray<KeptWord>> = [];
  for (const next of kept) {
    const run = Arr.last(grouped);
    const joined = Option.exists(Option.map(run, Arr.lastNonEmpty), (ahead) => {
      const struck = next.index > ahead.index + 1;
      const paused = next.word.voiced.start - ahead.word.voiced.end > gaps;
      return !struck && !paused;
    });
    if (joined && Option.isSome(run)) run.value.push(next);
    else grouped.push([next]);
  }
  const runs: Array<Run> = [];
  let at = 0;
  for (const group of grouped) {
    const from = inBefore(Arr.headNonEmpty(group));
    const to = outAfter(Arr.lastNonEmpty(group));
    runs.push({ words: group, piece: { from, to, at } });
    at += to - from;
  }
  return runs;
};

/** Seconds `t` of the take, in section seconds, inside `piece`. */
const onSection = (piece: Piece, t: number) =>
  piece.at + Math.min(piece.to, Math.max(piece.from, t)) - piece.from;

/** Each kept word, retimed onto the section through its run's piece, spelt as the talk fixes it. */
const retimed = (
  runs: ReadonlyArray<Run>,
  spelt: (i: number, text: string) => string,
): Array<TakeWord> =>
  runs.flatMap(({ words, piece }) =>
    words.map(({ index, word }) => {
      const voiced = voicedAt(
        onSection(piece, word.voiced.start),
        onSection(piece, word.voiced.end),
      );
      return {
        text: spelt(index, word.text),
        start: Math.min(voiced.start, onSection(piece, word.start)),
        end: Math.max(voiced.end, onSection(piece, word.end)),
        voiced,
      };
    }),
  );

/** `section`'s kept words of `take`: from its first to its last, less those it strikes. */
const keptOf = (section: TalkSection, take: TalkTake): Array<KeptWord> =>
  Arr.getSomes(
    Arr.makeBy(section.to - section.from + 1, (k) => section.from + k).map((index) =>
      Option.map(
        Option.filter(Arr.get(take.words, index), () =>
          keptAt(index, section.from, section.to, section.cut ?? []),
        ),
        (word) => ({ index, word }),
      ),
    ),
  );

/**
 * How `talk` plays over its takes' transcripts (`takes`, by the talk's own
 * take keys): each section's kept words, pieces, seams, voice and scene, and
 * the timings `layout()` reads. Pure: the page and the tools both call it.
 */
export const talkCut = (
  talk: Talk,
  takes: Readonly<Record<string, TalkTake>>,
): Result.Result<TalkCut, TalkCutError> =>
  Result.gen(function* () {
    const gaps = talk.gaps ?? DEFAULT_GAPS;
    const ids = new Set<string>();
    const sections: Array<CutSection> = [];
    for (const section of talk.sections) {
      if (ids.has(section.id))
        return yield* Result.fail(DuplicateScene.make({ scene: section.id }));
      ids.add(section.id);
      const given = Option.fromUndefinedOr(takes[section.take]);
      if (Option.isNone(given))
        return yield* Result.fail(
          TalkTakeMissing.make({ section: section.id, take: section.take }),
        );
      const take = given.value;
      if (section.to >= take.words.length)
        return yield* Result.fail(
          TalkWordMissing.make({
            section: section.id,
            take: section.take,
            index: section.to,
            words: take.words.length,
          }),
        );
      const kept = keptOf(section, take);
      if (kept.length === 0)
        return yield* Result.fail(TalkSectionSilent.make({ section: section.id }));
      const runs = runsOf(take, kept, gaps);
      const pieces = runs.map((run) => run.piece);
      const fixes = talk.fixes?.[section.take] ?? {};
      const spelt = (i: number, text: string) => fixes[String(i)] ?? text;
      const words = retimed(runs, spelt);
      // Every mark a word carries, in the order the edit names them.
      const marksOn = (i: number) =>
        Object.entries(section.marks ?? {}).flatMap(([name, at]) =>
          Option.toArray(Option.liftPredicate(name, () => at === i)),
        );
      const say = kept
        .map(({ index: i }, k) =>
          [...marksOn(i).map((m) => `{${m}}`), words[k]?.text ?? ''].join(''),
        )
        .join(' ');
      const spoken = words.map((w) => w.text).join(' ');
      const duration = pieces.reduce((sum, p) => sum + (p.to - p.from), 0);
      const voice: VoiceTiming = {
        hash: hashText(spoken),
        // The take's voice, under the folder of copies: the tools play it from there.
        file: sourceFile(take.source, 'voice.flac'),
        duration,
        words,
        source: 'recorded',
      };
      const timed: Timed = {
        id: section.id,
        say,
        lead: 0,
        tail: 0,
        ...Option.match(Option.fromUndefinedOr(section.timeline), {
          onNone: () => ({}),
          onSome: (timeline) => ({ timeline }),
        }),
        ...Option.match(Option.fromUndefinedOr(section.knobs), {
          onNone: () => ({}),
          onSome: (knobs) => ({ knobs }),
        }),
      };
      sections.push({
        id: section.id,
        take: section.take,
        kept: kept.map((k) => k.index),
        pieces,
        seams: pieces.slice(1).map((p) => p.at),
        voice,
        timed,
      });
    }
    return {
      sections,
      scenes: sections.map((s) => s.timed),
      timings: { voice: '', scenes: Object.fromEntries(sections.map((s) => [s.id, s.voice])) },
    };
  });

/** Whether `talk` quotes word `index` of its take `take` (`quotes`): it is gold in the captions. */
const quotedAt = (talk: Talk, take: string, index: number) =>
  (talk.quotes ?? []).some((q) => q.take === take && index >= q.from && index <= q.to);

/**
 * A talk's captions on its clock: each section's words (spelt as the talk
 * fixes them) phrased apart (`phrasesOf`), so no phrase crosses a section,
 * each shown when it is heard and ended by its section's end; a word inside
 * one of the talk's `quotes` is quoted (gold). `placed` is the cut laid out
 * (`layout(cut.scenes, cut.timings)`).
 */
export const talkPhrases = (
  talk: Talk,
  cut: TalkCut,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<Phrase> =>
  cut.sections.flatMap((section) =>
    Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === section.id),
      {
        onNone: () => [],
        onSome: (p) => {
          const offset = p.start + p.speechStart;
          const end = p.start + p.dur;
          const local = heard(p.voice.words).map((w) => ({
            text: w.text,
            start: w.start + offset,
            end: w.end + offset,
          }));
          const quoted = section.kept.map((index) => quotedAt(talk, section.take, index));
          return phrasesOf(local, new Set(), quoted).map((phrase) => ({
            ...phrase,
            end: Math.min(phrase.end, end),
          }));
        },
      },
    ),
  );
