// What `film check` looks for, as pure functions over a laid-out film: the
// static findings (cues past their scene, sound cues naming nothing, acts out
// of order, stale takes and sounds, an audio master missing, not as long as
// the film or mixed for another plan, a line handed to a voice the cast lacks);
// what the mix the film makes now fails (dead air, the balance); the layout
// findings in what a probed frame reports: text over text, text off the
// frame, brush strokes across text, and a plate carrying text cut off by the
// frame; and static holds, where the voice speaks over a picture that does not
// move. Every finding is collected; none stops the others. The findings, their
// levels and addresses are in findings.ts; the legs that run these in film-check.ts.

import { Array as Arr, Match, Option, Order, Predicate, Record as Rec, Result } from 'effect';
import { BOIL_FPS, STROKE_JITTER } from '../canvas/ink.ts';
import { type Pcm, windowPowers } from '../core/audio.ts';
import { BALANCE, hotEffects } from '../core/balance.ts';
import type { MixPlan, Mixed } from '../core/mix.ts';
import { loudness } from '../core/synth/loudness.ts';
import type { Placed } from '../core/layout.ts';
import {
  DEFAULT_TAIL,
  MIN_LEAD,
  everyTakeRecorded,
  filmEnd,
  sceneAt,
  transitionDur,
} from '../core/layout.ts';
import { type SceneMoment, sceneMoments } from '../core/moments.ts';
import { PHRASE_GAP } from '../core/phrases.ts';
import { insidePolygon } from '../core/polygon.ts';
import {
  endsSentence,
  lastVoiced,
  linesOf,
  takeScript,
  takeState,
  voiceKey,
  wordAfter,
} from '../core/narration.ts';
import type {
  Knob,
  Score,
  Point,
  Sound,
  SoundManifest,
  Span,
  Timeline,
  Until,
} from '../core/schema.ts';
import type { FaceMark, InkMark, Probed, TextBox } from '../core/export-handle.ts';
import {
  LEAD_IN,
  type LibraryEntry,
  type SoundUse,
  type Sounds,
  playablesOf,
  resolveUse,
  soundState,
} from '../core/sfx.ts';
import { cueTime, movementSpans, scoreOptionState, scoreOptions } from '../core/sound.ts';
import { CLOCK_EPSILON, DEFAULT_EASE, type Interval } from '../core/time.ts';
import { endsLate } from '../core/timeline.ts';
import type { PartError } from '../core/acts.ts';
import type {
  MovementLength,
  SoundUseMismatch,
  UnknownSound,
  UnknownVoice,
} from '../core/errors.ts';
import { type AudioMissing, type AudioStale, LeadIn, SoundStale, SoundUnmade } from './errors.ts';
import {
  AssetMissing,
  AssetStale,
  CueLate,
  CueTwin,
  DeadAir,
  EffectHot,
  EndShort,
  type FrameFinding,
  InkOverText,
  KnobRepeated,
  MasterLoudness,
  type MixFinding,
  PlateOffFrame,
  SeamLong,
  type StaticFinding,
  Storyboard,
  TakeStale,
  TextOffFrame,
  TextOffPlate,
  TextOverlap,
  DurOnWord,
  InkOverFace,
  WordPinFar,
} from './findings.ts';
import type { LoadedFilm } from './film-repo.ts';
import { type Master, masterFinding } from './mixer.ts';

// ---------------------------------------------------------------------------
// Static

/**
 * How many sentence ends a word pin may cross past its mark: its own
 * sentence's end, into the next sentence. Past that, the word it meant near
 * the mark is likely gone from the take.
 */
const PIN_REACH = 1;

/**
 * Word pins that land more than `PIN_REACH` sentences past their mark. A pin
 * lands on the first saying at or after its mark, so a re-take that drops the
 * word near the mark moves the cue to a later saying without failing; this
 * says so. A pin the line never says is `WordMissing` at layout, not here.
 */
export const farPins = (placed: ReadonlyArray<Placed>): ReadonlyArray<WordPinFar> =>
  placed.flatMap((p) =>
    Object.entries(Option.getOrElse(Option.fromNullishOr(p.spec.timeline), () => ({}))).flatMap(
      ([cue, span]) => {
        if (!('word' in span)) return [];
        const mark = span.mark;
        const pin = Option.all({
          word: Option.fromNullishOr(span.word),
          m: Option.fromNullishOr(p.voice.marks.get(mark)),
        });
        const landed = Option.flatMap(pin, ({ word, m }) =>
          Option.map(wordAfter(p.voice.words, m, word), (t) => ({ word, m, t })),
        );
        return Option.toArray(landed).flatMap(({ word, m, t }) => {
          const sentences = p.voice.words.filter(
            (w) => w.start >= m - 1e-3 && w.start < t && endsSentence(w.text),
          ).length;
          if (sentences <= PIN_REACH) return [];
          return [WordPinFar.make({ scene: p.spec.id, cue, mark, word, sentences })];
        });
      },
    ),
  );

/** How near a hand-sized edge must land to a phrase edge to read as sized to it, in seconds. */
const DUR_ON_WORD = 0.08;

/** The shortest `dur` `durOnWords` reads: a shorter motion is a gesture, not a length sized to a line. */
const DUR_MIN = 1;

/** A word's heard edge that bounds a phrase: where the voice starts after a pause or stops before one. */
interface PhraseEdge {
  readonly word: string;
  readonly edge: 'start' | 'end';
  /** Voice seconds. */
  readonly at: number;
}

/** The phrase edges of a take: its first word's start, its last word's end, and each side of every pause over `PHRASE_GAP`. */
const phraseEdges = (words: Placed['voice']['words']): ReadonlyArray<PhraseEdge> =>
  words.flatMap((w, i) => {
    const before = Arr.get(words, i - 1);
    const after = Arr.get(words, i + 1);
    const opens = Option.match(before, {
      onNone: () => true,
      onSome: (b) => w.voiced.start - b.voiced.end >= PHRASE_GAP,
    });
    const closes = Option.match(after, {
      onNone: () => true,
      onSome: (a) => a.voiced.start - w.voiced.end >= PHRASE_GAP,
    });
    return [
      ...Arr.filter([{ word: w.text, edge: 'start' as const, at: w.voiced.start }], () => opens),
      ...Arr.filter([{ word: w.text, edge: 'end' as const, at: w.voiced.end }], () => closes),
    ];
  });

/**
 * Cues whose length is written by hand (`dur` of `DUR_MIN` or more) and whose
 * hand-sized edge (its end; with `ends`, its start) lands within
 * `DUR_ON_WORD` of a phrase edge of its scene's take (`DurOnWord`): a length
 * sized to this take, which a re-take leaves behind its word. A warning, and
 * only a report: `until` a mark, or a word pin, is the fix, made by hand.
 */
export const durOnWords = (placed: ReadonlyArray<Placed>): ReadonlyArray<DurOnWord> =>
  placed.flatMap((p) => {
    const edges = phraseEdges(p.voice.words);
    return Object.entries(
      Option.getOrElse(Option.fromNullishOr(p.spec.timeline), () => ({})),
    ).flatMap(([cue, span]) => {
      const dur = Option.filter(Option.fromNullishOr(span.dur), (d) => d >= DUR_MIN);
      const found = Option.flatMap(
        Option.all({ dur, resolved: Option.fromNullishOr(p.cues.get(cue)) }),
        ({ dur, resolved }) => {
          const sized = Match.value(span.ends === true).pipe(
            Match.when(true, () => resolved.start),
            Match.orElse(() => resolved.end),
          );
          const voiceAt = sized - p.speechStart;
          return Option.map(
            Arr.findFirst(edges, (e) => Math.abs(e.at - voiceAt) <= DUR_ON_WORD + CLOCK_EPSILON),
            (e) =>
              DurOnWord.make({ scene: p.spec.id, cue, dur, word: e.word, edge: e.edge, at: sized }),
          );
        },
      );
      return Option.toArray(found);
    });
  });

