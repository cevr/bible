// Keep needs evidence: an ask on a production is read by its types, never
// its words. One that shows scenes or figures types each option's outcome
// and each keep's subject, or it is refused naming what to add; a keep on
// its recommended way that names a scene or a figure needs its set's review
// of it (`core/review-record.ts`, written by `film review`) from the scene
// as it stands now, every finding on it answered, or the owner's own words
// override it. A keep of no scene (a script), a revise, a keep off the
// recommended way and an ask off a production are not gated. The owner,
// 2026-10-17 (his local day), after a keep recommended on figures nobody had
// looked at 1:1: "theres some artifacts in the render, and the farmer looks
// nothing like the concept, face proportions and angles are off".

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Option, Schema } from 'effect';
import { type Ask, AskBlock, oneQuestion } from '../core/ask.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import { type ReviewRecord, ReviewRecordJson, findingId } from '../core/review-record.ts';
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

const HEAD_ANGLE = 'front and level, the concept three-quarter and tilted up';
const FINDING = findingId('f', 'a', {
  at: 'mark:rain',
  figure: 'farmer',
  aspect: 'head angle',
  what: HEAD_ANGLE,
});

/** A review of film `f`'s scene `a` at the key it has now (`REVIEW_PROJECT`), its one finding done. */
const RECORD: ReviewRecord = {
  reviews: [
    {
      id: 'r1',
      film: 'f',
      scene: 'a',
      key: 'k1',
      made: '2026-10-18T00:00:00.000Z',
      places: ['mark:rain', 'cue:fall@0.5'],
      crops: [
        {
          at: 'mark:rain',
          figure: 'farmer',
          concept: 'review/crops/r1/a.mark-rain.farmer.concept.png',
          drawn: 'review/crops/r1/a.mark-rain.farmer.scene.png',
          side: 'review/crops/r1/a.mark-rain.farmer.side.png',
        },
      ],
      findings: [
        {
          id: FINDING,
          at: 'mark:rain',
          figure: 'farmer',
          aspect: 'head angle',
          what: HEAD_ANGLE,
          done: 'the head tilted up as the concept is',
        },
      ],
      skipped: [],
    },
  ],
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

/** The farmer of `film`'s scene `a`, as a keep keeps him. */
const farmerOf = (film: string) => ({ film, scenes: [{ scene: 'a', figures: ['farmer'] }] });

/** The forms of ask the gate meets: the farmer shown and approved or refined, typed or not; a script kept. */
type Form = 'approve' | 'refine' | 'untyped' | 'script' | 'other-film';

/** One page of form `form`: what it shows and what it recommends. */
const askOfForm = (form: Form): Ask =>
  oneQuestion(
    Schema.decodeSync(Schema.Array(AskBlock))(
      Bool.match(form === 'script', {
        onTrue: () => [
          {
            kind: 'choose',
            id: 'script',
            label: 'The script',
            options: [
              { value: 'keep', label: 'Keep it', recommended: true },
              { value: 'redo', label: 'Redo it' },
            ],
          },
        ],
        onFalse: () => [
          { kind: 'image', image: { src: '/api/review/p5/rbf/farmer.png' } },
          {
            kind: 'choose',
            id: 'farmer',
            label: 'The farmer',
            options: [
              {
                value: 'approve',
                label: 'Approve him',
                recommended: form !== 'refine',
                ...Bool.match(form === 'untyped', {
                  onTrue: () => ({}),
                  onFalse: () => ({
                    outcome: 'keep',
                    keeps: farmerOf(
                      Bool.match(form === 'other-film', { onTrue: () => 'g', onFalse: () => 'f' }),
                    ),
                  }),
                }),
              },
              {
                value: 'refine',
                label: 'Keep refining: redo the face',
                recommended: form === 'refine',
                ...Bool.match(form === 'untyped', {
                  onTrue: () => ({}),
                  onFalse: () => ({ outcome: 'revise' }),
                }),
              },
            ],
          },
        ],
      }),
    ),
  );

const aimed = { production: 'rbf', set: 'p5/rbf' } as const;

/**
 * Why an ask aimed at `aim` of form `form` is refused, as the store says
 * it (its problems, one a line), or `kept` with the override it keeps;
 * production `rbf` (the film `f`) started first.
 */
const asked = (aim: Partial<AskDraftAim>, form: Form) =>
  Effect.gen(function* () {
    const productions = yield* ProductionStore;
    if (Option.isNone(yield* productions.read('rbf')))
      yield* productions.start('rbf', {
        title: 'RBF',
        film: Option.some('f'),
        blurb: Option.none(),
        first: 'v1',
        at: 0,
      });
    const asks = yield* AskStore;
    return yield* asks
      .make({
        title: 'Keep the farmer?',
        why: 'w',
        by: 'agent',
        ...aim,
        ask: askOfForm(form),
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

const KEEP = 'step ask: farmer recommends approve: a keep needs evidence';

describe('keep needs evidence', () => {
  it.effect(
    'a typed keep of a figure stands on a review of it from the scene as it is, its findings done',
    () =>
      run(
        Effect.gen(function* () {
          expect(yield* asked(aimed, 'approve')).toBe('kept');
        }),
        RECORD,
      ),
  );

  it.effect(
    'a figure keep recommended as approve, with no record, is refused naming the way to one; the owner’s words let it by',
    () =>
      run(
        Effect.gen(function* () {
          expect(yield* asked(aimed, 'approve')).toBe(
            `${KEEP}: set p5/rbf holds no review record (review/evidence.md): run film review <film> --set <name> --scene <id> --at <place> --at <place> before asking to keep`,
          );
          expect(yield* asked({ production: 'rbf' }, 'approve')).toBe(
            `${KEEP}: name the set that holds the figures' review record (\`set\`), or override with the owner's own words`,
          );
          expect(
            yield* asked({ ...aimed, override: { quote: 'approve him, I looked' } }, 'approve'),
          ).toBe('kept over "approve him, I looked"');
        }),
        'none',
      ),
  );

  it.effect(
    'a script keep, a revise worded "Keep refining", and an ask off a production are not gated',
    () =>
      run(
        Effect.gen(function* () {
          expect(yield* asked(aimed, 'script')).toBe('kept');
          expect(yield* asked(aimed, 'refine')).toBe('kept');
          expect(yield* asked({}, 'approve')).toBe('kept');
          expect(yield* asked({}, 'untyped')).toBe('kept');
        }),
        'none',
      ),
  );

  it.effect(
    'leaving the types out is no way by: an ask that shows a figure untyped is refused, naming what to add',
    () =>
      run(
        Effect.gen(function* () {
          expect((yield* asked(aimed, 'untyped')).split('\n')).toEqual([
            "step ask: farmer option approve has no outcome: the ask shows scenes or figures (a video, an image, a Board), so give each option outcome: 'keep' | 'revise' | 'other'",
            "step ask: farmer option refine has no outcome: the ask shows scenes or figures (a video, an image, a Board), so give each option outcome: 'keep' | 'revise' | 'other'",
          ]);
        }),
        RECORD,
      ),
  );

  it.effect(
    'a keep of another film than the production’s is refused, and its record looked for under that film',
    () =>
      run(
        Effect.gen(function* () {
          expect((yield* asked(aimed, 'other-film')).split('\n')).toEqual([
            'step ask: farmer recommends approve: it keeps g, and production rbf is the film f',
            `${KEEP}: no review of farmer in g a: run film review g --set <set> --scene a --at <place> --at <place> --figure farmer`,
          ]);
        }),
        RECORD,
      ),
  );

  it.effect('a review from a scene since changed, or with a finding not done, is refused', () =>
    run(
      Effect.gen(function* () {
        expect((yield* asked(aimed, 'approve')).split('\n')).toEqual([
          `${KEEP}: f a changed since review r1 (key k0, now k1): run film review again`,
          `${KEEP}: finding ${FINDING} of review r1 (farmer head angle at a mark:rain: ${HEAD_ANGLE}) has nothing done: fix it, then film review f --set <set> --done ${FINDING} --did "<what was done>"`,
        ]);
      }),
      {
        reviews: RECORD.reviews.map((r) => ({
          ...r,
          key: 'k0',
          findings: r.findings.map(({ done: _done, ...f }) => f),
        })),
      },
    ),
  );
});
