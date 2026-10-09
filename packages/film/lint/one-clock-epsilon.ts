// `film/one-clock-epsilon`: a time is put on its grid, and two times are
// judged one, by one owner, `core/time.ts`: `frameAtOrAfter` and
// `frameAtOrBefore` (a frame, or a millisecond at 1000), `onTheMs` and
// `offTheMs` (an in point up, an out point down), and `CLOCK_EPSILON` (two
// sums of seconds that are one time). A nudge written out beside a time
// (`Math.ceil(t * fps - 1e-6)`) is a second owner of that rule, with a
// tolerance of its own, and a time rounded by two owners creeps a frame.
//
// Refused: a number written out above 0 and below `1e-4` (float noise, not
// a length any file keeps, the millisecond being the finest) in the film's
// clock code. The config turns it on over the code that computes times and
// off where a tiny number is no time: `core/time.ts` (the owner), the draw
// path's geometry (`canvas/`), the mix's and the synth's sample arithmetic,
// the affine maths and the test doubles; a line elsewhere that writes pixel
// noise says so (`oxlint-disable-next-line`, with why).

import { Effect, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** The largest number a nudge is: below it is float noise, at it a tenth of a millisecond. */
const NOISE = 1e-4;

const MESSAGE =
  'a nudge written beside a time: put the time on its grid through packages/film/src/core/time.ts (frameAtOrAfter, frameAtOrBefore, onTheMs, offTheMs), or judge two times one with CLOCK_EPSILON, so one owner rounds every time.';

/** Whether `node` writes a nudge out: a number above 0 and below `NOISE`. */
const isNudge = (node: ESTree.Node) =>
  node.type === 'Literal' && Predicate.isNumber(node.value) && node.value > 0 && node.value < NOISE;

export const oneClockEpsilon = Rule.define({
  name: 'one-clock-epsilon',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A time is put on its grid, and two times judged one, through core/time.ts alone: no nudge written beside a time.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('Literal', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(isNudge(node)),
        ),
      ),
    );
  },
});