/**
 * A point of a timeline as its declaration writes it: a primary anchor (a
 * mark, with its word pin, or a landmark) and seconds from it, with every
 * `with` and `after` followed to the anchor under it. Two cues with the same
 * declared edges stay together under any re-take.
 */
interface DeclaredPoint {
  readonly anchor: string;
  readonly offset: number;
}

/** A cue's two edges as declared (`DeclaredPoint`), and how it plays across them. */
interface DeclaredCue {
  readonly start: DeclaredPoint;
  readonly end: DeclaredPoint;
  readonly ease: string;
  readonly stagger: number;
  readonly silence: boolean;
}

const plus = (p: DeclaredPoint, seconds: number): DeclaredPoint => ({
  anchor: p.anchor,
  offset: p.offset + seconds,
});

/** A mark, or a word pinned after it, as a declared point. */
const markPoint = (mark: string, word?: string): DeclaredPoint => ({
  anchor: `mark ${mark} ${word ?? ''}`,
  offset: 0,
});

/** A span's edges from its anchor's declared point and its `until`'s (`ended`, plus its `untilOffset`), as `resolveTimeline` lays them. */
const edgesFrom = (
  span: Span,
  anchor: DeclaredPoint,
  ended: (until: Until) => Option.Option<DeclaredPoint>,
): Option.Option<Pick<DeclaredCue, 'start' | 'end'>> => {
  const at = plus(
    anchor,
    Option.getOrElse(Option.fromUndefinedOr(span.offset), () => 0),
  );
  const off = Option.getOrElse(Option.fromUndefinedOr(span.untilOffset), () => 0);
  return Option.match(Option.fromUndefinedOr(span.until), {
    onSome: (until) => Option.map(ended(until), (end) => ({ start: at, end: plus(end, off) })),
    onNone: () => {
      const dur = Option.getOrElse(Option.fromUndefinedOr(span.dur), () => 0);
      if (span.ends === true) return Option.some({ start: plus(at, -dur), end: at });
      return Option.some({ start: at, end: plus(at, dur) });
    },
  });
};

/** How a span plays across its edges, each default applied as `resolveTimeline` applies it. */
const playOf = (span: Span): Pick<DeclaredCue, 'ease' | 'stagger' | 'silence'> => ({
  ease: Option.getOrElse(Option.fromUndefinedOr(span.ease), () => DEFAULT_EASE),
  stagger: Option.getOrElse(Option.fromUndefinedOr(span.stagger), () => 0),
  silence: span.silence === true,
});

/** Every cue of `timeline` as declared; a cue whose anchor chain fails to resolve is left out (layout names it). */
const declaredCues = (timeline: Timeline): ReadonlyMap<string, DeclaredCue> => {
  const out = new Map<string, DeclaredCue>();
  const visiting = new Set<string>();
  const declare = (name: string, span: Span): Option.Option<DeclaredCue> => {
    visiting.add(name);
    const edges = Option.flatMap(anchorOf(span), (a) => edgesFrom(span, a, untilOf));
    visiting.delete(name);
    return Option.map(edges, (e) => {
      const declared = { ...e, ...playOf(span) };
      out.set(name, declared);
      return declared;
    });
  };
  const cue = (name: string): Option.Option<DeclaredCue> =>
    Option.orElse(Option.fromUndefinedOr(out.get(name)), () =>
      Option.flatMap(
        Option.filter(Rec.get(timeline, name), () => !visiting.has(name)),
        (span) => declare(name, span),
      ),
    );
  const anchorOf = (span: Span): Option.Option<DeclaredPoint> => {
    if ('mark' in span) return Option.some(markPoint(span.mark, span.word));
    if ('after' in span) return Option.map(cue(span.after), (c) => c.end);
    if ('with' in span) return Option.map(cue(span.with), (c) => c.start);
    return Option.some({ anchor: `at ${span.at}`, offset: 0 });
  };
  /** Where an `until` ends a span: its mark, its landmark, or the named cue's edge (its end by default). */
  const untilOf = (until: Until): Option.Option<DeclaredPoint> =>
    Match.value(until).pipe(
      Match.when(Predicate.isString, (mark) => Option.some(markPoint(mark))),
      Match.orElse((point) =>
        Option.match(Option.fromUndefinedOr(point.cue), {
          onNone: () => Option.some({ anchor: `at ${point.at}`, offset: 0 }),
          onSome: (name) =>
            Option.map(cue(name), (c) =>
              Match.value(point.edge).pipe(
                Match.when('start', () => c.start),
                Match.orElse(() => c.end),
              ),
            ),
        }),
      ),
    );
  for (const name of Object.keys(timeline)) cue(name);
  return out;
};

const samePoint = (a: DeclaredPoint, b: DeclaredPoint) =>
  a.anchor === b.anchor && Math.abs(a.offset - b.offset) < CLOCK_EPSILON;

const sameCue = (a: DeclaredCue, b: DeclaredCue) =>
  samePoint(a.start, b.start) &&
  samePoint(a.end, b.end) &&
  a.ease === b.ease &&
  a.stagger === b.stagger &&
  a.silence === b.silence;

/**
 * Cues of one scene declared twice for the same moment (`CueTwin`): the same
 * edges on the same anchors (a `with` another cue at its length counts as
 * that cue) and the same ease, stagger and silence, so nothing tells them
 * apart but their names, and a lab drag of one leaves the other behind. Each
 * later twin is reported against the first cue it repeats.
 */
export const cueTwins = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueTwin> =>
  placed.flatMap((p) => {
    const cues = [...declaredCues(p.spec.timeline ?? {})];
    return cues.flatMap(([cue, declared], i) =>
      Option.toArray(
        Option.map(
          Arr.findFirst(cues.slice(0, i), ([, earlier]) => sameCue(earlier, declared)),
          ([twin]) => CueTwin.make({ scene: p.spec.id, cue, twin }),
        ),
      ),
    );
  });

/** The beats that play as storyboard cards: no drawing yet. */
export const storyboards = (placed: ReadonlyArray<Placed>): ReadonlyArray<Storyboard> =>
  placed
    .filter((p) => p.spec.storyboard === true)
    .map((p) => Storyboard.make({ scene: p.spec.id }));

/**
 * What a point knob holds, as `repeatedKnobs` compares it: its point, and
 * for a framing (a point `name` with a number `<name>Zoom`, as `knobCamera`
 * reads them) its zoom too, so two framings that share a point at different
 * zooms are two framings.
 */
const knobKey = (
  knobs: ReadonlyMap<string, Knob>,
  knob: string,
  point: readonly [number, number],
): string => {
  const zoom = knobs.get(`${knob}Zoom`);
  if (Predicate.isNumber(zoom)) return `${point.join(',')}×${zoom}`;
  return point.join(',');
};

/**
 * Point knobs a later scene writes with the value an earlier scene's knob
 * holds (`KnobRepeated`): the first scene to write a point (a framing's point
 * and zoom) owns it. A number knob is left out: a zoom of 1 is no callback.
 */
export const repeatedKnobs = (placed: ReadonlyArray<Placed>): ReadonlyArray<KnobRepeated> => {
  const owners = new Map<string, { readonly scene: string; readonly knob: string }>();
  return placed.flatMap((p) =>
    [...p.knobs].flatMap(([knob, value]) => {
      if (Predicate.isNumber(value)) return [];
      const key = knobKey(p.knobs, knob, value);
      return Option.match(Option.fromUndefinedOr(owners.get(key)), {
        onNone: () => {
          owners.set(key, { scene: p.spec.id, knob });
          return [];
        },
        onSome: (owner) => {
          if (owner.scene === p.spec.id) return [];
          return [
            KnobRepeated.make({ scene: p.spec.id, knob, of: owner.scene, ofKnob: owner.knob }),
          ];
        },
      });
    }),
  );
};

