// The source-edit machine, with no DOM: a press on a cue grabs it and pauses
// the film; moves preview the drag; a release that changed something writes,
// holding `#t=` for the reload, and one that did not puts the preview back.
// Fields and Undo commit straight from rest. One write at a time: a press or
// a step while a write is out is not taken, and a commit waits (shown),
// joined onto one for the same thing (its fields merged) or after the rest,
// each written in turn once the write before it lands. A write lands (Written, with
// the server's findings) or is refused (Refused, the server's text), and a
// refusal lets `#t=` go and puts the preview back.

import {
  Array as Arr,
  Deferred,
  Effect,
  Exit,
  Layer,
  Match,
  Option,
  Predicate,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Machine, assertNeverReaches, assertPath, simulate } from 'effect-machine';
import type { SceneEdit } from '../../canvas/film.ts';
import { ChangeId, type CheckReport, type LabWrite, RequestId } from '../../core/schema.ts';
import { STUDIO_IMPORT_WAIT_S } from '../../core/studio.ts';
import { SourceChanged } from '../../core/refusals.ts';
import { LabApi, type LabCalls, type LabFailure } from '../api.ts';
import { NotPreviewed, Stage, type StageOps } from '../stage.ts';
import {
  type CueGrip,
  CueWrite,
  type KnobGrip,
  KnobWrite,
  StepWrite,
  cueSaidText,
} from './grip.ts';
import { EditEvent, EditState, WRITE_TIMEOUT_S, editMachine } from './machine.ts';

const grip: CueGrip = {
  _tag: 'CueGrip',
  scene: 'one',
  cue: 'rise',
  edge: 'move',
  x0: 500,
  perSec: 100,
  fps: 30,
  span: { mark: 'rise', dur: 0.6 },
  timeline: { rise: { mark: 'rise', dur: 0.6 } },
  cue0: { start: 1, end: 1.6, dur: 0.6, ease: 'inOutCubic', stagger: 0 },
  targets: [],
};

const at = (x: number) => EditEvent.Move({ pointer: { x, y: 0, free: false } });

/** A page's first Undo request, and the change the lab's first write made, by their ids. */
const UNDO_1 = RequestId.make('undo-1');
const CHANGE_1 = ChangeId.make('change-1');

const landed: LabWrite = {
  scene: 'one',
  file: 'scenes/one.ts',
  target: 'cue rise offset',
  change: CHANGE_1,
  findings: [{ level: 'warning', tag: 'late', message: 'rise ends after the scene' }],
};

/**
 * A stage that says what was asked of it (scene `bad` cannot be previewed),
 * and an API whose every write answers `write`.
 */
const fakes = (
  write: Effect.Effect<LabWrite, LabFailure> = Effect.succeed(landed),
  /** What the lab's check reports: its latest change, and what Undo and Redo would do. */
  check: Effect.Effect<CheckReport, LabFailure> = Effect.die('not asked'),
  /** Calls answered otherwise. */
  more: Partial<LabCalls> = {},
) => {
  const log: Array<string> = [];
  const keys = (edit: SceneEdit) => Object.keys({ ...edit.timeline, ...edit.knobs }).join(',');
  const stage: StageOps = {
    preview: (scene, edit) =>
      Effect.suspend(() => {
        if (scene === 'bad')
          return Effect.fail(NotPreviewed.make({ scene, reason: 'no mark {x}' }));
        log.push(`preview ${scene} ${keys(edit)}`);
        return Effect.void;
      }),
    unpreview: (scene) => Effect.sync(() => log.push(`unpreview ${scene}`)),
    timelineOf: () => ({}),
    knobsOf: () => ({}),
    cuesOf: () => new Map(),
    holdT: Effect.sync(() => log.push('holdT')),
    reload: Effect.sync(() => log.push('reload')),
    settle: Effect.sync(() => log.push('settle')),
    pause: Effect.sync(() => log.push('pause')),
    duration: 10,
    cueSpan: () => Option.none(),
    playFrom: () => Effect.void,
    still: () => Effect.die('not asked'),
  };
  const api: LabCalls = {
    source: () => Effect.die('not asked'),
    head: () => Effect.die('not asked'),
    check,
    writeCue: () => write,
    writeKnob: () => write,
    step: () => write,
    ...more,
  };
  return { log, layer: Layer.merge(Layer.succeed(Stage, stage), Layer.succeed(LabApi, api)) };
};

