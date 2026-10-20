import { describe, expect, test } from 'bun:test';
import { inkAt } from './house.ts';

// The figures' line by the shot (`inkAt`): as cut in a wide shot, a quarter
// thinner (the owner's answer `line`: thin) in a close one, eased between so
// a push-in never pops it. A scale is frame heights per unit; a house head is
// 144 units high, so a head fills a fifth of the frame at 0.2 / 144.

/** The scale at which a house head fills `share` of the frame's height. */
const filling = (share: number) => share / 144;

/** Where the line starts to thin, and where it is thinnest: a head a fifth of the frame, and three tenths. */
const RAMP = { from: 0.2, full: 0.3 } as const;

describe("the figures' line by the shot", () => {
  test("keeps the line as cut in a wide shot and draws it a quarter thinner in a close one: the court's wide 1, the farmer of the rain 0.75", () => {
    // The court's wide shot (0.00104 a unit) and anything wider.
    for (const scale of [0, 0.0005, 0.00104, filling(RAMP.from)]) expect(inkAt(scale)).toBe(1);
    // The farmer of the rain (0.00215), the court's close Christ (0.00305), a look's crop.
    for (const scale of [filling(RAMP.full), 0.00215, 0.00305, 0.0275])
      expect(inkAt(scale)).toBe(0.75);
  });

  test('thins the line steadily as the shot closes, with no step a push-in would show', () => {
    const steps = 400;
    const at = Array.from({ length: steps + 1 }, (_, i) =>
      inkAt(filling(RAMP.from + ((RAMP.full - RAMP.from) * i) / steps)),
    );
    for (let i = 1; i < at.length; i++) {
      expect(at[i] ?? 0).toBeLessThanOrEqual(at[i - 1] ?? 0);
      // The steepest step of the ease (in-out cubic: three times the mean) across a 400th of the ramp.
      expect((at[i - 1] ?? 0) - (at[i] ?? 0)).toBeLessThan((3.01 * 0.25) / steps);
    }
  });
});