/** Named cues that end after their scene (`endsLate`). */
export const lateCues = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueLate> =>
  placed.flatMap((p) =>
    [...p.cues]
      .filter(([, c]) => endsLate(c, p.dur))
      .map(([cue, c]) => CueLate.make({ scene: p.spec.id, cue, end: c.end, dur: p.dur })),
  );

/**
 * The longest pause between two voices a film makes without saying so: the
 * layout's shortest lead plus its default tail (0.6 s), the film skill's CRAFT
 * rule 9.
 */
export const MAX_SEAM = MIN_LEAD + DEFAULT_TAIL;

/**
 * The pause from `p`'s last word to `q`'s voice, when both speak and `q`
 * follows `p`: from where `p`'s last word is heard (`lastVoiced`), so the
 * silence a take trails counts as the pause it is.
 */
export const seamAfter = (p: Placed, q: Placed): Option.Option<number> => {
  if (p.voice.duration <= 0 || q.voice.duration <= 0) return Option.none();
  return Option.some(p.dur - (p.speechStart + lastVoiced(p.voice)) + q.speechStart);
};

/**
 * Whether a scene declares the time after its words: a `tail`, or a `min`
 * that stretches the scene past its words and default tail. A `min` its words
 * outrun declares nothing.
 */
const declaresEnd = (p: Placed) =>
  Predicate.isNotUndefined(p.spec.tail) ||
  Option.exists(
    Option.fromUndefinedOr(p.spec.min),
    (min) => min > p.speechStart + p.voice.duration + DEFAULT_TAIL + CLOCK_EPSILON,
  );

/**
 * Seams over `MAX_SEAM` between two speaking scenes, where neither scene
 * declares the pause: a long entrance stretching the default lead, not a pause
 * the script means.
 */
export const longSeams = (placed: ReadonlyArray<Placed>): ReadonlyArray<SeamLong> =>
  placed.slice(1).flatMap((q, i) => {
    const p = Arr.getUnsafe(placed, i);
    if (declaresEnd(p) || Predicate.isNotUndefined(q.spec.lead)) return [];
    return Option.match(seamAfter(p, q), {
      onNone: () => [],
      onSome: (seam) => {
        if (seam <= MAX_SEAM + CLOCK_EPSILON) return [];
        return [SeamLong.make({ from: p.spec.id, to: q.spec.id, seam, max: MAX_SEAM })];
      },
    });
  });

/**
 * Beats with words whose take is missing or was recorded for other text,
 * other turns or another voice (a person's take is read by no staging voice).
 * Each line is read as the layout placed it (`voice`: its words and turns).
 */
export const staleTakes = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<TakeStale> => {
  const voice = voiceKey(film.voice);
  return placed.flatMap((p) => {
    if (p.voice.spoken.length === 0) return [];
    const state = takeState(p.spec.id, takeScript(p.voice), film.timings, voice);
    if (state._tag !== 'Stale') return [];
    return [TakeStale.make({ scene: p.spec.id, reason: state.reason, recorded: state.recorded })];
  });
};

/** Lines handed to a voice the film's cast does not have: `narrate` would refuse them. */
export const unknownVoices = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<UnknownVoice> =>
  placed.flatMap((p) =>
    Result.match(linesOf(p.spec.id, p.voice, film.voice), {
      onFailure: (error) => [error],
      onSuccess: () => [],
    }),
  );

/**
 * Each score option's movements: each names a scene, and each runs in film
 * order for as long as the API's chunks may last (`movementSpans`: the first
 * misnamed or out-of-order movement, else every length it refuses). Only movements that hold are checked for
 * the option's state (`scoreOptionState`, asset `score.<option>`): missing,
 * or composed for another plan.
 */
export const musicFindings = (
  score: Score,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<PartError | MovementLength | AssetStale | AssetMissing> =>
  scoreOptions(score).flatMap(
    (option): ReadonlyArray<PartError | MovementLength | AssetStale | AssetMissing> => {
      const movements = Result.match(movementSpans(option.music, placed), {
        onFailure: (error): ReadonlyArray<PartError | MovementLength> => [error],
        onSuccess: (spans) => Arr.getFailures(spans),
      });
      if (movements.length > 0) return movements;
      const asset = `score.${option.name}`;
      const state = scoreOptionState(option, placed, manifest);
      if (state._tag === 'Missing') return [AssetMissing.make({ asset })];
      if (state._tag === 'Current') return [];
      if (state.why._tag !== 'Retimed') return [state.why];
      return [AssetStale.make({ asset, stored: state.asset.hash, wanted: state.why.key })];
    },
  );

/**
 * The mix measured against the film's sound rules: the master's loudness off
 * its target, and each effect that crowds the voice around it (`hotEffects`:
 * its loudest 50 ms, as the mix plays it).
 */
export const balanceFindings = (
  placed: ReadonlyArray<Placed>,
  plan: MixPlan<Pcm>,
  mixed: Mixed,
): ReadonlyArray<MasterLoudness | EffectHot> => {
  const { tolerance } = BALANCE;
  const found: Array<MasterLoudness | EffectHot> = [];
  const master = loudness(mixed.master).integrated;
  if (Number.isFinite(master) && Math.abs(master - BALANCE.master) > tolerance)
    found.push(MasterLoudness.make({ loudness: master, target: BALANCE.master, tolerance }));
  for (const hot of hotEffects(mixed.voice, plan.effects))
    found.push(
      EffectHot.make({
        effect: hot.name,
        scene: Option.match(sceneAt(placed, hot.at), {
          onNone: () => '',
          onSome: (p) => p.spec.id,
        }),
        at: hot.at,
        over: hot.over,
      }),
    );
  return found;
};

/** A named library sound for `use`: refused (unknown, or for the other use), unmade, stale, or fine. */
const libraryFindings = (
  sounds: Sounds,
  name: string,
  use: SoundUse,
): Result.Result<
  { readonly entry: LibraryEntry; readonly findings: ReadonlyArray<StaticFinding> },
  UnknownSound | SoundUseMismatch
> =>
  Result.map(resolveUse(sounds.library, name, use), (entry) => {
    const state = soundState(entry, Option.fromUndefinedOr(sounds.lock[name]));
    const findings: Array<StaticFinding> = [];
    if (state._tag === 'Missing')
      findings.push(SoundUnmade.make({ name, candidates: state.candidates }));
    if (state._tag === 'Stale') findings.push(SoundStale.make({ name }));
    return { entry, findings };
  });

/**
 * An effect that lands its takes' first sample on its cue (`sync: 'start'`)
 * heard late there: the kept take whose sound starts latest past `LEAD_IN`.
 * A placement synced to its onset or hit lands that moment instead, so the
 * finding is the placement's, not the take's.
 */
const leadIn = (
  effect: string,
  placing: Sound['effects'][string],
  entry: LibraryEntry,
  sounds: Sounds,
): ReadonlyArray<LeadIn> => {
  if ((placing.sync ?? 'start') !== 'start') return [];
  const late = playablesOf(sounds, placing.sound, entry).flatMap((p, i) =>
    Option.toArray(
      Option.map(
        Option.filter(Option.all({ onset: p.onset, hit: p.hit }), ({ onset }) => onset > LEAD_IN),
        (timing) => ({ variant: i + 1, ...timing }),
      ),
    ),
  );
  return Option.toArray(
    Option.map(Arr.last(Arr.sort(late, lateOrder)), (take) =>
      LeadIn.make({ effect, name: placing.sound, ...take }),
    ),
  );
};

/** Takes by onset, latest last. */
const lateOrder = Order.mapInput(Order.Number, (t: { readonly onset: number }) => t.onset);

/**
 * Every bed and effect: each cue names a real scene, cue or mark; each sound
 * is in the library, declared for how it is placed, made and current. A
 * sound named twice is reported once. An effect placed from its first sample
 * whose take starts late is heard late on its cue (`LeadIn`). (How loud each
 * plays against the voice is measured on the mix: `balanceFindings`.)
 */
export const soundFindings = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  sounds: Sounds,
): ReadonlyArray<StaticFinding> => {
  const named = new Set<string>();
  const once = (name: string, found: ReadonlyArray<StaticFinding>) => {
    if (named.has(name)) return [];
    named.add(name);
    return found;
  };
  const cueFindings = (cue: Sound['effects'][string]['at'][number]) =>
    Result.match(cueTime(cue, placed), { onFailure: (e) => [e], onSuccess: () => [] });
  const beds = (sound.beds ?? []).flatMap((bed) => [
    ...cueFindings(bed.from),
    ...cueFindings(bed.to),
    ...Result.match(libraryFindings(sounds, bed.sound, 'bed'), {
      onFailure: (e) => once(bed.sound, [e]),
      onSuccess: ({ findings }) => once(bed.sound, findings),
    }),
  ]);
  const effects = Object.entries(sound.effects).flatMap(([id, effect]) => [
    ...effect.at.flatMap(cueFindings),
    ...Result.match(libraryFindings(sounds, effect.sound, 'one-shot'), {
      onFailure: (e) => once(effect.sound, [e]),
      onSuccess: ({ entry, findings }) => [
        ...once(effect.sound, findings),
        ...leadIn(id, effect, entry, sounds),
      ],
    }),
  ]);
  return [...beds, ...effects];
};

