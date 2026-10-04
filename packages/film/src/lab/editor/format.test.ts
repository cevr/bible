// What the editor's provider derives from its machine's state for the panel:
// the findings to list (the landed write's, else the page's check) and the
// receipts, so no component reads the machine's states.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { busy, refused, said } from '../../command/command.ts';
import type { CheckLine, CheckReport, FindingAddress } from '../../core/schema.ts';
import { findingTime, findingsOf, receiptOf } from './format.ts';
import { CueWrite, StepWrite } from './grip.ts';
import { EditState } from './machine.ts';

const late: CheckLine = { level: 'warning', tag: 'late', message: 'rise ends after the scene' };
const early: CheckLine = { level: 'error', tag: 'early', message: 'fall starts before its mark' };
const report: CheckReport = { findings: [early] };

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

describe('receiptOf', () => {
  test('a write on its way is busy; one that landed says what it did, with what undoes it, bound to its change', () => {
    const write = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } });
    expect(receiptOf(EditState.Writing({ write, next: Option.none() }), 'f')).toEqual(
      Option.some(busy('writing…')),
    );
    const undo = StepWrite.make({ verb: 'undo', request: 'r', change: Option.none() });
    expect(receiptOf(EditState.Writing({ write: undo, next: Option.none() }), 'f')).toEqual(
      Option.some(busy('undoing…')),
    );
    const undid = { note: 'undid cue rise offset', findings: [], undo: 'redo' } as const;
    expect(receiptOf(EditState.Written({ ...undid, change: Option.some('k1') }), 'f')).toEqual(
      Option.some(
        said(
          'undid cue rise offset',
          Option.some('edit.redo'),
          Option.some({ film: 'f', change: 'k1' }),
        ),
      ),
    );
    // A write that changed nothing made no change to bind: its Undo steps whatever is newest.
    expect(receiptOf(EditState.Written({ ...undid, change: Option.none() }), 'f')).toEqual(
      Option.some(said('undid cue rise offset', Option.some('edit.redo'))),
    );
  });

  test('a refusal says why; at rest and mid-drag the last receipt stands', () => {
    expect(receiptOf(EditState.Refused({ message: 'SourceRefused: stale' }), 'f')).toEqual(
      Option.some(refused('SourceRefused: stale')),
    );
    expect(receiptOf(EditState.Idle({ note: 'wrote' }), 'f')).toEqual(Option.none());
  });
});
