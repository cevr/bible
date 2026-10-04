// The reload gate with no DOM: every reload the lab asks for (a write's, a
// kept take's, the rebuild's) waits while the owner has work only the page
// holds, a recording under review or a note being written, and runs once the
// last of it is done. Driven through the editor's machine: an Undo of a kept
// take, which reloads the page itself.

import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { simulate } from 'effect-machine';
import type { LabWrite } from '../core/schema.ts';
import { LabApi, type LabCalls } from './api.ts';
import { EditEvent, editMachine } from './editor/machine.ts';
import { ComposerState, unsaved } from './notes/composer.ts';
import { makeReloadGate, waitingText } from './reload-gate.ts';
import { Stage, type StageOps } from './stage.ts';
import { RecorderState } from './studio/machine.ts';
import { unsubmitted } from './studio/view.ts';

/** The Undo of a kept take, as the lab answers it: a file the page reads once, at load. */
const undoneTake: LabWrite = {
  file: 'narration/timings.json',
  target: 'undo voice a keep a.0123456789ab.flac',
  findings: [],
};

/** A stage whose reload is the gate's, and the page's reloads and its waiting line, counted. */
const gated = () => {
  const page = { reloads: 0, waiting: '' };
  const gate = makeReloadGate(
    Effect.sync(() => {
      page.reloads += 1;
    }),
    (text) => {
      page.waiting = text;
    },
  );
  const stage: StageOps = {
    preview: () => Effect.void,
    unpreview: () => Effect.void,
    timelineOf: () => ({}),
    knobsOf: () => ({}),
    cuesOf: () => new Map(),
    holdT: Effect.void,
    reload: gate.request,
    settle: Effect.void,
    pause: Effect.void,
    duration: 10,
    cueSpan: () => Option.none(),
    playFrom: () => Effect.void,
    still: () => Effect.die('not asked'),
  };
  const api: LabCalls = {
    source: () => Effect.die('not asked'),
    head: () => Effect.die('not asked'),
    check: Effect.die('not asked'),
    writeCue: () => Effect.die('not asked'),
    writeKnob: () => Effect.die('not asked'),
    step: () => Effect.succeed(undoneTake),
  };
  const layer = Layer.merge(Layer.succeed(Stage, stage), Layer.succeed(LabApi, api));
  return { page, gate, layer };
};

const wav = new Uint8Array([82, 73, 70, 70]);

describe('the reload gate', () => {
  it.effect(
    'a recording under review survives an Undo: the reload waits until it is discarded',
    () => {
      const { page, gate, layer } = gated();
      return Effect.gen(function* () {
        // The owner has a take under review in the Studio.
        yield* gate.hold('studio', unsubmitted(RecorderState.Review({ beat: 'a', wav })));
        // An Undo of a kept take lands, and asks for the reload.
        const result = yield* simulate(editMachine, [
          EditEvent.Step({ verb: 'undo', request: 'undo-1', change: Option.none() }),
          EditEvent.Wrote({ result: undoneTake }),
        ]);
        expect(result.finalState._tag).toBe('Written');
        expect(page.reloads).toBe(0);
        expect(page.waiting).toBe(
          'the page reloads with the change once you submit or discard the take under review',
        );
        // Discarded: the recorder is at rest, and the page reloads, once.
        yield* gate.hold(
          'studio',
          unsubmitted(RecorderState.Idle({ beat: 'a', kept: Option.none() })),
        );
        expect([page.reloads, page.waiting]).toEqual([1, '']);
        yield* gate.hold('studio', Option.none());
        expect(page.reloads).toBe(1);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('a reload waits for every hold: a take under review and a note being written', () => {
    const { page, gate } = gated();
    return Effect.gen(function* () {
      const open = ComposerState.Open({ T: 1, box: Option.none(), ink: [], status: '' });
      yield* gate.hold(
        'studio',
        unsubmitted(RecorderState.Recording({ beat: 'a', startedAt: 0, limit: 60 })),
      );
      yield* gate.hold('notes', unsaved(open));
      yield* gate.request;
      expect(page.waiting).toBe(
        'the page reloads with the change once you stop the take being recorded, and save or cancel the note being written',
      );
      yield* gate.hold('studio', Option.none());
      expect(page.reloads).toBe(0);
      yield* gate.hold('notes', unsaved(ComposerState.Closed({ saved: Option.none() })));
      expect(page.reloads).toBe(1);
    });
  });

  it.effect('with nothing held a reload runs at once, and a hold alone reloads nothing', () => {
    const { page, gate } = gated();
    return Effect.gen(function* () {
      yield* gate.request;
      expect(page.reloads).toBe(1);
      yield* gate.hold('notes', Option.some('save or cancel the note being written'));
      yield* gate.hold('notes', Option.none());
      expect(page.reloads).toBe(1);
      expect(waitingText(false, ['save the note'])).toBe('');
    });
  });
});