/**
 * How far the audio master may differ from the film's length. The check does
 * not know the film's frame rate, so it holds the master to a frame at 60 fps,
 * no looser than the render's one frame at any rate up to that; a mix is
 * trimmed to the film's length, so a current master is exact.
 */
const MASTER_TOLERANCE = 1 / 60;

/**
 * The track on disk (`readMaster`), the key of the plan the film mixes to now
 * (`planKey`), and the track's file as a finding names it: by its place in
 * the film's folder (`narration/full.wav`), never the machine's path.
 */
export interface MasterAudio {
  readonly master: Option.Option<Master>;
  readonly key: Option.Option<string>;
  readonly file: string;
}

/**
 * Once every take is recorded the film has a mixed track, and its master must
 * cover the film and be mixed for the plan the film plays now.
 */
const masterFindings = (
  placed: ReadonlyArray<Placed>,
  audio: MasterAudio,
): ReadonlyArray<AudioMissing | AudioStale> => {
  if (!everyTakeRecorded(placed)) return [];
  return Option.toArray(
    masterFinding(
      audio.file,
      audio.master,
      { seconds: filmEnd(placed), key: audio.key },
      MASTER_TOLERANCE,
    ),
  );
};

// ---------------------------------------------------------------------------
// The ending and the air

/** After the last word, credits and music alone need at least this long (research #6, #44). */
const TAIL_MIN = 20;
/** YouTube's end screens need at least this long at the end. */
const CARD_MIN = 5;

/**
 * The ending, against what YouTube needs: the stretch after the last word
 * under `TAIL_MIN`, or the end card (the last scene, when it speaks nothing)
 * under `CARD_MIN`; a last scene that speaks is no end card at all.
 */
export const endShort = (placed: ReadonlyArray<Placed>): ReadonlyArray<EndShort> => {
  const last = Arr.last(placed);
  if (Option.isNone(last)) return [];
  const spoken = placed.filter((p) => p.voice.duration > 0);
  const lastWord = Math.max(0, ...spoken.map((p) => p.start + p.speechStart + p.voice.duration));
  const tail = filmEnd(placed) - lastWord;
  const card = Option.match(
    Option.liftPredicate(last.value, (p) => p.voice.duration <= 0),
    { onNone: () => 0, onSome: (p) => p.dur },
  );
  return [
    ...Arr.filter(
      [EndShort.make({ part: 'after the last word', secs: tail, min: TAIL_MIN })],
      () => spoken.length > 0 && tail < TAIL_MIN,
    ),
    ...Arr.filter(
      [EndShort.make({ part: 'end card', secs: card, min: CARD_MIN })],
      () => card < CARD_MIN,
    ),
  ];
};

/** The master counts as silent below this level, in dBFS. */
const DEAD_FLOOR = -60;
/** A silence longer than this, in seconds, that no cue declares is dead air. */
export const DEAD_MAX = 1.5;
/** The master's level is read in windows this long, in seconds, its sides' power summed (`windowPowers`). */
const DEAD_WINDOW = 0.05;

/** The film seconds every cue declared `silence: true` spans. */
export const designedSilences = (placed: ReadonlyArray<Placed>): ReadonlyArray<Interval> =>
  placed.flatMap((p) =>
    Object.entries(p.spec.timeline ?? {})
      .filter(([, span]) => span.silence === true)
      .flatMap(([name]) =>
        Option.toArray(Option.fromNullishOr(p.cues.get(name))).map((c): Interval => ({
          from: p.start + c.start,
          to: p.start + c.end,
        })),
      ),
  );

/** `run` less every span of `cut`, in order. */
const without = (run: Interval, cut: ReadonlyArray<Interval>): ReadonlyArray<Interval> =>
  cut.reduce<ReadonlyArray<Interval>>(
    (pieces, gone) =>
      pieces.flatMap((piece): ReadonlyArray<Interval> => {
        if (gone.to <= piece.from || gone.from >= piece.to) return [piece];
        const kept: ReadonlyArray<Interval> = [
          { from: piece.from, to: gone.from },
          { from: gone.to, to: piece.to },
        ];
        return kept.filter((k) => k.to > k.from);
      }),
    [run],
  );

/**
 * Dead air in the master: each run of `levels` (dBFS per `window` seconds)
 * under `DEAD_FLOOR` that, less the designed silences, still lasts over
 * `DEAD_MAX`.
 */
export const deadAir = (
  levels: ArrayLike<number>,
  window: number,
  designed: ReadonlyArray<Interval>,
): ReadonlyArray<DeadAir> => {
  const runs: Interval[] = [];
  let from = -1;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && (levels[i] ?? 0) < DEAD_FLOOR;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      runs.push({ from: from * window, to: i * window });
      from = -1;
    }
  }
  return runs
    .flatMap((run) => without(run, designed))
    .filter((run) => run.to - run.from > DEAD_MAX)
    .map((run) => DeadAir.make({ ...run, floor: DEAD_FLOOR, max: DEAD_MAX }));
};

/**
 * Everything the check finds without drawing a frame or mixing: `audio` is
 * the master on disk and the key of the plan the film mixes to now. `report`
 * levels and addresses them.
 */
export const staticFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  audio: MasterAudio,
): ReadonlyArray<StaticFinding> => {
  const sound = Option.toArray(film.sound).flatMap((s) => [
    ...Option.toArray(Option.fromNullishOr(s.score)).flatMap((score) =>
      musicFindings(score, placed, film.manifest),
    ),
    ...soundFindings(s, placed, film.sounds),
  ]);
  const master = masterFindings(placed, audio);
  const takes = [...unknownVoices(film, placed), ...staleTakes(film, placed)];
  return [
    ...lateCues(placed),
    ...longSeams(placed),
    ...farPins(placed),
    ...durOnWords(placed),
    ...cueTwins(placed),
    ...storyboards(placed),
    ...repeatedKnobs(placed),
    ...takes,
    ...sound,
    ...master,
    ...endShort(placed),
  ];
};

/**
 * What the mix the film makes now (`Mixer.render`, in memory) fails: dead air
 * in its master, read in `DEAD_WINDOW` windows as a listener hears it, and
 * the balance.
 */
export const mixFindings = (
  placed: ReadonlyArray<Placed>,
  plan: MixPlan<Pcm>,
  mixed: Mixed,
): ReadonlyArray<MixFinding> => {
  const levels = windowPowers(mixed.master, Math.round(DEAD_WINDOW * mixed.master.rate));
  return [
    ...deadAir(levels, DEAD_WINDOW, designedSilences(placed)),
    ...balanceFindings(placed, plan, mixed),
  ];
};

// ---------------------------------------------------------------------------
// Layout

/** A frame the layout leg probes, and why: a mark, a cue edge, the scene's 60% point. */
export type Sample = SceneMoment;

