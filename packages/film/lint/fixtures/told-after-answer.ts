// Fixture for film/told-after-answer: each line marked RED fires the rule, and
// nothing else does.
import { Deferred, Effect, Exit } from 'effect';
import * as D from 'effect/Deferred';
import { doneUnsafe } from 'effect/Deferred';
import * as harness from '../../src/lab/fixtures/harness.ts';
import { json, later, madeBy, route, told } from '../../src/lab/fixtures/harness.ts';

let line = 'M0';
let back = false;
const fixed = { line: 'M0' };
const asked = Deferred.makeUnsafe<void>();
const putBack = Deferred.makeUnsafe<void>();
const gate = Deferred.makeUnsafe<void>();

// A named answer is the route's too: a const, or a function declaration.
const named = () => {
  Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
  return json({ line });
};
function declared() {
  Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
  return json({ line });
}

// Each tell made directly in a route's answer (the review's shapes named by letter).
export const direct = [
  // Told first: the case runs on inside the tell, and the answer reads what it changed.
  route('GET', /^\/script$/, () => {
    if (line === 'M1') Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    return json({ line });
  }),
  // A: the answer made after the tell, one line on.
  route('GET', /^\/script$/, () => {
    Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    const answer = json({ line });
    return answer;
  }),
  // B: made first, then two tells: the first runs the case, and the second reads what it changed.
  route('GET', /^\/script$/, () => {
    const answer = json({ line });
    Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    if (back) Deferred.doneUnsafe(putBack, Effect.void); // RED film/told-after-answer
    return answer;
  }),
  // C: the answer made by an effect the route returns, after the tell.
  route('GET', /^\/script$/, () => {
    Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    return madeBy(Effect.sync(() => json({ line })));
  }),
  // F: an expression body.
  route('GET', /^\/script$/, () => (Deferred.doneUnsafe(asked, Effect.void), json({ line }))), // RED film/told-after-answer
  // A tell in an effect the answer makes, before its answer.
  route('GET', /^\/script$/, () => {
    const tell = Deferred.done(asked, Exit.void); // RED film/told-after-answer
    return madeBy(
      Effect.andThen(
        tell,
        Effect.sync(() => json({ line })),
      ),
    );
  }),
  // The Deferred module whole, a tell imported by name, the harness whole, a named answer.
  harness.route('GET', /^\/script$/, () => {
    doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    return madeBy(Effect.as(D.succeed(putBack, undefined), json({ line }))); // RED film/told-after-answer
  }),
  route('GET', /^\/script$/, named),
  route('GET', /^\/script$/, declared),
  // A tell that completes as it is called, in told's argument: it runs before the answer is made.
  route('GET', /^\/script$/, () =>
    told(
      Effect.as(Effect.void, Deferred.doneUnsafe(asked, Effect.void)), // RED film/told-after-answer
      json({ line }),
    ),
  ),
  // D: a tell in a branch that answers a constant. The rule reads no answer: a direct tell is
  // refused wherever it stands, and told costs the branch nothing.
  route('GET', /^\/script$/, () => {
    if (back) {
      Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
      return json({ file: 'script.ts' });
    }
    return json({ line });
  }),
  // G and H: a key or a member spelled as the case's `let` reads nothing of it; the tell is
  // refused the same.
  route('GET', /^\/script$/, () => {
    Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    return json({ line: 'constant' });
  }),
  route('GET', /^\/script$/, () => {
    Deferred.doneUnsafe(asked, Effect.void); // RED film/told-after-answer
    return json(fixed.line);
  }),
];

export const throughTold = [
  // Told through the harness: the tell runs once the answer is made.
  route('GET', /^\/script$/, () => told(Deferred.done(asked, Exit.void), json({ line }))),
  // A tell by a condition read before it.
  route('GET', /^\/script$/, () =>
    told(
      Effect.when(Deferred.done(asked, Exit.void), Effect.succeed(line === 'M1')),
      json({ line }),
    ),
  ),
  // A gated answer: the tell runs before the gate, which the case opens.
  route('GET', /^\/voice$/, () =>
    told(Deferred.done(asked, Exit.void), later(gate, madeBy(Effect.sync(() => json({ line }))))),
  ),
  // A tell that completes as it is called, inside an effect told runs.
  route('GET', /^\/script$/, () =>
    told(
      Effect.sync(() => Deferred.doneUnsafe(asked, Effect.void)),
      json({ line }),
    ),
  ),
  // The branches of D, G and H told through the harness.
  route('GET', /^\/script$/, () => {
    if (back) return told(Deferred.done(asked, Exit.void), json({ file: 'script.ts' }));
    return json({ line });
  }),
  route('GET', /^\/script$/, () =>
    told(Deferred.done(asked, Exit.void), json({ line: 'constant' })),
  ),
  route('GET', /^\/script$/, () => told(Deferred.done(asked, Exit.void), json(fixed.line))),
  // Waiting on a Deferred tells nothing.
  route('GET', /^\/held$/, () => madeBy(Effect.as(Deferred.await(gate), json({ line })))),
  route('GET', /^\/held$/, () => json({ done: Deferred.isDoneUnsafe(gate) })),
  // A Deferred the route makes itself is its own.
  route('GET', /^\/own$/, () => {
    const mine = Deferred.makeUnsafe<void>();
    Deferred.doneUnsafe(mine, Effect.void);
    return json({ line });
  }),
];

// Another `route` or `told` is not the harness's.
export const shadowed = (
  route: (method: string, path: RegExp, answer: () => unknown) => unknown,
  told: (tell: unknown, then: unknown) => unknown,
) => [
  route('GET', /^\/script$/, () => {
    Deferred.doneUnsafe(asked, Effect.void);
    return json({ line });
  }),
  harness.route('GET', /^\/script$/, () => told(Deferred.done(asked, Exit.void), json({ line }))), // RED film/told-after-answer
];

// Outside a route, a tell is the case's own.
export const step = () => {
  Deferred.doneUnsafe(asked, Effect.void);
  return json({ line });
};

export const change = () => {
  line = 'M1';
  back = true;
  fixed.line = 'M1';
};
