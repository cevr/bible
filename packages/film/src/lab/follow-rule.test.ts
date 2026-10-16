// The lab's one Follow rule, with no page: where a box's top goes to keep
// the playhead's span in sight (`placeTo`), and to reveal what a press
// opened by the least scroll (`revealTo`). The Script reader, the Source
// view and the studio's Words follow by these.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { placeTo, revealTo } from './follow-rule.ts';

const box = (scrollTop: number) => ({ scrollTop, clientHeight: 300 });
const NO_CLEAR = { top: 0, bottom: 0 };
const UNDER_HEAD = { top: 48, bottom: 0 };

describe('placeTo: the span followed stays in sight', () => {
  test('a span in sight leaves the box where it is', () => {
    expect(placeTo(box(0), { top: 60, bottom: 120 }, UNDER_HEAD)).toEqual(Option.none());
  });

  test('a span below sight comes up to a third of the way down', () => {
    expect(placeTo(box(0), { top: 600, bottom: 640 }, NO_CLEAR)).toEqual(Option.some(500));
  });

  test("a tall span's last row is brought into sight, its first never above the clear top", () => {
    // A third down would leave its bottom (900) out of sight; its top (600) under the head limits it.
    expect(placeTo(box(0), { top: 600, bottom: 900 }, UNDER_HEAD)).toEqual(Option.some(552));
  });

  test('a span hidden under a sticky head counts as out of sight, and never goes above the start', () => {
    expect(placeTo(box(100), { top: 120, bottom: 160 }, UNDER_HEAD)).toEqual(Option.some(20));
    expect(placeTo(box(100), { top: 10, bottom: 40 }, NO_CLEAR)).toEqual(Option.some(0));
  });
});

describe('revealTo: what a press opened, by the least scroll', () => {
  const lastTop = () => 1000;

  test('a span that fits is shown whole, the box moved no further than it must', () => {
    expect(revealTo(box(0), { top: 200, bottom: 400 }, lastTop, NO_CLEAR)).toBe(100);
  });

  test('a span shown already leaves the box where it is', () => {
    expect(revealTo(box(50), { top: 100, bottom: 300 }, lastTop, NO_CLEAR)).toBe(50);
  });

  test('a span too tall to fit is brought up to its end, its last row never pushed under the head', () => {
    expect(revealTo(box(0), { top: 200, bottom: 1200 }, lastTop, UNDER_HEAD)).toBe(900);
    expect(revealTo(box(0), { top: 200, bottom: 1200 }, () => 600, UNDER_HEAD)).toBe(552);
  });
});