/** The frames to probe in each scene: every mark, every cue's start and end, and the 60% point. */
export const layoutSamples = (placed: ReadonlyArray<Placed>, fps: number): ReadonlyArray<Sample> =>
  sceneMoments(placed, fps, { marks: true });

/**
 * Text fainter than this reads as gone. Both lines of a pair must be above it
 * to collide, so a word fading out where another fades in is a crossfade, not
 * a collision.
 */
const VISIBLE_ALPHA = 0.3;
/** Two lines collide only where they overlap by more than this many pixels, across and down. */
const OVERLAP_TOLERANCE = 4;

const visible = (box: TextBox) => box.alpha > VISIBLE_ALPHA;

type Quad = TextBox['corners'];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

/** Shoelace area of a polygon: positive for one winding, negative for the other. */
const signedArea = (poly: ReadonlyArray<Point>): number =>
  poly.reduce((sum, p, i) => sum + cross(p, Arr.getUnsafe(poly, (i + 1) % poly.length)), 0) / 2;

/** Sutherland–Hodgman: the part of `subject` inside the convex polygon `clip`. */
const clipPolygon = (
  subject: ReadonlyArray<Point>,
  clip: ReadonlyArray<Point>,
): ReadonlyArray<Point> => {
  const winding = Math.sign(signedArea(clip));
  return clip.reduce<ReadonlyArray<Point>>((poly, a, i) => {
    if (poly.length === 0) return poly;
    const b = Arr.getUnsafe(clip, (i + 1) % clip.length);
    const inside = (p: Point) => winding * cross(sub(b, a), sub(p, a)) >= 0;
    const meet = (p: Point, q: Point): Point => {
      const d = sub(q, p);
      const k = cross(sub(b, a), sub(a, p)) / cross(sub(b, a), d);
      return [p[0] + d[0] * k, p[1] + d[1] * k];
    };
    return poly.flatMap((p, j) => {
      const prev = Arr.getUnsafe(poly, (j + poly.length - 1) % poly.length);
      if (inside(p)) {
        if (inside(prev)) return [p];
        return [meet(prev, p), p];
      }
      if (inside(prev)) return [meet(prev, p)];
      return [];
    });
  }, subject);
};

/** The area two convex quads share. */
const sharedArea = (a: Quad, b: Quad): number => {
  if (signedArea(a) === 0 || signedArea(b) === 0) return 0;
  return Math.abs(signedArea(clipPolygon(a, b)));
};

/** A quad pulled in by `by` pixels on every side along its own axes; none if too thin. */
const inset = (q: Quad, by: number): Option.Option<Quad> => {
  const [tl, tr, br, bl] = q;
  const across = Math.hypot(...sub(tr, tl));
  const down = Math.hypot(...sub(bl, tl));
  if (across <= 2 * by || down <= 2 * by) return Option.none();
  const u = sub(tr, tl).map((c) => (c / across) * by);
  const v = sub(bl, tl).map((c) => (c / down) * by);
  const move = (p: Point, su: number, sv: number): Point => [
    p[0] + su * Arr.getUnsafe(u, 0) + sv * Arr.getUnsafe(v, 0),
    p[1] + su * Arr.getUnsafe(u, 1) + sv * Arr.getUnsafe(v, 1),
  ];
  return Option.some([move(tl, 1, 1), move(tr, -1, 1), move(br, -1, -1), move(bl, 1, -1)]);
};

/**
 * The area two lines of text share, in their own rotated boxes, or 0 when
 * they overlap by no more than the tolerance: each box is pulled in by half
 * of it before they are compared.
 */
export const overlapArea = (a: TextBox, b: TextBox): number => {
  const deep = Option.zipWith(
    inset(a.corners, OVERLAP_TOLERANCE / 2),
    inset(b.corners, OVERLAP_TOLERANCE / 2),
    sharedArea,
  );
  if (Option.getOrElse(deep, () => 0) <= 0) return 0;
  return sharedArea(a.corners, b.corners);
};

/** Whether a box lies wholly outside a `width` × `height` frame: it shows nothing. */
const offFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => box.x >= width || box.y >= height || box.x + box.w <= 0 || box.y + box.h <= 0;

/**
 * How far a box reaches past each edge of a `width` × `height` frame (0 where
 * it does not). A box wholly outside the frame shows nothing, so it reaches
 * past nothing: text that has slid or fallen away is gone, not cut off.
 */
export const pastFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => {
  if (offFrame(box, width, height)) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.max(0, -box.x),
    top: Math.max(0, -box.y),
    right: Math.max(0, box.x + box.w - width),
    bottom: Math.max(0, box.y + box.h - height),
  };
};

/**
 * A plate or fill drawn over a stroke lets `1 - alpha` of it through, and
 * layers multiply: the stroke is hidden where what shows of it is no more
 * than `VISIBLE_ALPHA`, the opacity below which ink does not read over text
 * (so a full-strength stroke is hidden by one layer at 0.7 or more).
 */
const showing = (stroke: InkMark, layers: ReadonlyArray<InkMark>): number =>
  layers.reduce((left, layer) => left * (1 - layer.alpha), stroke.alpha);
/**
 * A stroke drawn before a line of text lies under it, and one that is both
 * light and thin is page texture the words read over (greeked copy on a
 * newspaper, the lines of a decree under its stamp). Light: at most this
 * opacity, so full-strength letters keep at least twice the ink's contrast
 * over it. Only a stroke drawn over the text, or a heavier or wider one under
 * it, strikes it.
 */
const UNDER_ALPHA = 0.5;
/**
 * Thin, for texture: at most this share of the letters' height (the text box
 * measured down its own side, so a turned line counts its real height). A
 * rule that thin sits across a third of each glyph at most and every letter
 * keeps its shape; a wider one is a bar through the words.
 */
const TEXTURE_WIDTH = 1 / 3;
/** Along a crossing, the check looks for a plate over the stroke every this many pixels. */
const CROSS_STEP = 2;

/**
 * The part of the segment `p` → `q` inside the convex polygon `poly`, as the
 * fractions of the way along it where it enters and leaves (Cyrus–Beck); none
 * when it misses.
 */
const clipSegment = (
  p: Point,
  q: Point,
  poly: ReadonlyArray<Point>,
): Option.Option<readonly [number, number]> => {
  const winding = Math.sign(signedArea(poly));
  if (winding === 0) return Option.none();
  const d = sub(q, p);
  let enter = 0;
  let leave = 1;
  for (const [i, a] of poly.entries()) {
    const edge = sub(Arr.getUnsafe(poly, (i + 1) % poly.length), a);
    // Inside where winding · cross(edge, x − a) ≥ 0, with x = p + t·d.
    const at = winding * cross(edge, sub(p, a));
    const rate = winding * cross(edge, d);
    if (rate === 0) {
      if (at < 0) return Option.none();
      continue;
    }
    const t = -at / rate;
    if (rate > 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return Option.none();
  }
  return Option.some([enter, leave]);
};

/** The point of the segment `a` → `b` nearest `p`. */
const nearestOnSegment = (a: Point, b: Point, p: Point): Point => {
  const d = sub(b, a);
  const span = d[0] * d[0] + d[1] * d[1];
  if (span === 0) return a;
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / span));
  return [a[0] + d[0] * t, a[1] + d[1] * t];
};

/** The point of the quad `q` (its inside or its outline) nearest `p`: `p` itself when inside. */
const nearestIn = (q: Quad, p: Point): Point => {
  if (insidePolygon(q, p)) return p;
  const candidates = q.map((a, i) => nearestOnSegment(a, Arr.getUnsafe(q, (i + 1) % q.length), p));
  return Arr.reduce(candidates.slice(1), Arr.getUnsafe(candidates, 0), (best, c) => {
    if (Math.hypot(...sub(c, p)) < Math.hypot(...sub(best, p))) return c;
    return best;
  });
};

