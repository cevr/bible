// The editor's Undo and Redo while the machine cannot take a step: with a
// write out, or a grip held, the command says why it is not taken (and a
// receipt's button holds), never answering as if it stepped.

import { Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON, Unfit, quiet, refused } from '../../command/command.ts';
import { contextAt } from '../../command/context.ts';
import { ChangeId, RequestId } from '../../core/schema.ts';
import { editorCommands } from './commands.ts';
import { CueWrite, StepWrite, type CueGrip } from './grip.ts';
import { EditState } from './machine.ts';
import { notTaken } from './format.ts';

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

const writing = EditState.Writing({
  write: CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } }),
  next: [],
});
const checking = EditState.Checking({
  write: StepWrite.make({ verb: 'undo', request: RequestId.make('undo-1'), change: Option.none() }),
  next: [],
});
const held = EditState.Pressed({ grip, note: '' });

/** The editor's commands with the machine in `state`, and the steps they took. */
const commandsIn = (state: EditState) => {
  const stepped: Array<string> = [];
  const commands = editorCommands({
    undoable: () => Option.some({ target: 'cue rise offset in scenes/one.ts' }),
    whyNot: () => Option.none(),
    step: (verb) => void stepped.push(verb),
    notTaken: (asked) => notTaken(state, asked),
    holding: () => Option.isSome(notTaken(state, 'commit')),
    cancel: () => {},
    selected: () => Option.none(),
    select: () => {},
    fieldsOf: () => [],
    stripCues: () => ({ scene: 'one', names: [] }),
    edges: () => [],
    T: () => 0,
    seek: () => {},
    findingTimes: () => [],
    snap: () => true,
    setSnap: () => {},
  });
  const undo = commands.find((c) => c.id === 'edit.undo');
  return { undo: Option.getOrThrow(Option.fromUndefinedOr(undo)), stepped };
};

const ctx = contextAt('lab', 'https://lab.test/films/probe/lab');

describe('Undo while the machine cannot step', () => {
  test('a write out: not taken, and it says so; a receipt’s button holds', () => {
    for (const state of [writing, checking]) {
      const { undo, stepped } = commandsIn(state);
      expect(Effect.runSync(undo.run(ctx, BY_BUTTON))).toEqual(
        refused('undo not taken: a write is still out; undo once it lands'),
      );
      expect(stepped).toEqual([]);
      expect(undo.fits?.({ film: 'probe', change: ChangeId.make('c-1') }, ctx)).toEqual(
        Option.some(Unfit.Now({ reason: 'a write is still out; undo once it lands' })),
      );
    }
  });

  test('a grip held: not taken, and it says so', () => {
    const { undo, stepped } = commandsIn(held);
    expect(Effect.runSync(undo.run(ctx, BY_BUTTON))).toEqual(
      refused('undo not taken: a cue or a handle is held; let it go first'),
    );
    expect(stepped).toEqual([]);
  });

  test('at rest: stepped, quietly (the step’s own receipt says it)', () => {
    const { undo, stepped } = commandsIn(EditState.Idle({ note: '' }));
    expect(Effect.runSync(undo.run(ctx, BY_BUTTON))).toEqual(quiet);
    expect(stepped).toEqual(['undo']);
  });
});

describe('notTaken', () => {
  test('a commit waits behind a write out, and is not taken while a grip is held', () => {
    expect(notTaken(writing, 'commit')).toEqual(Option.none());
    expect(notTaken(held, 'commit')).toEqual(
      Option.some('a cue or a handle is held; let it go first'),
    );
    expect(
      notTaken(
        EditState.Written({ note: '', findings: [], undo: 'undo', change: Option.none() }),
        'redo',
      ),
    ).toEqual(Option.none());
  });
});