const cueWrite = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } });

describe('a drag on the strip', () => {
  it.effect('a press pauses, and a release that moved nothing writes nothing', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        editMachine,
        [EditEvent.Press({ grip }), EditEvent.Release],
        ['Idle', 'Pressed', 'Idle'],
      );
      expect(log).toEqual(['pause']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('moves preview the drag; its release writes and holds #t=', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Press({ grip }),
        at(520),
        at(530),
        EditEvent.Release,
      ]);
      expect(result.states.map((s) => s._tag)).toEqual([
        'Idle',
        'Pressed',
        'Dragging',
        'Dragging',
        'Writing',
      ]);
      expect(result.states[2]).toMatchObject({ write: Option.some(cueWrite) });
      expect(result.finalState).toEqual(
        EditState.Writing({
          write: CueWrite.make({
            scene: 'one',
            cue: 'rise',
            patch: { offset: 0.3 },
            said: { offset: { before: '0', after: '0.3', unit: 's' } },
          }),
          next: [],
        }),
      );
      expect(log).toEqual(['pause', 'preview one rise', 'preview one rise', 'holdT']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('dragged back where it began, the release puts the preview back', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        editMachine,
        [EditEvent.Press({ grip }), at(520), at(500), EditEvent.Release],
        ['Idle', 'Pressed', 'Dragging', 'Dragging', 'Idle'],
      );
      expect(log.at(-1)).toBe('unpreview one');
    }).pipe(Effect.provide(layer));
  });

  it.effect('a cancel puts the preview back and writes nothing', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertNeverReaches(
        editMachine,
        [EditEvent.Press({ grip }), at(520), EditEvent.Cancel],
        'Writing',
      );
      expect(log).toEqual(['pause', 'preview one rise', 'unpreview one']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('an edit the timeline cannot resolve says why, and the drag goes on', () =>
    Effect.gen(function* () {
      const bad = { ...grip, scene: 'bad' };
      const result = yield* simulate(editMachine, [EditEvent.Press({ grip: bad }), at(520)]);
      expect(result.finalState).toMatchObject({
        _tag: 'Dragging',
        note: 'not previewed: no mark {x}',
      });
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('a refused press says why, and a later press is taken', () =>
    Effect.gen(function* () {
      const message = 'cannot drag rise: its dur is computed in the source';
      const result = yield* simulate(editMachine, [
        EditEvent.Refuse({ message }),
        EditEvent.Press({ grip }),
      ]);
      expect(result.states[1]).toEqual(EditState.Refused({ message }));
      expect(result.finalState._tag).toBe('Pressed');
    }).pipe(Effect.provide(fakes().layer)),
  );
});

// A knob's handle on the frame goes through the same machine: a press grabs
// it, moves preview the knobs, the release writes the knob. A camera's target
// under a pushed-in camera drags the picture: right moves the target left.
describe('a drag of a knob handle', () => {
  const knobGrip: KnobGrip = {
    _tag: 'KnobGrip',
    scene: 'three',
    knob: 'face',
    mode: 'picture',
    from: [400, 200],
    m: [2, 0, 0, 2, -480, -220],
    inv: [0.5, 0, 0, 0.5, 240, 110],
    frame: { left: 0, top: 0, sx: 1, sy: 1 },
    start: [320, 180],
    knobs: { face: [400, 200], faceZoom: 2 },
  };
  const to = (x: number, y: number) => EditEvent.Move({ pointer: { x, y, free: false } });

  it.effect('moves preview the knobs; the release writes the knob and holds #t=', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Press({ grip: knobGrip }),
        to(360, 180),
        EditEvent.Release,
      ]);
      expect(result.states.map((s) => s._tag)).toEqual(['Idle', 'Pressed', 'Dragging', 'Writing']);
      expect(result.finalState).toEqual(
        EditState.Writing({
          write: KnobWrite.make({
            scene: 'three',
            knob: 'face',
            value: [380, 200],
            said: 'knob face [400, 200] → [380, 200]',
          }),
          next: [],
        }),
      );
      expect(log).toEqual(['pause', 'preview three face,faceZoom', 'holdT']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('dragged back where it began, the release puts the preview back', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* assertPath(
        editMachine,
        [EditEvent.Press({ grip: knobGrip }), to(360, 180), to(320, 180), EditEvent.Release],
        ['Idle', 'Pressed', 'Dragging', 'Dragging', 'Idle'],
      );
      expect(log.at(-1)).toBe('unpreview three');
    }).pipe(Effect.provide(layer));
  });
});

