// The lab's edit routes faked over the probe film's first version, as the
// studio's edit cases and the touch guards' receipt case read them: each
// move or hold lands as a change on the film's history, Undo and Redo step
// the newest (one asked for another change is refused, as the lab refuses
// it), and the version's timeline is laid again from its script as each
// change leaves it: the beats end to end in their order, each sized by the
// layout's own rule (`beatLength`) from a fixed table of its words, its
// marks and Board panels on its words. The page's preview (`ripple.ts`) is
// never what the fake answers, so a case sees the page agree with the read.
// An agent's change can land between the page's (`agent`), and the
// timeline's reads can be held (`holdReads`) to open the window between a
// write and its read.

import {
  Array as Arr,
  Boolean as Bool,
  Deferred,
  Effect,
  Exit,
  Match,
  Option,
  Schema,
} from 'effect';
import {
  AGENTS_AFTER,
  type HoldEdge,
  type MovedBefore,
  heldWords,
  movedOrder,
  movedWords,
  stepped,
} from '../../../src/core/beat-edit.ts';
import { DEFAULT_TAIL, MIN_LEAD, beatLength } from '../../../src/core/layout.ts';
import {
  RedoUnavailable,
  StepNotNewest,
  UndoUnavailable,
  newerFirst,
} from '../../../src/core/refusals.ts';
import { onTheMs } from '../../../src/core/time.ts';
import type { BoardClip, FilmTimeline, Lane } from '../../../src/core/timeline-schema.ts';
import { scriptOf } from '../../../src/lab/film-studio/ripple.ts';
import {
  type FakeRoute,
  type Json,
  json,
  later,
  madeBy,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { probeTimeline } from '../../../src/lab/fixtures/probe-timeline.ts';
import { holdTarget, moveTarget } from '../../../src/tools/script-source.ts';

/** What the page sends the edit and note routes, as these fakes read it. */
export const Sent = Schema.Struct({
  beat: Schema.optionalKey(Schema.String),
  before: Schema.optionalKey(Schema.String),
  edge: Schema.optionalKey(Schema.Literals(['lead', 'tail'])),
  seconds: Schema.optionalKey(Schema.Finite),
  change: Schema.optionalKey(Schema.String),
  scene: Schema.optionalKey(Schema.String),
  T: Schema.optionalKey(Schema.Finite),
  frame: Schema.optionalKey(Schema.Finite),
  text: Schema.optionalKey(Schema.String),
  still: Schema.optionalKey(Schema.Json),
  sketch: Schema.optionalKey(Schema.Array(Schema.Json)),
});
export type Sent = typeof Sent.Type;

/** A request's body as `Sent`: empty when it has none or is not one. */
export const sentOf = (body: Option.Option<Json>): Sent =>
  Option.getOrElse(
    Option.flatMap(body, (b) => Schema.decodeUnknownOption(Sent)(b)),
    (): Sent => ({}),
  );

/** The probe film's first version as its script lays it: each beat's words (seconds) and its marks, seconds into its words. */
const WORDS: ReadonlyMap<
  string,
  { readonly words: number; readonly marks: ReadonlyMap<string, number> }
> = new Map([
  [
    'one',
    {
      words: 4.115,
      marks: new Map([
        ['rise', 0.7],
        ['fall', 2.1],
      ]),
    },
  ],
  ['two', { words: 2.945, marks: new Map() }],
  ['three', { words: 3.455, marks: new Map() }],
]);

/** The version's script as the fake keeps it: its beats in order, and the holds each declares. */
type Holds = Partial<Record<HoldEdge, number>>;

interface Script {
  readonly order: ReadonlyArray<string>;
  readonly holds: ReadonlyMap<string, Holds>;
}

const FIRST: Script = { order: ['one', 'two', 'three'], holds: new Map() };

/** A beat as `script` lays it. */
interface Laid {
  readonly beat: string;
  readonly start: number;
  readonly dur: number;
  readonly lead: number;
  readonly tail: number;
  readonly words: number;
  readonly marks: ReadonlyMap<string, number>;
  readonly declared: ReadonlyArray<HoldEdge>;
}

/** The beats of `script` end to end, each sized by the layout's own rule. */
const laidOut = (script: Script): ReadonlyArray<Laid> => {
  let at = 0;
  return script.order.flatMap((beat) =>
    Option.match(Option.fromUndefinedOr(WORDS.get(beat)), {
      onNone: () => [],
      onSome: ({ words, marks }) => {
        const holds = Option.getOrElse(
          Option.fromUndefinedOr(script.holds.get(beat)),
          (): Holds => ({}),
        );
        const lead = Option.getOrElse(Option.fromUndefinedOr(holds.lead), () => MIN_LEAD);
        const tail = Option.getOrElse(Option.fromUndefinedOr(holds.tail), () => DEFAULT_TAIL);
        const dur = onTheMs(beatLength({ words, lead, tail, min: 0 }));
        const start = at;
        at = onTheMs(at + dur);
        const declared = (['lead', 'tail'] as const).filter((edge) =>
          Option.isSome(Option.fromUndefinedOr(holds[edge])),
        );
        return [{ beat, start, dur, lead, tail, words, marks, declared }];
      },
    }),
  );
};

/** The first version's Board panels, each on its beat's start or its mark. */
const PANELS: ReadonlyArray<BoardClip> = probeTimeline(1).lanes.flatMap((lane) =>
  Match.value(lane).pipe(
    Match.when({ track: 'board' }, (l) => l.clips),
    Match.orElse(() => []),
  ),
);

/** The first version's timeline with `script` laid out: its Script, Board and voice lanes, its acts on their beats. */
const timelineOf = (script: Script): FilmTimeline => {
  const beats = laidOut(script);
  const duration = onTheMs(beats.reduce((end, b) => b.start + b.dur, 0));
  const named = new Map(beats.map((b) => [b.beat, b]));
  const wordsAt = (b: Laid) => onTheMs(b.start + b.lead);
  const scriptLane: Lane = {
    track: 'script',
    clips: beats.map((b) => ({
      state: 'made',
      clock: 'measured',
      beat: b.beat,
      start: b.start,
      dur: b.dur,
      speech: { start: wordsAt(b), end: onTheMs(wordsAt(b) + b.words) },
      marks: [...b.marks].map(([name, at]) => ({ name, at: onTheMs(wordsAt(b) + at) })),
      hold: { lead: b.lead, tail: b.tail, declared: b.declared, asked: b.tail, min: 0 },
    })),
  };
  const boardLane: Lane = {
    track: 'board',
    clips: beats.flatMap((b) => {
      const panels = PANELS.filter((p) => p.beat === b.beat).map((p) => ({
        panel: p,
        at: Option.getOrElse(
          Option.map(Option.fromUndefinedOr(b.marks.get(p.mark)), (m) => onTheMs(wordsAt(b) + m)),
          () => b.start,
        ),
      }));
      return panels.map(({ panel, at }, i) => ({
        ...panel,
        start: at,
        markAt: at,
        dur: onTheMs(
          Option.getOrElse(
            Option.map(Arr.get(panels, i + 1), (next) => next.at),
            () => b.start + b.dur,
          ) - at,
        ),
      }));
    }),
  };
  const voiceLane: Lane = {
    track: 'voice',
    clips: beats.map((b) => ({
      state: 'made',
      clock: 'measured',
      beat: b.beat,
      start: wordsAt(b),
      dur: b.words,
      source: 'staging',
    })),
  };
  const first = probeTimeline(1);
  const bands = first.bands
    .map((band) => ({
      ...band,
      start: Option.getOrElse(
        Option.map(Option.fromUndefinedOr(named.get(band.from)), (b) => b.start),
        () => band.start,
      ),
    }))
    .toSorted((a, b) => a.start - b.start);
  return {
    ...first,
    duration,
    bands: bands.map((band, i) => ({
      ...band,
      end: Option.getOrElse(
        Option.map(Arr.get(bands, i + 1), (next) => next.start),
        () => duration,
      ),
    })),
    lanes: [scriptLane, boardLane, voiceLane],
  };
};

/** One change on the fake's history: its id, what it set (the step's `target`), what it said, and the script it leaves. */
interface Change {
  readonly id: string;
  readonly target: string;
  readonly said: string;
  readonly apply: (script: Script) => Script;
}

/** `script` with `beat` moved before `before`, as the lab writes it. */
const moved =
  (beat: string, before: MovedBefore) =>
  (script: Script): Script => ({
    ...script,
    order: Option.getOrElse(
      Option.getSuccess(movedOrder(script.order, beat, before)),
      () => script.order,
    ),
  });

/** `script` with `beat`'s `edge` held `seconds`, as the lab writes it. */
const held =
  (beat: string, edge: HoldEdge, seconds: number) =>
  (script: Script): Script => ({
    ...script,
    holds: new Map([
      ...script.holds,
      [
        beat,
        {
          ...Option.getOrElse(Option.fromUndefinedOr(script.holds.get(beat)), (): Holds => ({})),
          [edge]: seconds,
        },
      ],
    ]),
  });

/**
 * The lab's edit routes over the first version, and the case's hands on
 * them: `now` the timeline as the lab reads it, `agent` a hold an agent
 * makes through its tool (a change on the same history), and `holdReads`
 * the timeline's reads held until the effect it answers runs.
 */
export const editsLab = () => {
  let done: ReadonlyArray<Change> = [];
  let undone: ReadonlyArray<Change> = [];
  let made = 0;
  let gate = Option.none<Deferred.Deferred<void>>();
  const now = (): FilmTimeline => timelineOf(done.reduce((s, c) => c.apply(s), FIRST));
  const stepOf = (c: Change) => ({ file: 'v1/script.ts', target: c.target, change: c.id });
  const steps = () => ({
    ...Option.match(Arr.last(done), {
      onNone: () => ({}),
      onSome: (c) => ({ undo: stepOf(c), latest: stepOf(c) }),
    }),
    ...Option.match(Arr.last(undone), {
      onNone: () => ({}),
      onSome: (c) => ({ redo: stepOf(c) }),
    }),
  });
  const land = (target: string, said: string, apply: Change['apply']) => {
    made += 1;
    const change = { id: `c${made}`, target, said, apply };
    done = [...done, change];
    undone = [];
    return change;
  };
  const landed = (target: string, said: string, apply: Change['apply']) =>
    json({
      change: land(target, said, apply).id,
      target,
      said: `${said} ${AGENTS_AFTER}`,
      steps: steps(),
    });
  /** The hold `seconds` of `beat`'s `edge` lands, said from where it stood. */
  const hold = (beat: string, edge: HoldEdge, seconds: number) => {
    const from = Option.getOrElse(
      Option.map(
        Option.fromUndefinedOr(scriptOf(now()).find((b) => b.beat === beat)),
        (b) => b.hold[edge],
      ),
      () => 0,
    );
    return [
      holdTarget(beat, edge),
      heldWords(beat, edge, from, seconds),
      held(beat, edge, seconds),
    ] as const;
  };
  const step = (verb: 'undo' | 'redo', asked: Option.Option<string>) => {
    const undoing = verb === 'undo';
    const from = Bool.match(undoing, { onTrue: () => done, onFalse: () => undone });
    return Option.match(Arr.last(from), {
      onNone: () =>
        refused(
          Bool.match(undoing, {
            onTrue: () => UndoUnavailable.make({ reason: 'the lab has no change to probe' }),
            onFalse: () =>
              RedoUnavailable.make({ reason: 'the lab has undone no change to probe' }),
          }),
        ),
      onSome: (c) =>
        Option.match(
          Option.filter(asked, (id) => id !== c.id),
          {
            // Asked for another change while this one stands before it: refused, as the lab does.
            onSome: () => refused(StepNotNewest.make({ verb, reason: newerFirst(verb, c.target) })),
            onNone: () => {
              const rest = from.slice(0, -1);
              Bool.match(undoing, {
                onTrue: () => {
                  done = rest;
                  undone = [...undone, c];
                },
                onFalse: () => {
                  undone = rest;
                  done = [...done, c];
                },
              });
              return json({
                change: c.id,
                target: `${verb} ${c.target}`,
                said: stepped(verb, c.said),
                steps: steps(),
              });
            },
          },
        ),
    });
  };
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/timeline(\?|$)/, () => {
      const read = madeBy(Effect.sync(() => json(now())));
      return Option.match(gate, { onNone: () => read, onSome: (g) => later(g, read) });
    }),
    route('GET', /^\/steps$/, () => json(steps())),
    route('POST', /^\/beats\/move$/, (asked) => {
      const sent = sentOf(asked.body);
      const beat = sent.beat ?? '';
      const before = Option.fromUndefinedOr(sent.before);
      return landed(moveTarget(beat, before), movedWords(beat, before), moved(beat, before));
    }),
    route('POST', /^\/beats\/hold$/, (asked) => {
      const sent = sentOf(asked.body);
      return landed(...hold(sent.beat ?? '', sent.edge ?? 'tail', sent.seconds ?? 0));
    }),
    route('POST', /^\/edits\/undo$/, (asked) =>
      step('undo', Option.fromUndefinedOr(sentOf(asked.body).change)),
    ),
    route('POST', /^\/edits\/redo$/, (asked) =>
      step('redo', Option.fromUndefinedOr(sentOf(asked.body).change)),
    ),
  ];
  return {
    routes,
    now,
    /** An agent holds `beat`'s `edge` through its tool: a change on the same history, which the page does not see. */
    agent: (beat: string, edge: HoldEdge, seconds: number) =>
      Effect.sync(() => land(...hold(beat, edge, seconds)).id),
    /** The timeline's reads held from now; the effect answered lets them land. */
    holdReads: Effect.map(Deferred.make<void>(), (g) => {
      gate = Option.some(g);
      return Effect.sync(() => {
        gate = Option.none();
      }).pipe(Effect.andThen(Deferred.done(g, Exit.void)), Effect.asVoid);
    }),
  };
};

/** The lab's edit routes over the first version (`editsLab`'s), for a case that needs only them. */
export const editsKept = (): ReadonlyArray<FakeRoute> => editsLab().routes;
