// Keep needs evidence: an ask on a production whose recommended option keeps,
// locks or goes on is refused unless its set holds a review record
// (`core/review-record.ts`, written by `film review`) from the scenes as they
// stand now with every finding answered, or the owner's own words override
// it. An ask off a production, or one that recommends more work, is not
// gated. The owner, 2026-10-18, after a keep recommended on figures nobody
// had looked at 1:1: "theres some artifacts in the render, and the farmer
// looks nothing like the concept, face proportions and angles are off".

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Option, Schema } from 'effect';
import { type Ask, AskBlock, oneQuestion } from '../core/ask.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import { type ReviewRecord, ReviewRecordJson } from '../core/review-record.ts';
import { AskStore } from './ask-store.ts';
import { ProductionStore } from './production-store.ts';
import { Review } from './review.ts';
import {
  REVIEW_PROJECT,
  echoPages,
  freshFilm,
  labInMemory,
  noRenders,
  noStudio,
  text,
} from './testing.ts';

/** A record of film `f`'s scene `a` at the key it has now (`REVIEW_PROJECT`), one finding done. */
const RECORD: ReviewRecord = {
  film: 'f',
  made: '2026-10-18T00:00:00.000Z',
  scenes: [{ scene: 'a', key: 'k1' }],
  crops: [
    {
      scene: 'a',
      at: 'mark:rain',
      figure: 'farmer',
      concept: 'review/crops/a.mark-rain.farmer.concept.png',
      drawn: 'review/crops/a.mark-rain.farmer.scene.png',
      side: 'review/crops/a.mark-rain.farmer.side.png',
    },
  ],
  findings: [
    {
      scene: 'a',
      at: 'mark:rain',
      figure: 'farmer',
      aspect: 'head angle',
      what: 'front and level, the concept three-quarter and tilted up',
      done: 'the head turned three-quarter from the concept',
    },
  ],
  skipped: [],
};

/** The lab over set `p5/rbf`, its review record `record` beside its page (none: the set lists no record). */
const run = <A, E>(
  self: Effect.Effect<A, E, AskStore | ProductionStore>,
  record: ReviewRecord | 'none',
) => {
  const listed = record !== 'none';
  const files = new Map<string, Uint8Array>([['/films/f/scenes/index.ts', text('export {};\n')]]);
  if (record !== 'none') {
    files.set('/out/p5/rbf/review/evidence.md', text('# Review: f\n'));
    files.set(
      '/out/p5/rbf/review/evidence.json',
      text(Schema.encodeSync(ReviewRecordJson)(record)),
    );
  }
  const review = Layer.effect(
    Review,
    Effect.map(Effect.service(Review), (none) =>
      Review.of({
        ...none,
        resolve: (ref) =>
          Bool.match(listed && ref === 'p5/rbf/review/evidence.md', {
            onTrue: () => Effect.succeed(`/out/${ref}`),
            onFalse: () => Effect.fail(ReviewFileUnknown.make({ ref })),
          }),
      }),
    ),
  ).pipe(Layer.provide(noRenders));
  const film = freshFilm({ project: () => Effect.succeed(REVIEW_PROJECT) });
  return self.pipe(
    Effect.provide(
      labInMemory(files, echoPages, { film, asking: Layer.mergeAll(review, noStudio) }),
    ),
  );
};

/** One page asking whether to lock, recommending `recommended`. */
const lockOrRevise = (recommended: 'lock' | 'revise'): Ask =>
  oneQuestion(
    Schema.decodeSync(Schema.Array(AskBlock))([
      {
        kind: 'choose',
        id: 'farmer',
        label: 'The farmer',
        options: [
          { value: 'lock', label: 'Lock him', recommended: recommended === 'lock' },
          { value: 'revise', label: 'Revise him', recommended: recommended === 'revise' },
        ],
      },
    ]),
  );

const aimed = { production: 'rbf', set: 'p5/rbf' } as const;

/**
 * Why an ask aimed at `aim` recommending `recommended` is refused, as the
 * store says it (its problems, one a line), or `kept` with the override it
 * keeps; production `rbf` started first.
 */
const asked = (aim: Partial<AskDraftAim>, recommended: 'lock' | 'revise') =>
  Effect.gen(function* () {
    const productions = yield* ProductionStore;
    if (Option.isNone(yield* productions.read('rbf')))
      yield* productions.start('rbf', {
        title: 'RBF',
        film: Option.none(),
        blurb: Option.none(),
        first: 'v1',
        at: 0,
      });
    const asks = yield* AskStore;
    return yield* asks
      .make({
        title: 'Lock the cast?',
        why: 'w',
        by: 'agent',
        ...aim,
        ask: lockOrRevise(recommended),
      })
      .pipe(
        Effect.map(
          (record) =>
            `kept${Option.match(Option.fromUndefinedOr(record.override), { onNone: () => '', onSome: (o) => ` over "${o.quote}"` })}`,
        ),
        Effect.catchTag('AskInvalid', (e) => Effect.succeed(e.problems.join('\n'))),
      );
  });

interface AskDraftAim {
  readonly production: string;
  readonly set: string;
  readonly override: { readonly quote: string };
}

const KEEP = 'step ask: farmer recommends lock: a keep needs evidence';

describe('keep needs evidence', () => {
  it.effect('a keep stands on a review record from the scenes as they are, its findings done', () =>
    run(
      Effect.gen(function* () {
        expect(yield* asked(aimed, 'lock')).toBe('kept');
      }),
      RECORD,
    ),
  );

  it.effect(
    'a keep with no record is refused, naming the way to one; the owner’s words let it by',
    () =>
      run(
        Effect.gen(function* () {
          expect(yield* asked(aimed, 'lock')).toBe(
            `${KEEP}: set p5/rbf holds no review record (review/evidence.md): run film review <film> --set <name> --scene <id> --at <place> --at <place> before asking to keep`,
          );
          expect(yield* asked({ production: 'rbf' }, 'lock')).toBe(
            `${KEEP}: name the set that holds the figures' review record (\`set\`), or override with the owner's own words`,
          );
          expect(yield* asked({ ...aimed, override: { quote: 'lock it, I looked' } }, 'lock')).toBe(
            'kept over "lock it, I looked"',
          );
          // More work recommended, or no production: nothing to gate.
          expect(yield* asked(aimed, 'revise')).toBe('kept');
          expect(yield* asked({}, 'lock')).toBe('kept');
        }),
        'none',
      ),
  );

  it.effect('a record from scenes since changed, or with a finding not done, is refused', () =>
    run(
      Effect.gen(function* () {
        expect((yield* asked(aimed, 'lock')).split('\n')).toEqual([
          `${KEEP}: scene a changed since its review (key k0, now k1): run film review again`,
          `${KEEP}: finding 1 (farmer head angle at a mark:rain: front and level, the concept three-quarter and tilted up) has nothing done: fix it, then film review f --set <set> --done 1 --did "<what was done>"`,
        ]);
      }),
      {
        ...RECORD,
        scenes: [{ scene: 'a', key: 'k0' }],
        findings: RECORD.findings.map(({ done: _done, ...f }) => f),
      },
    ),
  );
});
