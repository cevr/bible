// The source-edit machine, with no DOM: a press on a cue grabs it and pauses
// the film; moves preview the drag; a release that changed something writes,
// holding `#T` for the reload, and one that did not puts the preview back.
// Fields and Undo commit straight from rest. One write at a time: a press or
// a commit while a write is out is not taken. A write lands (Written, with
// the server's findings) or is refused (Refused, the server's text), and a
// refusal lets `#T` go and puts the preview back.

import { Effect, Layer, Option, Predicate, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { Machine, assertNeverReaches, assertPath, simulate } from 'effect-machine';
import type { SceneEdit } from '../../canvas/film.ts';
import type { LabWrite } from '../../core/schema.ts';
import { LabApi, type LabCalls, LabRefused } from '../api.ts';
import { NotPreviewed, Stage, type StageOps } from '../stage.ts';
import { type CueGrip, CueWrite, type KnobGrip, KnobWrite, StepWrite } from './grip.ts';
import { EditEvent, EditState, editMachine } from './machine.ts';

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

const at = (x: number) => EditEvent.Move({ pointer: { x, y: 0, shift: false } });

const landed: LabWrite = {
  scene: 'one',
  file: 'scenes/one.ts',
  target: 'cue rise offset',
  findings: [{ level: 'warning', tag: 'late', message: 'rise ends after the scene' }],
};

/**
 * A stage that says what was asked of it (scene `bad` cannot be previewed),
 * and an API whose every write answers `write`.
 */
const fakes = (write: Effect.Effect<LabWrite, LabRefused> = Effect.succeed(landed)) => {
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
    holdT: Effect.sync(() => log.push('holdT')),
    settle: Effect.sync(() => log.push('settle')),
    pause: Effect.sync(() => log.push('pause')),
  };
  const api: LabCalls = {
    source: () => Effect.die('not asked'),
    head: () => Effect.die('not asked'),
    check: Effect.die('not asked'),
    writeCue: () => write,
    writeKnob: () => write,
    step: () => write,
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

  it.effect('moves preview the drag; its release writes and holds #T', () => {
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
          write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.3 } }),
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
  const to = (x: number, y: number) => EditEvent.Move({ pointer: { x, y, shift: false } });

  it.effect('moves preview the knobs; the release writes the knob and holds #T', () => {
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
          write: KnobWrite.make({ scene: 'three', knob: 'face', value: [380, 200] }),
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
  it.effect('a field commits from rest: previewed, #T held, written', () => {
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
      const result = yield* simulate(editMachine, [EditEvent.Step({ verb: 'undo' })]);
      expect(result.finalState).toEqual(
        EditState.Writing({ write: StepWrite.make({ verb: 'undo' }) }),
      );
      expect(log).toEqual(['holdT']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('one write at a time: a press or a commit while one is out is not taken', () =>
    Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Step({ verb: 'undo' }),
        EditEvent.Press({ grip }),
        EditEvent.Commit({ write: cueWrite, edit: {} }),
        EditEvent.Step({ verb: 'redo' }),
      ]);
      expect(result.finalState).toEqual(
        EditState.Writing({ write: StepWrite.make({ verb: 'undo' }) }),
      );
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('a write that lands says what it wrote, with its findings', () =>
    Effect.gen(function* () {
      const result = yield* simulate(editMachine, [
        EditEvent.Commit({ write: cueWrite, edit: {} }),
        EditEvent.Wrote({ result: landed }),
      ]);
      expect(result.finalState).toEqual(
        EditState.Written({
          note: 'wrote scenes/one.ts: cue rise offset',
          findings: landed.findings,
        }),
      );
    }).pipe(Effect.provide(fakes().layer)),
  );

  it.effect('a refused write lets #T go, puts the preview back, and shows the server text', () => {
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
  const settled = (write: Effect.Effect<LabWrite, LabRefused>) =>
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

  it.live('a write the server refuses shows its text', () =>
    Effect.gen(function* () {
      const refused = LabRefused.make({ status: 409, message: 'SourceRefused: stale' });
      const state = yield* settled(Effect.fail(refused));
      expect(state).toEqual(EditState.Refused({ message: 'SourceRefused: stale' }));
    }).pipe(Effect.scoped),
  );
});
