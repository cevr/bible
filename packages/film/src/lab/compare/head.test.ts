// What the compare draws and says for a scene at HEAD: HEAD's timeline and
// knobs over today's declarations (a span HEAD computed stays as it is now),
// the file it read and whether its code or data changed since; while HEAD is
// being read, and when it cannot be, the panel says so in the server's words.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { LabRefused } from '../api.ts';
import { compareText, headEdit } from './head.ts';

const head = {
  scene: 'one',
  file: 'scenes/one.ts',
  timeline: { rise: { mark: 'rise', dur: 0.9 } },
  knobs: { spot: [300, 200] as const },
  codeChanged: false,
  sameData: false,
};

describe('headEdit', () => {
  test("HEAD's literals over today's declarations", () => {
    const today = {
      timeline: { rise: { mark: 'rise', dur: 0.6 }, fall: { mark: 'fall', dur: 0.4 } },
      knobs: { spot: [320, 200] as const, size: 24 },
    };
    expect(headEdit(Option.some(today), head)).toEqual({
      timeline: { rise: { mark: 'rise', dur: 0.9 }, fall: { mark: 'fall', dur: 0.4 } },
      knobs: { spot: [300, 200], size: 24 },
    });
    expect(headEdit(Option.none(), head)).toEqual({
      timeline: head.timeline,
      knobs: head.knobs,
    });
  });
});

describe('compareText', () => {
  test('off says nothing; reading says so', () => {
    expect(compareText('off', 'one', AsyncResult.success(head))).toBe('');
    expect(compareText('wipe', 'one', AsyncResult.initial())).toBe('reading one at HEAD…');
  });
  test('the file it read, and what changed since', () => {
    expect(compareText('wipe', 'one', AsyncResult.success(head))).toBe('scenes/one.ts at HEAD');
    expect(
      compareText(
        'blink',
        'one',
        AsyncResult.success({ ...head, codeChanged: true, sameData: true }),
      ),
    ).toBe(
      "scenes/one.ts at HEAD · code changed since HEAD — compare shows data only · HEAD's timeline and knobs are the same as now",
    );
  });
  test("HEAD refused: the server's reason, without its tag", () => {
    const refused = LabRefused.make({ status: 404, message: 'SceneNotFound: not in HEAD' });
    expect(compareText('wipe', 'one', AsyncResult.fail(refused))).toBe('one: not in HEAD');
  });
});
