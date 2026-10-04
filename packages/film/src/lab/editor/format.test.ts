// What the editor's provider derives from its machine's state for the panel:
// the findings to list (the landed write's, else the page's check) and the
// receipts, so no component reads the machine's states.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { busy, refused, said } from '../../command/command.ts';
import type { CheckLine, CheckReport } from '../../core/schema.ts';
import { findingsOf, receiptOf } from './format.ts';
import { CueWrite, StepWrite } from './grip.ts';
import { EditState } from './machine.ts';

const late: CheckLine = { level: 'warning', tag: 'late', message: 'rise ends after the scene' };
const early: CheckLine = { level: 'error', tag: 'early', message: 'fall starts before its mark' };
const report: CheckReport = { findings: [early] };

describe('findingsOf', () => {
  test("a landed write's findings, else the check the page loaded with", () => {
    expect(
      findingsOf(
        EditState.Written({ note: 'wrote', findings: [late], undo: 'undo' }),
        Option.some(report),
      ),
    ).toEqual([late]);
    expect(findingsOf(EditState.Idle({ note: '' }), Option.some(report))).toEqual([early]);
    expect(findingsOf(EditState.Refused({ message: 'no' }), Option.none())).toEqual([]);
  });
});

describe('receiptOf', () => {
  test('a write on its way is busy; one that landed says what it did, with what undoes it', () => {
    const write = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } });
    expect(receiptOf(EditState.Writing({ write }))).toEqual(Option.some(busy('writing…')));
    const undo = StepWrite.make({ verb: 'undo', request: 'r' });
    expect(receiptOf(EditState.Writing({ write: undo }))).toEqual(Option.some(busy('undoing…')));
    expect(
      receiptOf(EditState.Written({ note: 'undid cue rise offset', findings: [], undo: 'redo' })),
    ).toEqual(Option.some(said('undid cue rise offset', Option.some('edit.redo'))));
  });

  test('a refusal says why; at rest and mid-drag the last receipt stands', () => {
    expect(receiptOf(EditState.Refused({ message: 'SourceRefused: stale' }))).toEqual(
      Option.some(refused('SourceRefused: stale')),
    );
    expect(receiptOf(EditState.Idle({ note: 'wrote' }))).toEqual(Option.none());
  });
});