/**
 * How much of a stroke runs through a line of text where it shows: its
 * centre line clipped to the text's box grown by half the stroke's width (in
 * canvas pixels, after its transform) less half the tolerance, so the
 * stroke's edge, not its centre, is what meets the letters, and a stroke that
 * grazes a box by no more than the tolerance does not cross it; less every
 * stretch the plates and fills drawn after the stroke hide (see `showing`). Where the centre
 * runs beside the box, what meets the letters is the edge, so a plate hides
 * that stretch when it covers the point of the letters (less the tolerance)
 * nearest the centre.
 */
const crossing = (stroke: InkMark, text: TextBox, covers: ReadonlyArray<InkMark>): number => {
  const box = inset(text.corners, OVERLAP_TOLERANCE / 2 - stroke.width / 2);
  if (Option.isNone(box)) return 0;
  const over = covers.filter((c) => c.order > stroke.order);
  // The letters less the tolerance: where an edge that crosses by more than it lands.
  const letters = Option.getOrElse(inset(text.corners, OVERLAP_TOLERANCE / 2), () => text.corners);
  const hidden = (at: Point) => {
    const meets = nearestIn(letters, at);
    const layers = over.filter((c) => insidePolygon(c.points, meets));
    return showing(stroke, layers) <= VISIBLE_ALPHA;
  };
  return stroke.points.slice(1).reduce((sum, q, i) => {
    const p = Arr.getUnsafe(stroke.points, i);
    return Option.match(clipSegment(p, q, box.value), {
      onNone: () => sum,
      onSome: ([enter, leave]) => {
        const len = Math.hypot(...sub(q, p)) * (leave - enter);
        const steps = Math.max(1, Math.ceil(len / CROSS_STEP));
        const shown = Arr.range(0, steps - 1).filter((k) => {
          const t = enter + ((leave - enter) * (k + 0.5)) / steps;
          return !hidden([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }).length;
        return sum + (len * shown) / steps;
      },
    });
  }, 0);
};

/** Two boxes' bounds meet, with `pad` pixels to spare. */
const near = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  pad: number,
) =>
  a.x - pad <= b.x + b.w &&
  b.x <= a.x + a.w + pad &&
  a.y - pad <= b.y + b.h &&
  b.y <= a.y + a.h + pad;

/** The box around a set of ink marks. */
const boundsOf = (marks: ReadonlyArray<InkMark>) => {
  const x = Math.min(...marks.map((m) => m.x));
  const y = Math.min(...marks.map((m) => m.y));
  return {
    x,
    y,
    w: Math.max(...marks.map((m) => m.x + m.w)) - x,
    h: Math.max(...marks.map((m) => m.y + m.h)) - y,
  };
};

/** The letters' height: the text box measured down its own side. */
const lettersHeight = (text: TextBox) => Math.hypot(...sub(text.corners[3], text.corners[0]));

/** Whether `stroke` marks this very line on purpose: it names the hand that wrote it. */
const marksLine = (stroke: InkMark, text: TextBox) =>
  text.scene === stroke.scene &&
  Option.exists(Option.fromUndefinedOr(text.hand), (hand) =>
    Option.exists(Option.fromUndefinedOr(stroke.marks), (marks) => marks.includes(hand)),
  );

/** Whether `stroke` is page texture under `text`: drawn before it, light and thin. */
const textureUnder = (stroke: InkMark, text: TextBox) =>
  stroke.order < text.order &&
  stroke.alpha <= UNDER_ALPHA &&
  stroke.width <= lettersHeight(text) * TEXTURE_WIDTH;

/**
 * Strokes across text: for each visible line, the visible strokes (more than
 * `VISIBLE_ALPHA`: fainter ink does not read over letters) whose width runs
 * through its box (and is not hidden there by the plates and fills drawn after them),
 * other than page texture under it and a stroke that `marks` that very line.
 *
 * Hatching is not measured: it is shading clipped inside a cutout, which the
 * probe records as a fill (`unprobed` in the draw path), so its lines are not
 * where its ink shows; the cutout's outline is what the check sees.
 */
const inkOverText = (sample: Sample, probed: Probed): ReadonlyArray<InkOverText> => {
  const texts = probed.texts.filter(visible);
  const strokes = probed.inks.filter((m) => m.kind === 'stroke' && m.alpha > VISIBLE_ALPHA);
  const covers = probed.inks.filter((m) => m.kind !== 'stroke');
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const byText = new Map<string, Array<readonly [InkMark, number]>>();
  for (const text of texts)
    for (const stroke of strokes) {
      if (marksLine(stroke, text) || !near(stroke, text, stroke.width)) continue;
      if (textureUnder(stroke, text)) continue;
      const length = crossing(stroke, text, covers);
      if (length <= OVERLAP_TOLERANCE) continue;
      const found = Option.getOrElse(Option.fromNullishOr(byText.get(text.text)), () => []);
      byText.set(text.text, [...found, [stroke, length]]);
    }
  return [...byText].map(([text, crossed]) => {
    const marks = Arr.dedupe(crossed.map(([m]) => m));
    return InkOverText.make({
      ...where,
      text,
      strokes: marks.length,
      length: crossed.reduce((sum, [, len]) => sum + len, 0),
      ...boundsOf(marks),
    });
  });
};

/**
 * Ink crosses a face only through its core, this share of its radius: its
 * rim meets what the figure wears and holds (a brim, a collar, its own hands)
 * and what stands beside it.
 */
const FACE_CORE = 0.7;

/** How far `p` is from the polyline `points`. */
const distanceTo = (points: ReadonlyArray<Point>, p: Point): number =>
  Arr.match(points, {
    onEmpty: () => Number.POSITIVE_INFINITY,
    onNonEmpty: (all) =>
      Math.min(
        Math.hypot(...sub(Arr.headNonEmpty(all), p)),
        ...all
          .slice(1)
          .map((b, i) => Math.hypot(...sub(nearestOnSegment(Arr.getUnsafe(all, i), b, p), p))),
      ),
  });

/** The frame a film draws, in canvas pixels. */
export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A face the viewer sees: its scene's own (`scene`, the scene the frame
 * shows), mostly opaque, and centred on the frame. The one rule for a seen
 * face: `FaceSmall` measures only these, and `InkOverFace` judges only these.
 */
export const seenFace = (f: FaceMark, scene: string, frame: FrameSize) =>
  f.scene === scene &&
  f.alpha > 0.5 &&
  f.x >= 0 &&
  f.x <= frame.width &&
  f.y >= 0 &&
  f.y <= frame.height;

/**
 * Ink and text drawn over a face (`InkOverFace`): for each face the viewer
 * sees (`seenFace` on `frame`), the visible strokes and lines of text of its scene drawn after it (the kit
 * declares a face once its person is drawn, so its own features, headwear and
 * hands come before) that run through its core (`FACE_CORE` of its radius). A
 * stroke that `marks` a line on purpose, the caption line, and fills and
 * plates (a figure or a card staged in front) are not read; a gradient glow
 * is invisible to the probe.
 */
export const inkOverFace = (
  sample: Sample,
  probed: Probed,
  frame: FrameSize,
): ReadonlyArray<InkOverFace> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const faces = Option.getOrElse(Option.fromUndefinedOr(probed.faces), () => []);
  return faces
    .filter((face) => seenFace(face, sample.scene, frame))
    .flatMap((face) => {
      const centre: Point = [face.x, face.y];
      const core = (face.size / 2) * FACE_CORE;
      const after = (mark: { readonly scene: string; readonly order: number }) =>
        mark.scene === face.scene && mark.order >= face.order;
      const strokes = probed.inks.filter(
        (m) =>
          m.kind === 'stroke' &&
          m.alpha > VISIBLE_ALPHA &&
          after(m) &&
          Option.isNone(Option.fromUndefinedOr(m.marks)) &&
          distanceTo(m.points, centre) <= core + m.width / 2,
      );
      const texts = probed.texts.filter(
        (t) =>
          visible(t) &&
          after(t) &&
          t.caption !== true &&
          Math.hypot(...sub(nearestIn(t.corners, centre), centre)) <= core,
      );
      if (strokes.length === 0 && texts.length === 0) return [];
      return [
        InkOverFace.make({
          ...where,
          x: face.x,
          y: face.y,
          size: face.size,
          strokes: strokes.length,
          texts: Arr.dedupe(texts.map((t) => t.text)),
        }),
      ];
    });
};

