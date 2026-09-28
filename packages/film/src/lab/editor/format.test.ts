// What the editor's provider derives from its machine's state for the panel:
// the findings to list (the landed write's, else the page's check) and the
// status line, so no component reads the machine's states.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { CheckLine, CheckReport } from '../../core/schema.ts';
import { findingsOf, statusText } from './format.ts';
import { CueWrite } from './grip.ts';
import { EditState } from './machine.ts';

const late: CheckLine = { level: 'warning', tag: 'late', message: 'rise ends after the scene' };
const early: CheckLine = { level: 'error', tag: 'early', message: 'fall starts before its mark' };
const report: CheckReport = { findings: [early] };

describe('findingsOf', () => {
  test("a landed write's findings, else the check the page loaded with", () => {
    expect(
      findingsOf(EditState.Written({ note: 'wrote', findings: [late] }), Option.some(report)),
    ).toEqual([late]);
    expect(findingsOf(EditState.Idle({ note: '' }), Option.some(report))).toEqual([early]);
    expect(findingsOf(EditState.Refused({ message: 'no' }), Option.none())).toEqual([]);
  });
});

describe('statusText', () => {
  test('a write on its way, what the last thing done said, else nothing', () => {
    const write = CueWrite.make({ scene: 'one', cue: 'rise', patch: { offset: 0.2 } });
    expect(statusText(EditState.Writing({ write }), Option.none())).toBe('writing…');
    expect(statusText(EditState.Refused({ message: 'SourceRefused: stale' }), Option.none())).toBe(
      'SourceRefused: stale',
    );
    expect(statusText(EditState.Idle({ note: '' }), Option.none())).toBe('');
  });
});