describe('writes', () => {
  it.effect('a field commits from rest: previewed, #t= held, written', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const edit = { timeline: { rise: { mark: 'rise', offset: 0.2, dur: 0.6 } } };
      yield* assertPath(
        editMachine,
        [EditEvent.Commit({ write: cueWrite, edit })],
        ['Idle', 'Writing'],
      );
      expect(log).toEqual(['preview one rise', 'holdT']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a commit the timeline cannot resolve is refused before any write', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const bad = CueWrite.make({ scene: 'bad', cue: 'rise', patch: { offset: 0.2 } });
      const result = yield* simulate(editMachine, [
        EditEvent.Commit({ write: bad, edit: { timeline: {} } }),
      ]);
      expect(result.finalState).toEqual(
        EditState.Refused({ message: 'not previewed: no mark {x}' }),
      );
      expect(log).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('undo writes with no preview', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Step({ verb: 'undo', request: UNDO_1, change: Option.none() }),
      ]);
      expect(result.finalState).toEqual(
        EditState.Writing({
          write: StepWrite.make({ verb: 'undo', request: UNDO_1, change: Option.none() }),
          next: [],
        }),
      );
      expect(log).toEqual(['holdT']);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "a commit for another cue waits after the rest, whatever its fields: one cue's dur and another's untilOffset are never merged",
    () =>
      Effect.gen(function* () {
        const commit = (cue: string, patch: CueWrite['patch']) =>
          EditEvent.Commit({ write: CueWrite.make({ scene: 'one', cue, patch }), edit: {} });
        const result = yield* simulate(editMachine, [
          commit('rise', { offset: 0.2 }),
          commit('rise', { dur: 1 }),
          commit('fall', { untilOffset: 0.1 }),
        ]);
        expect(result.finalState).toEqual(
          EditState.Writing({
            write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } }),
            next: [
              { write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { dur: 1 } }), edit: {} },
              {
                write: CueWrite.make({ scene: 'one', cue: 'fall', patch: { untilOffset: 0.1 } }),
                edit: {},
              },
            ],
          }),
        );
      }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('one write at a time: a press or a step while one is out is not taken', () =>
    Effect.gen(function* () {
      const undo = StepWrite.make({ verb: 'undo', request: UNDO_1, change: Option.none() });
      const result = yield* simulate(editMachine, [
        EditEvent.Step({ verb: 'undo', request: UNDO_1, change: Option.none() }),
        EditEvent.Press({ grip }),
        EditEvent.Step({ verb: 'redo', request: RequestId.make('redo-1'), change: Option.none() }),
      ]);
      expect(result.finalState).toEqual(EditState.Writing({ write: undo, next: [] }));
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect(
    'a commit while a write is out is shown and waits, the last one asked of its field joining the one before; it is written once the write lands',
    () => {
      const { log, layer } = fakes();
      return Effect.gen(function* () {
        const nudge = (offset: number) => ({
          write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset } }),
          edit: { timeline: { rise: { mark: 'rise', offset, dur: 0.6 } } },
        });
        const result = yield* simulate(editMachine, [
          EditEvent.Commit(nudge(0.033)),
          EditEvent.Commit(nudge(0.066)),
          EditEvent.Commit(nudge(0.1)),
          EditEvent.Wrote({ result: landed }),
        ]);
        expect(result.states.map((s) => s._tag)).toEqual([
          'Idle',
          'Writing',
          'Writing',
          'Writing',
          'Writing',
        ]);
        // The last asked is the one that waits, and the one written once the first lands.
        expect(result.states[3]).toEqual(
          EditState.Writing({ write: nudge(0.033).write, next: [nudge(0.1)] }),
        );
        expect(result.finalState).toEqual(EditState.Writing({ write: nudge(0.1).write, next: [] }));
        // Each is shown as it is asked, so the next nudge moves on from it.
        expect(log).toEqual([
          'preview one rise',
          'holdT',
          'preview one rise',
          'preview one rise',
          'preview one rise',
          'holdT',
        ]);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    'a commit to another field of the cue that waits joins it: both fields are written, each as last asked',
    () =>
      Effect.gen(function* () {
        const cue = (patch: CueWrite['patch'], field: string, before: string, after: string) => ({
          write: CueWrite.make({
            scene: 'one',
            cue: 'rise',
            patch,
            said: { [field]: { before, after, unit: 's' } },
          }),
          edit: { timeline: { rise: { mark: 'rise', dur: 0.6 } } },
        });
        const result = yield* simulate(editMachine, [
          EditEvent.Commit(cue({ offset: 0.033 }, 'offset', '0', '0.033')),
          EditEvent.Commit(cue({ offset: 0.066 }, 'offset', '0.033', '0.066')),
          EditEvent.Commit(cue({ dur: 1.033 }, 'dur', '0.6', '1.033')),
          EditEvent.Commit(cue({ offset: 0.1 }, 'offset', '0.066', '0.1')),
          EditEvent.Wrote({ result: landed }),
        ]);
        // The offset last shown (0.1) is written, with the dur: neither replaces the other;
        // the offset waiting says its move from where it began waiting (0.033), not its last step's.
        expect(result.finalState).toMatchObject({
          _tag: 'Writing',
          write: {
            _tag: 'CueWrite',
            patch: { offset: 0.1, dur: 1.033 },
          },
        });
        expect(
          Match.value(result.finalState).pipe(
            Match.tag('Writing', (s) =>
              Match.value(s.write).pipe(
                Match.tag('CueWrite', cueSaidText),
                Match.orElse(() => ''),
              ),
            ),
            Match.orElse(() => ''),
          ),
        ).toBe('cue rise offset 0.033 → 0.1 s; cue rise dur 0.6 → 1.033 s');
      }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect(
    'a commit to another thing (a knob) while one waits waits after it: each is written in turn, none dropped',
    () =>
      Effect.gen(function* () {
        const offset = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.066 } });
        const palm = KnobWrite.make({ scene: 'one', knob: 'palm', value: 0.5 });
        const result = yield* simulate(editMachine, [
          EditEvent.Commit({ write: cueWrite, edit: {} }),
          EditEvent.Commit({ write: offset, edit: {} }),
          EditEvent.Commit({ write: palm, edit: {} }),
          EditEvent.Wrote({ result: landed }),
          EditEvent.Wrote({ result: landed }),
          EditEvent.Wrote({ result: landed }),
        ]);
        const sent = result.states.flatMap((s) => {
          if (s._tag !== 'Writing') return [];
          return [s.write];
        });
        expect(Arr.dedupeWith(sent, (a, b) => a === b)).toEqual([cueWrite, offset, palm]);
        expect(result.finalState._tag).toBe('Written');
      }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect(
    'a commit waiting on a write that is refused is not written, and the refusal says so',
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(editMachine, [
          EditEvent.Commit({ write: cueWrite, edit: {} }),
          EditEvent.Commit({ write: cueWrite, edit: {} }),
          EditEvent.Failed({ message: 'SourceChanged: stale' }),
        ]);
        expect(result.finalState).toEqual(
          EditState.Refused({
            message: 'SourceChanged: stale; the edit asked while it was out was not written',
          }),
        );
      }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect(
    'a commit waiting on an Undo is not written once it lands (it was asked of the film before the undo), and the receipt says so',
    () => {
      const { log, layer } = fakes();
      return Effect.gen(function* () {
        const result = yield* simulate(editMachine, [
          EditEvent.Step({ verb: 'undo', request: UNDO_1, change: Option.none() }),
          EditEvent.Commit({ write: cueWrite, edit: {} }),
          EditEvent.Wrote({ result: { ...landed, target: 'undo cue rise offset' } }),
        ]);
        expect(result.finalState).toMatchObject({
          _tag: 'Written',
          note: 'undid cue rise offset in scenes/one.ts; the edit asked while it was out was not written: it was asked of the film before the undo',
        });
        // What it showed is put back.
        expect(log).toEqual(['holdT', 'preview one ', 'unpreview one']);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('a write that lands says what it wrote, with its findings, undone by Undo', () =>
    Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Commit({ write: cueWrite, edit: {} }),
        EditEvent.Wrote({ result: landed }),
      ]);
      expect(result.finalState).toEqual(
        EditState.Written({
          note: 'wrote scenes/one.ts: cue rise offset',
          findings: landed.findings,
          undo: 'undo',
          // The change it made, by its id: what its receipt's Undo acts on.
          change: Option.some(CHANGE_1),
        }),
      );
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('a write that knows what it moves says it, before → after, as it lands', () =>
    Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Commit({
          write: { ...cueWrite, said: { offset: { before: '0.4', after: '0.367', unit: 's' } } },
          edit: {},
        }),
        EditEvent.Wrote({ result: landed }),
      ]);
      expect(result.finalState).toMatchObject({ note: 'cue rise offset 0.4 → 0.367 s' });
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('an Undo that lands is undone by Redo, and a Redo by Undo', () =>
    Effect.gen(function* () {
      const stepped = (verb: 'undo' | 'redo') =>
        simulate(editMachine, [
          EditEvent.Step({ verb, request: RequestId.make(`${verb}-1`), change: Option.none() }),
          EditEvent.Wrote({ result: { ...landed, target: `${verb} cue rise offset` } }),
        ]);
      expect((yield* stepped('undo')).finalState).toMatchObject({
        note: 'undid cue rise offset in scenes/one.ts',
        undo: 'redo',
      });
      expect((yield* stepped('redo')).finalState).toMatchObject({ undo: 'undo' });
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('a scene write waits for the rebuild to reload the page', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      yield* simulate(editMachine, [
        EditEvent.Commit({ write: cueWrite, edit: {} }),
        EditEvent.Wrote({ result: landed }),
      ]);
      expect(log).not.toContain('reload');
    }).pipe(Effect.provide(layer));
  });

  it.effect('an Undo of a file the page reads once at load (a kept take) reloads it', () => {
    const { log, layer } = fakes();
    const timings: LabWrite = {
      file: 'narration/timings.json',
      target: 'undo voice a keep a.0123456789ab.flac',
      findings: [],
    };
    return Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Step({ verb: 'undo', request: UNDO_1, change: Option.none() }),
        EditEvent.Wrote({ result: timings }),
      ]);
      expect(result.finalState._tag).toBe('Written');
      expect(log).toEqual(['holdT', 'reload']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a refused write lets #t= go, puts the preview back, and shows the server text', () => {
    const { log, layer } = fakes();
    return Effect.gen(function* () {
      const message = 'SourceRefused: rise has a computed offset';
      const result = yield* simulate(editMachine, [
        EditEvent.Commit({ write: cueWrite, edit: {} }),
        EditEvent.Failed({ message }),
      ]);
      expect(result.finalState).toEqual(EditState.Refused({ message }));
      expect(log.slice(-2)).toEqual(['settle', 'unpreview one']);
    }).pipe(Effect.provide(layer));
  });
});

const settledTag = Predicate.or(Predicate.isTagged('Written'), Predicate.isTagged('Refused'));

describe('the write task, through an actor', () => {
  /** An actor's state once a commit through `write` has settled. */
  const settled = (write: Effect.Effect<LabWrite, LabFailure>) =>
    Effect.gen(function* () {
      const actor = yield* Machine.spawn(editMachine);
      yield* actor.start;
      yield* actor.send(EditEvent.Commit({ write: cueWrite, edit: {} }));
      return yield* SubscriptionRef.get(actor.state).pipe(
        Effect.delay('1 millis'),
        Effect.repeat({ until: settledTag }),
      );
    }).pipe(Effect.provide(fakes(write).layer));

  it.live('a write the server takes lands as Written', () =>
    Effect.gen(function* () {
      const state = yield* settled(Effect.succeed(landed));
      expect(state._tag).toBe('Written');
    }).pipe(Effect.scoped),
  );

  it.live(
    'two nudges, the second asked while the first is out: the lab hears both, the last one last',
    () => {
      // The first write answers only once let; what each write asked is heard in order.
      const first = Deferred.makeUnsafe<void>();
      const heard: Array<Option.Option<number>> = [];
      const writeCue: LabCalls['writeCue'] = (_, __, patch) =>
        Effect.sync(() => heard.push(Option.fromUndefinedOr(patch.offset))).pipe(
          Effect.andThen((n) => Effect.when(Deferred.await(first), Effect.succeed(n === 1))),
          Effect.as(landed),
        );
      const nudge = (offset: number) =>
        EditEvent.Commit({
          write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset } }),
          edit: {},
        });
      return Effect.gen(function* () {
        const actor = yield* Machine.spawn(editMachine);
        yield* actor.start;
        yield* actor.send(nudge(0.033));
        yield* actor.send(nudge(0.066));
        yield* Deferred.done(first, Exit.void);
        const state = yield* SubscriptionRef.get(actor.state).pipe(
          Effect.delay('1 millis'),
          Effect.repeat({ until: settledTag }),
        );
        expect(state._tag).toBe('Written');
        expect(heard).toEqual([Option.some(0.033), Option.some(0.066)]);
      }).pipe(
        Effect.scoped,
        Effect.provide(fakes(Effect.succeed(landed), Effect.die('not asked'), { writeCue }).layer),
      );
    },
  );

  it.live('a write the server refuses shows its text', () =>
    Effect.gen(function* () {
      const refused = SourceChanged.make({ file: 'scenes/hand.ts', target: 'cue topple offset' });
      const state = yield* settled(Effect.fail(refused));
      expect(state).toEqual(EditState.Refused({ message: refused.message }));
    }).pipe(Effect.scoped),
  );

  it.effect(
    `a write the server never answers is refused after ${WRITE_TIMEOUT_S} s, and the editor takes the next`,
    () => {
      const { log, layer } = fakes(Effect.never);
      return Effect.gen(function* () {
        const actor = yield* Machine.spawn(editMachine);
        yield* actor.start;
        yield* actor.send(EditEvent.Commit({ write: cueWrite, edit: {} }));
        yield* TestClock.adjust('10 millis');
        expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Writing');
        yield* TestClock.adjust(`${WRITE_TIMEOUT_S} seconds`);
        expect(yield* SubscriptionRef.get(actor.state)).toEqual(
          EditState.Refused({
            message: `the write had no answer in ${WRITE_TIMEOUT_S} s; see whether it changed the scene file (git diff) before writing again`,
          }),
        );
        expect(log).toEqual(['preview one ', 'holdT', 'settle', 'unpreview one']);
        yield* actor.send(EditEvent.Press({ grip }));
        yield* TestClock.adjust('10 millis');
        expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Pressed');
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );
});

// An Undo or Redo of a kept take remixes the track before it answers, which
// takes as long as a keep's mix: it gets the studio's wait, and with no answer
// even then, the lab's check says whether it landed.
describe('an Undo that remakes what follows its file', () => {
  const kept = 'voice a keep a.0123456789ab.flac';
  const timings: LabWrite = {
    file: 'narration/timings.json',
    target: `undo ${kept}`,
    findings: [],
  };
  /** The lab's check: its latest change, and the steps that landed with the ids their pages sent. */
  const reported = (
    latest: string,
    landed: ReadonlyArray<{ readonly target: string; readonly request: string }> = [],
  ): CheckReport => ({
    findings: [],
    latest: {
      file: 'narration/timings.json',
      target: latest,
      change: ChangeId.make(`change-${latest}`),
    },
    landed: landed.map((step) => ({
      file: 'narration/timings.json',
      change: ChangeId.make(`change-${step.target}`),
      target: step.target,
      request: RequestId.make(step.request),
    })),
  });
  /** The editor's actor once it was asked to undo, as request `request`. */
  const undoingAs = (request: string) =>
    Effect.gen(function* () {
      const actor = yield* Machine.spawn(editMachine);
      yield* actor.start;
      yield* actor.send(
        EditEvent.Step({ verb: 'undo', request: RequestId.make(request), change: Option.none() }),
      );
      yield* TestClock.adjust('10 millis');
      return actor;
    });
  const undoing = undoingAs('undo-1');

  it.effect('an Undo answered after a slow remake lands, past the scene write wait', () => {
    const { log, layer } = fakes(Effect.as(Effect.sleep('2 minutes'), timings));
    return Effect.gen(function* () {
      const actor = yield* undoing;
      yield* TestClock.adjust(`${WRITE_TIMEOUT_S + 1} seconds`);
      expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Writing');
      yield* TestClock.adjust('2 minutes');
      expect((yield* SubscriptionRef.get(actor.state))._tag).toBe('Written');
      expect(log).toEqual(['holdT', 'reload']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(
    `an Undo with no answer in ${STUDIO_IMPORT_WAIT_S} s that the lab's check says landed is written, and says the track may still be mixing`,
    () => {
      const { log, layer } = fakes(
        Effect.never,
        Effect.succeed(reported(`undo ${kept}`, [{ target: `undo ${kept}`, request: 'undo-1' }])),
      );
      return Effect.gen(function* () {
        const actor = yield* undoing;
        yield* TestClock.adjust(`${STUDIO_IMPORT_WAIT_S} seconds`);
        yield* TestClock.adjust('10 millis');
        const state = yield* SubscriptionRef.get(actor.state);
        expect(state._tag).toBe('Written');
        expect(state).toMatchObject({
          note: expect.stringContaining('reload the page once the lab log says it mixed'),
        });
        // The mix did not answer: nothing reloads, as a studio keep whose mix did not answer.
        expect(log).toEqual(['holdT', 'settle']);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    "an Undo with no answer that the lab's check says did not land is refused, naming the latest change",
    () => {
      const { layer } = fakes(Effect.never, Effect.succeed(reported('cue rise offset')));
      return Effect.gen(function* () {
        const actor = yield* undoing;
        yield* TestClock.adjust(`${STUDIO_IMPORT_WAIT_S} seconds`);
        yield* TestClock.adjust('10 millis');
        const state = yield* SubscriptionRef.get(actor.state);
        expect(state._tag).toBe('Refused');
        expect(state).toMatchObject({ message: expect.stringContaining('cue rise offset') });
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    'a second Undo that never reached the lab is not taken for an earlier one of the same name',
    () => {
      // The first Undo of `cue rise offset` landed; this one, of another change by that name, did not.
      const first = { target: 'undo cue rise offset', request: 'undo-1' };
      const { layer } = fakes(
        Effect.never,
        Effect.succeed(reported('undo cue rise offset', [first])),
      );
      return Effect.gen(function* () {
        const actor = yield* undoingAs('undo-2');
        yield* TestClock.adjust(`${STUDIO_IMPORT_WAIT_S} seconds`);
        yield* TestClock.adjust('10 millis');
        const state = yield* SubscriptionRef.get(actor.state);
        expect(state._tag).toBe('Refused');
        expect(state).toMatchObject({ message: expect.stringContaining('did not land') });
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect(
    "an Undo that landed is written though it walked another change than the page's history named, and a later change landed after it",
    () => {
      // The page's history named `cue rise offset`; another tab's change made the Undo walk
      // `cue rise dur`, and a write landed after it.
      const mine = { target: 'undo cue rise dur', request: 'undo-1' };
      const { layer } = fakes(Effect.never, Effect.succeed(reported('cue rise ease', [mine])));
      return Effect.gen(function* () {
        const actor = yield* undoingAs('undo-1');
        yield* TestClock.adjust(`${STUDIO_IMPORT_WAIT_S} seconds`);
        yield* TestClock.adjust('10 millis');
        const state = yield* SubscriptionRef.get(actor.state);
        expect(state._tag).toBe('Written');
        expect(state).toMatchObject({ note: expect.stringContaining('cue rise dur') });
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );
});