/** The plate under a line of text: the topmost fill or plate under its centre, drawn before it. */
const plateUnder = (probed: Probed, text: TextBox) => {
  const centre: Point = [text.x + text.w / 2, text.y + text.h / 2];
  return Arr.last(
    probed.inks.filter(
      (m) =>
        m.kind !== 'stroke' &&
        m.alpha > VISIBLE_ALPHA &&
        m.order < text.order &&
        insidePolygon(m.points, centre),
    ),
  );
};

/** A plate at least this share of the frame wide and high is a backdrop, and may bleed. */
const BACKDROP = 0.5;
/** How far a plate may drift between two frames and still be at rest. */
const AT_REST = 1;

/**
 * Plates cut off by the frame: a line of text, wholly inside the frame, whose
 * plate (the topmost fill under its centre, drawn before it) reaches past an
 * edge by more than the tolerance and sits still there (`next`, the following
 * frame, has the same line on the same plate). Two kinds of plate bleed off it
 * by design: one at least half the frame wide and half its height, a backdrop
 * or a panel (a sky, a split page), and a band that runs past both opposite
 * edges (a stripe of sky across the frame), whose ends are never meant to
 * show; a banner that is only tall, or only wide, and cut by one edge, is a
 * plate like any other. A line that is past an edge itself, or wholly off
 * the frame (it shows nothing), or a plate still moving, is entering or
 * leaving.
 */
export const platesOffFrame = (
  sample: Sample,
  probed: Probed,
  size: FrameSize,
  next: Probed = probed,
): ReadonlyArray<PlateOffFrame> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const still = (plate: InkMark, text: TextBox) =>
    Arr.some(next.texts, (later) => {
      if (later.text !== text.text) return false;
      return Option.match(plateUnder(next, later), {
        onNone: () => false,
        onSome: (moved) =>
          Math.max(
            Math.abs(moved.x - plate.x),
            Math.abs(moved.y - plate.y),
            Math.abs(moved.w - plate.w),
            Math.abs(moved.h - plate.h),
          ) <= AT_REST,
      });
    });
  return probed.texts.filter(visible).flatMap((text) => {
    if (offFrame(text, size.width, size.height)) return [];
    const inside = pastFrame(text, size.width, size.height);
    if (Math.max(inside.left, inside.top, inside.right, inside.bottom) > 0) return [];
    return Option.match(plateUnder(probed, text), {
      onNone: () => [],
      onSome: (plate) => {
        if (plate.w >= size.width * BACKDROP && plate.h >= size.height * BACKDROP) return [];
        const past = pastFrame(plate, size.width, size.height);
        if (Math.max(past.left, past.top, past.right, past.bottom) <= OVERLAP_TOLERANCE) return [];
        const across = past.left > OVERLAP_TOLERANCE && past.right > OVERLAP_TOLERANCE;
        const down = past.top > OVERLAP_TOLERANCE && past.bottom > OVERLAP_TOLERANCE;
        if (across || down) return [];
        if (!still(plate, text)) return [];
        return [PlateOffFrame.make({ ...where, text: text.text, ...past })];
      },
    });
  });
};

/** How far box `a` reaches past each side of box `b` (0 where it does not). */
const pastBox = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
) => ({
  left: Math.max(0, b.x - a.x),
  top: Math.max(0, b.y - a.y),
  right: Math.max(0, a.x + a.w - (b.x + b.w)),
  bottom: Math.max(0, a.y + a.h - (b.y + b.h)),
});

/**
 * Text running off its plate: a visible line drawn on a declared plate
 * (`probePlate`, so it carries the plate's `order` as `on`) whose box, pulled
 * in by the tolerance, leaves the plate's box, as a brief overrunning its card
 * would. Only a declared plate counts: text over scenery (a sky, a pillar, a
 * coin) has no plate to run off.
 */
const textsOffPlate = (sample: Sample, probed: Probed): ReadonlyArray<TextOffPlate> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const plates = new Map(probed.texts.map((t) => [t.order, t] as const));
  return probed.texts.filter(visible).flatMap((text) =>
    Option.match(
      Option.flatMap(Option.fromUndefinedOr(text.on), (on) =>
        Option.fromUndefinedOr(plates.get(on)),
      ),
      {
        onNone: () => [],
        onSome: (plate) => {
          const inner = Option.getOrElse(
            inset(text.corners, OVERLAP_TOLERANCE),
            () => text.corners,
          );
          if (inner.every((corner) => insidePolygon(plate.corners, corner))) return [];
          return [TextOffPlate.make({ ...where, text: text.text, ...pastBox(text, plate) })];
        },
      },
    ),
  );
};

/** Whether one box is the plate the other line sits on (`probePlate`): they never collide. */
const carries = (a: TextBox, b: TextBox) => a.on === b.order || b.on === a.order;

/**
 * The layout findings in one probed frame; `next` is the frame after it, which
 * tells a plate at rest from one on its way in or out (the frame itself when
 * there is none).
 */
export const frameFindings = (
  sample: Sample,
  probed: Probed,
  size: FrameSize,
  next: Probed = probed,
): ReadonlyArray<FrameFinding> => {
  const shown = probed.texts.filter(visible);
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const overlaps = shown.flatMap((a, i) =>
    shown.slice(i + 1).flatMap((b) => {
      if (a.text === b.text || carries(a, b)) return [];
      const area = overlapArea(a, b);
      if (area <= 0) return [];
      const [first, second] = Arr.sort([a.text, b.text], Order.String);
      return [TextOverlap.make({ ...where, a: first ?? a.text, b: second ?? b.text, area })];
    }),
  );
  const off = shown.flatMap((box) => {
    const past = pastFrame(box, size.width, size.height);
    if (past.left + past.top + past.right + past.bottom <= 0) return [];
    return [TextOffFrame.make({ ...where, text: box.text, ...past })];
  });
  return [
    ...overlaps,
    ...off,
    ...inkOverText(sample, probed),
    ...platesOffFrame(sample, probed, size, next),
    ...textsOffPlate(sample, probed),
  ];
};

const matchFinding = Match.type<FrameFinding>();

const keyOf = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => `overlap\u0000${f.scene}\u0000${f.a}\u0000${f.b}`,
    TextOffFrame: (f) => `off\u0000${f.scene}\u0000${f.text}`,
    InkOverText: (f) => `ink\u0000${f.scene}\u0000${f.text}`,
    PlateOffFrame: (f) => `plate\u0000${f.scene}\u0000${f.text}`,
    TextOffPlate: (f) => `offplate\u0000${f.scene}\u0000${f.text}`,
  }),
);

const edges = (f: { left: number; top: number; right: number; bottom: number }) =>
  f.left + f.top + f.right + f.bottom;

const size = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => f.area,
    InkOverText: (f) => f.length,
    TextOffFrame: edges,
    PlateOffFrame: edges,
    TextOffPlate: edges,
  }),
);

const withFrames = (f: FrameFinding, frames: number): FrameFinding => {
  const where = { scene: f.scene, time: f.time, at: f.at, frames };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      TextOverlap: (o): FrameFinding =>
        TextOverlap.make({ ...where, a: o.a, b: o.b, area: o.area }),
      InkOverText: (o): FrameFinding =>
        InkOverText.make({
          ...where,
          text: o.text,
          strokes: o.strokes,
          length: o.length,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
        }),
      TextOffFrame: (o): FrameFinding =>
        TextOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      PlateOffFrame: (o): FrameFinding =>
        PlateOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      TextOffPlate: (o): FrameFinding =>
        TextOffPlate.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
    }),
  )(f);
};

/**
 * One finding per scene and pair of texts (or per text off the frame): the
 * sampled frame where it is worst, with how many sampled frames show it.
 */
