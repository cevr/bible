// What the editor's provider derives from its machine's state for the panel:
// the findings to list (the landed write's, else the page's check) and the
// receipts, so no component reads the machine's states.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { busy, refused, said } from '../../command/command.ts';
import { sceneAt } from '../../core/layout.ts';
import {
  ChangeId,
  type CheckLine,
  type CheckReport,
  type FindingAddress,
  RequestId,
} from '../../core/schema.ts';
import { findingTime, findingsIn, findingsOf, peekText, receiptOf } from './format.ts';
import { CueWrite, StepWrite } from './grip.ts';
import { EditState } from './machine.ts';

const late: CheckLine = { level: 'warning', tag: 'late', message: 'rise ends after the scene' };
const early: CheckLine = { level: 'error', tag: 'early', message: 'fall starts before its mark' };
const report: CheckReport = { findings: [early] };

describe('peekText', () => {
  test("a cue's peek: its name, its offset and dur to two places, its ease", () => {
    expect(
      peekText(
        { _tag: 'Cue', name: 'charge' },
        [
          { id: 'offset', value: 0.4 },
          { id: 'dur', value: 0.6 },
        ],
        Option.some('out'),
      ),
    ).toBe('charge · offset 0.40 · dur 0.60 · ease out');
  });

  test("a knob's peek: a point's x and y, a number bare", () => {
    expect(
      peekText(
        { _tag: 'Knob', name: 'spot' },
        [
          { id: 'x', value: 120 },
          { id: 'y', value: 340.5 },
        ],
        Option.none(),
      ),
    ).toBe('spot · x 120.00 · y 340.50');
    expect(
      peekText({ _tag: 'Knob', name: 'size' }, [{ id: 'value', value: 1.2 }], Option.none()),
    ).toBe('size · 1.20');
  });
});

describe('findingsOf', () => {
  test("a landed write's findings, else the check the page loaded with", () => {
    expect(
      findingsOf(
        EditState.Written({ note: 'wrote', findings: [late], undo: 'undo', change: Option.none() }),
        Option.some(report),
      ),
    ).toEqual([late]);
    expect(findingsOf(EditState.Idle({ note: '' }), Option.some(report))).toEqual([early]);
    expect(findingsOf(EditState.Refused({ message: 'no' }), Option.none())).toEqual([]);
  });
});

describe('findingTime (F/⇧F)', () => {
  const placed = [
    { spec: { id: 'one' }, start: 0 },
    { spec: { id: 'two' }, start: 4 },
  ];
  const at = (address: FindingAddress): CheckLine => ({ ...late, address });

  test('its own time, else the start of the first scene it names', () => {
    expect(findingTime(at({ part: { _tag: 'Film' }, time: 2.5 }), placed)).toEqual(
      Option.some(2.5),
    );
    expect(findingTime(at({ part: { _tag: 'Scenes', ids: ['two', 'one'] } }), placed)).toEqual(
      Option.some(0),
    );
  });

  test('none for the whole film, an act, or no address', () => {
    expect(findingTime(at({ part: { _tag: 'Film' } }), placed)).toEqual(Option.none());
    expect(findingTime(at({ part: { _tag: 'Act', act: 'a' } }), placed)).toEqual(Option.none());
    expect(findingTime(late, placed)).toEqual(Option.none());
  });
});

describe('findingsIn (the inspector lists the scene shown, UI-6)', () => {
  const placed = [
    { spec: { id: 'one' }, start: 0, dur: 4 },
    { spec: { id: 'two' }, start: 4, dur: 3 },
  ];
  const at = (address: FindingAddress, tag: string): CheckLine => ({ ...late, tag, address });
  const findings = [
    at({ part: { _tag: 'Scenes', ids: ['two'] } }, 'named-two'),
    at({ part: { _tag: 'Film' }, time: 2.5 }, 'timed-one'),
    at({ part: { _tag: 'Film' }, time: 9 }, 'timed-past-the-end'),
    at({ part: { _tag: 'Film' } }, 'the-film'),
    { ...late, tag: 'no-place' },
  ];
  const tags = (scene: string) => {
    const { here, film, elsewhere } = findingsIn(findings, placed, scene);
    return [here.map((f) => f.tag), film.map((f) => f.tag), elsewhere];
  };

  test("a scene lists its own, and those with no place as the film's; the others' are counted", () => {
    expect(tags('one')).toEqual([['timed-one'], ['the-film', 'no-place'], 2]);
    expect(tags('two')).toEqual([['named-two', 'timed-past-the-end'], ['the-film', 'no-place'], 1]);
  });

  test('a time a hair of float error short of a start is the scene the playhead shows there', () => {
    const near = [at({ part: { _tag: 'Film' }, time: 4 - 1e-10 }, 'on-two')];
    expect(findingsIn(near, placed, 'two').here.map((f) => f.tag)).toEqual(['on-two']);
    expect(Option.map(sceneAt(placed, 4 - 1e-10), (p) => p.spec.id)).toEqual(Option.some('two'));
  });
});

describe('receiptOf', () => {
  test('a write on its way is busy; one that landed says what it did, with what undoes it, bound to its change', () => {
    const write = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } });
    expect(receiptOf(EditState.Writing({ write, next: [] }), 'f')).toEqual(
      Option.some(busy('writing…')),
    );
    const undo = StepWrite.make({
      verb: 'undo',
      request: RequestId.make('r'),
      change: Option.none(),
    });
    expect(receiptOf(EditState.Writing({ write: undo, next: [] }), 'f')).toEqual(
      Option.some(busy('undoing…')),
    );
    const undid = { note: 'undid cue rise offset', findings: [], undo: 'redo' } as const;
    const change = ChangeId.make('k1');
    expect(receiptOf(EditState.Written({ ...undid, change: Option.some(change) }), 'f')).toEqual(
      Option.some(
        said(
          'undid cue rise offset',
          Option.some({ command: 'edit.redo', bound: { film: 'f', change } }),
        ),
      ),
    );
    // A write that changed nothing (a value already so) made no change: it offers no Undo,
    // which would step whatever is newest, an earlier write's change.
    expect(receiptOf(EditState.Written({ ...undid, change: Option.none() }), 'f')).toEqual(
      Option.some(said('undid cue rise offset')),
    );
  });

  test('a refusal says why; at rest and mid-drag the last receipt stands', () => {
    expect(receiptOf(EditState.Refused({ message: 'SourceRefused: stale' }), 'f')).toEqual(
      Option.some(refused('SourceRefused: stale')),
    );
    expect(receiptOf(EditState.Idle({ note: 'wrote' }), 'f')).toEqual(Option.none());
  });
});