export const mergeFindings = (
  findings: ReadonlyArray<FrameFinding>,
): ReadonlyArray<FrameFinding> => {
  const merged = new Map<string, FrameFinding>();
  for (const f of findings) {
    const key = keyOf(f);
    const seen = Option.fromNullishOr(merged.get(key));
    const frames = Option.match(seen, { onNone: () => 0, onSome: (s) => s.frames }) + f.frames;
    const worst = Option.match(seen, {
      onNone: () => f,
      onSome: (s) => {
        if (size(f) > size(s)) return f;
        return s;
      },
    });
    merged.set(key, withFrames(worst, frames));
  }
  return [...merged.values()];
};

// ---------------------------------------------------------------------------
// Holds

/**
 * The longest a drawn scene may hold still while its voice speaks: past it
 * the viewer waits on the picture (the `exchange` opening held about 6 s).
 */
export const HOLD = 4;
/**
 * How far a mark's box may move between two probed frames, in the units of
 * the space it was drawn in (its screen drift over its `scale`), and still be
 * at rest: what one boil tick moves a default stroke's box edge at most, twice
 * its jitter. It is the only boil the probe sees: type records its box from the
 * unjittered glyphs, and a cutout the shape it was given, not its torn edge.
 */
export const STILL_DRIFT = 2 * STROKE_JITTER;
/** How far a mark's opacity may change and still be at rest. */
const STILL_FADE = 0.02;

/**
 * A stretch where the voice speaks and nothing is declared to move: no cue
 * of the scene starts, ends or runs, and the scene is not arriving. `from`
 * and `to` are film seconds.
 */
export interface HoldCandidate {
  readonly scene: string;
  readonly from: number;
  readonly to: number;
}

/** Scene-local spans in which the scene declares motion: each cue, and its entering transition. */
const busySpans = (p: Placed): ReadonlyArray<Interval> => {
  const cues = [...p.cues.values()].map((c): Interval => ({ from: c.start, to: c.end }));
  // The first scene has nothing to arrive from.
  const arriving = Math.min(p.index, 1) * transitionDur(p.spec.enter);
  if (arriving <= 0) return cues;
  return [{ from: 0, to: arriving }, ...cues];
};

/** Scene-local: from the first word's start to the last word's end. */
const spokenSpan = (p: Placed): Option.Option<Interval> =>
  Option.zipWith(Arr.head(p.voice.words), Arr.last(p.voice.words), (first, last): Interval => ({
    from: p.speechStart + first.start,
    to: p.speechStart + last.end,
  }));

/** The parts of `within` that no span of `busy` covers. */
const gapsIn = (within: Interval, busy: ReadonlyArray<Interval>): ReadonlyArray<Interval> => {
  const sorted = Arr.sort(
    busy,
    Order.mapInput(Order.Number, (s: Interval) => s.from),
  );
  const swept = sorted.reduce<{ readonly gaps: ReadonlyArray<Interval>; readonly at: number }>(
    ({ gaps, at }, span) => {
      const until = Math.min(span.from, within.to);
      const next = Math.max(at, span.to);
      if (until > at) return { gaps: [...gaps, { from: at, to: until }], at: next };
      return { gaps, at: next };
    },
    { gaps: [], at: within.from },
  );
  if (swept.at >= within.to) return swept.gaps;
  return [...swept.gaps, { from: swept.at, to: within.to }];
};

/**
 * The static leg of `StaticHold`: in each drawn scene (a storyboard card holds
 * still by design), the stretches over `HOLD` inside the voice's spoken span
 * that no cue and no entrance covers. The layout leg probes each one to tell
 * a still picture from motion no cue declares (a walk loop, drifting snow).
 */
export const holdCandidates = (placed: ReadonlyArray<Placed>): ReadonlyArray<HoldCandidate> =>
  placed.flatMap((p) => {
    if (p.spec.storyboard === true) return [];
    return Option.match(spokenSpan(p), {
      onNone: () => [],
      onSome: (spoken) => {
        const gaps = gapsIn(spoken, busySpans(p)).filter(
          (g) => g.to - g.from > HOLD + CLOCK_EPSILON,
        );
        return gaps.map((g) => ({ scene: p.spec.id, from: p.start + g.from, to: p.start + g.to }));
      },
    });
  });

/**
 * The frames across a candidate the layout leg may probe: one per boil tick,
 * from its first frame to its last. Nothing faster than the boil can be told
 * from it, and a sway slower than it is sampled at more than one phase.
 */
export const holdTicks = (hold: Interval, fps: number): ReadonlyArray<number> => {
  const first = Math.ceil(hold.from * fps - 1e-6);
  const last = Math.ceil(hold.to * fps - 1e-6) - 1;
  const per = fps / BOIL_FPS;
  const ticks = Arr.range(0, Math.floor((last - first) / per)).map(
    (k) => first + Math.round(k * per),
  );
  return Arr.dedupe([...ticks, last]).filter((f) => f >= first && f <= last);
};

/**
 * The ticks the layout leg probes first: one every `HOLD / 2`, and the last.
 * A still run over `HOLD` spans two of them in a row, so only where two in a
 * row hold still does it probe the ticks around them.
 */
export const holdGrid = (ticks: ReadonlyArray<number>): ReadonlyArray<number> => {
  const step = Math.round((HOLD / 2) * BOIL_FPS);
  return Arr.dedupe([
    ...ticks.filter((_, i) => i % step === 0),
    ...Option.toArray(Arr.last(ticks)),
  ]);
};

/**
 * The film seconds a still run covers, from its first still tick `lo` to its
 * last `hi`: a run that reaches the candidate's first or last tick covers it
 * to its edge.
 */
export const stillSpan = (
  hold: Interval,
  ticks: ReadonlyArray<number>,
  lo: number,
  hi: number,
  fps: number,
): Interval => {
  const edge = (end: Option.Option<number>, tick: number, whole: number) => {
    if (Option.exists(end, (f) => f === tick)) return whole;
    return tick / fps;
  };
  return { from: edge(Arr.head(ticks), lo, hold.from), to: edge(Arr.last(ticks), hi, hold.to) };
};

type Mark = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: number;
  readonly scale: number;
};

/** Float noise on a box's edges (an edge is a sum, `x + w`), in the box's units, not seconds. */
const BOX_NOISE = 1e-9;

/** A mark's box moved no more than `STILL_DRIFT` of its own units, and it faded no more than `STILL_FADE`. */
const boxAtRest = (a: Mark, b: Mark) =>
  Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.w - (b.x + b.w)),
    Math.abs(a.y + a.h - (b.y + b.h)),
  ) <=
    STILL_DRIFT * Math.min(a.scale, b.scale) + BOX_NOISE &&
  Math.abs(a.alpha - b.alpha) <= STILL_FADE;

/** The picture in a probed frame: everything but the caption line and its plate, which are the voice. */
const pictureOf = (probed: Probed): Probed => ({
  texts: probed.texts.filter((t) => t.caption !== true),
  inks: probed.inks.filter((m) => m.caption !== true),
});

/** Two pictures draw the same marks, in the same order, each where and as strong as it was. */
const atRest = (a: Probed, b: Probed) =>
  a.texts.length === b.texts.length &&
  a.inks.length === b.inks.length &&
  Arr.zip(a.texts, b.texts).every(([s, t]) => s.text === t.text && boxAtRest(s, t)) &&
  Arr.zip(a.inks, b.inks).every(([m, n]) => m.kind === n.kind && boxAtRest(m, n));

/**
 * Whether probed frames hold still: each frame's picture (the caption left
 * out) at rest against the first's, so a slow drift adds up and is seen.
 */
export const heldStill = (frames: ReadonlyArray<Probed>): boolean => {
  const pictures = frames.map(pictureOf);
  return Option.match(Arr.head(pictures), {
    onNone: () => true,
    onSome: (first) => pictures.slice(1).every((p) => atRest(first, p)),
  });
};
