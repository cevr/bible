// A review record's words: what an ask keeps, read by its types along its
// recommended way (never by an option's words), the typing an ask that shows
// figures owes, the reviews kept one per run, the problems a keep of each
// scene and figure meets, a crop's file in the set, a finding answered by its
// id, and a review's places held to the one key they were taken at.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Ref, Result, Schema } from 'effect';
import { Ask, AskBlock, oneQuestion, recommendedPath, untypedKeeps } from './ask.ts';
import {
  type ReviewRecord,
  answered,
  appended,
  cropFile,
  evidenceProblems,
  findingId,
  keyHeld,
} from './review-record.ts';

type Review = ReviewRecord['reviews'][number];

const blocks = Schema.decodeSync(Schema.Array(AskBlock));

/** The farmer of film `f`, scene `rain`, as a keep keeps him. */
const FARMER = { film: 'f', scenes: [{ scene: 'rain', figures: ['farmer'] }] } as const;

/** A finding on the farmer at `mark:rain`, saying `what`, nothing done yet. */
const finding = (what: string) => ({
  id: findingId('f', 'rain', { at: 'mark:rain', figure: 'farmer', aspect: 'head angle', what }),
  at: 'mark:rain',
  figure: 'farmer',
  aspect: 'head angle' as const,
  what,
});

/** One run over `scene` of film `f` at key `key`, its crops of `figures`. */
const run = (
  id: string,
  scene: string,
  key: string,
  figures: ReadonlyArray<string>,
  findings: Review['findings'] = [],
): Review => ({
  id,
  film: 'f',
  scene,
  key,
  made: '2026-10-18T00:00:00.000Z',
  places: ['mark:rain', 'cue:fall@0.5'],
  crops: figures.map((figure) => ({
    at: 'mark:rain',
    figure,
    concept: cropFile(id, scene, 'mark:rain', figure, 'concept'),
    drawn: cropFile(id, scene, 'mark:rain', figure, 'scene'),
    side: cropFile(id, scene, 'mark:rain', figure, 'side'),
  })),
  findings,
  skipped: [],
});

const EMPTY: ReviewRecord = { reviews: [] };

describe('what an ask keeps', () => {
  it.effect(
    'is read along the recommended way: a keep on a step only another answer reaches is not on it',
    () =>
      Effect.gen(function* () {
        const ask = yield* Schema.decodeEffect(Ask)({
          start: 'pick',
          steps: {
            pick: {
              blocks: [
                {
                  kind: 'choose',
                  id: 'farmer',
                  label: 'The farmer',
                  options: [
                    {
                      value: 'revise',
                      label: 'Keep refining: redo the face',
                      outcome: 'revise',
                      recommended: true,
                    },
                    { value: 'approve', label: 'Approve him', outcome: 'keep', keeps: FARMER },
                  ],
                },
              ],
              next: [{ to: 'lock', when: { answer: 'farmer', is: ['approve'] } }, { to: 'done' }],
            },
            lock: {
              blocks: [
                {
                  kind: 'choose',
                  id: 'scenes',
                  label: 'Go on?',
                  options: [
                    {
                      value: 'go',
                      label: 'Go on',
                      outcome: 'keep',
                      keeps: FARMER,
                      recommended: true,
                    },
                    { value: 'wait', label: 'Wait', outcome: 'other' },
                  ],
                },
              ],
              next: [{ to: 'done' }],
            },
            done: { end: true },
          },
        });
        expect(
          recommendedPath(ask).map((r) => `${r.step}:${r.option.value}:${r.option.outcome}`),
        ).toEqual(['pick:revise:revise']);
      }),
  );

  it.effect(
    'an ask that shows a figure types every outcome and every keep; one of words alone needs none',
    () =>
      Effect.sync(() => {
        const shown = oneQuestion(
          blocks([
            { kind: 'image', image: { src: '/api/review/p5/rbf/farmer.png' } },
            {
              kind: 'choose',
              id: 'farmer',
              label: 'The farmer',
              options: [
                { value: 'approve', label: 'Approve', recommended: true, outcome: 'keep' },
                { value: 'revise', label: 'Revise' },
              ],
            },
          ]),
        );
        expect(untypedKeeps(shown)).toEqual([
          'step ask: farmer option approve is a keep that names nothing kept: give it keeps: { film, scenes: [{ scene, figures }] } (scenes: [] for a script, a concept or a Board)',
          "step ask: farmer option revise has no outcome: the ask shows scenes or figures (a video, an image, a Board), so give each option outcome: 'keep' | 'revise' | 'other'",
        ]);
        const words = oneQuestion(
          blocks([
            {
              kind: 'choose',
              id: 'script',
              label: 'The script',
              options: [
                { value: 'keep', label: 'Keep it', recommended: true },
                { value: 'redo', label: 'Redo it' },
              ],
            },
          ]),
        );
        expect(untypedKeeps(words)).toEqual([]);
      }),
  );
});

describe('a review record', () => {
  it.effect(
    'keeps every run: a second scene reviewed leaves the first, and a finding answered once stays answered',
    () =>
      Effect.sync(() => {
        const court = run(
          'r1',
          'court',
          'kc',
          ['christ'],
          [{ ...finding('the eyes sit low'), done: 'raised' }],
        );
        const rain = run('r2', 'rain', 'kr', ['farmer']);
        const record = appended(appended(EMPTY, court), rain);
        expect(record.reviews.map((r) => `${r.id} ${r.scene}`)).toEqual(['r1 court', 'r2 rain']);
        const again = appended(
          record,
          run('r3', 'court', 'kc', ['christ'], [finding('the eyes sit low')]),
        );
        expect(again.reviews[2]?.findings.map((f) => f.done)).toEqual(['raised']);
      }),
  );

  it.effect('stands for each scene and figure kept, by the newest run that crops it', () =>
    Effect.sync(() => {
      const record = appended(
        appended(EMPTY, run('r1', 'court', 'kc', ['christ'])),
        run('r2', 'rain', 'kr', ['Farmer']),
      );
      const now = new Map([
        ['court', 'kc'],
        ['rain', 'kr'],
      ]);
      const both = {
        film: 'f',
        scenes: [
          { scene: 'court', figures: ['christ'] },
          { scene: 'rain', figures: ['farmer'] },
        ],
      };
      expect(evidenceProblems(record, both, now)).toEqual([]);
      // Christ kept in the rain: no run crops him there.
      expect(
        evidenceProblems(
          record,
          { film: 'f', scenes: [{ scene: 'rain', figures: ['christ'] }] },
          now,
        ),
      ).toEqual([
        'no review of christ in f rain: run film review f --set <set> --scene rain --at <place> --at <place> --figure christ',
      ]);
      // Another film's keep: this record holds none of it.
      expect(evidenceProblems(record, { film: 'g', scenes: [{ scene: 'rain' }] }, now)).toEqual([
        'no review of g rain over every figure: run film review g --set <set> --scene rain --at <place> --at <place>',
      ]);
    }),
  );

  it.effect(
    'refuses a scene changed since its run, and a finding on what is kept with nothing done',
    () =>
      Effect.sync(() => {
        const open = finding('front and level, the concept tilted up');
        const record = appended(EMPTY, run('r1', 'rain', 'k0', ['farmer'], [open]));
        expect(evidenceProblems(record, FARMER, new Map([['rain', 'k1']]))).toEqual([
          'f rain changed since review r1 (key k0, now k1): run film review again',
          `finding ${open.id} of review r1 (farmer head angle at rain mark:rain: front and level, the concept tilted up) has nothing done: fix it, then film review f --set <set> --done ${open.id} --did "<what was done>"`,
        ]);
      }),
  );

  it.effect(
    "a crop's file names its review, its scene, its place made plain, its figure and its kind",
    () =>
      Effect.sync(() => {
        expect(cropFile('r2', 'rain', 'cue:fall@0.5', 'farmer', 'side')).toBe(
          'review/crops/r2/rain.cue-fall-0.5.farmer.side.png',
        );
      }),
  );

  it.effect('answers a finding by its id, and refuses an id it does not hold or no words', () =>
    Effect.sync(() => {
      const a = finding('a');
      const b = finding('b');
      const record = appended(EMPTY, run('r1', 'rain', 'k', ['farmer'], [a, b]));
      const done = Result.getOrThrow(answered(record, b.id, 'fixed'));
      expect(done.reviews[0]?.findings.map((f) => f.done ?? '-')).toEqual(['-', 'fixed']);
      expect(Result.isFailure(answered(record, 'f00000000', 'fixed'))).toBe(true);
      expect(Result.isFailure(answered(record, a.id, '  '))).toBe(true);
    }),
  );
});

/** The key read the `n`th time (from 0): `keys[n]`, the last once past them. */
const keysRead = (keys: ReadonlyArray<string>) =>
  Effect.map(Ref.make(0), (reads) =>
    Ref.getAndUpdate(reads, (n) => n + 1).pipe(
      Effect.map((n) => keys[Math.min(n, keys.length - 1)] ?? ''),
    ),
  );

describe("a review's places", () => {
  it.effect('hold the key they were all taken at', () =>
    Effect.gen(function* () {
      const held = yield* keyHeld(yield* keysRead(['k1', 'k1']), Effect.succeed('crops'));
      expect(held).toEqual({ key: 'k1', taken: 'crops' });
    }),
  );

  it.effect('are refused when the scene changed during the review', () =>
    Effect.gen(function* () {
      const refused = yield* keyHeld(yield* keysRead(['k1', 'k2']), Effect.succeed('crops')).pipe(
        Effect.flip,
      );
      expect(refused.message).toBe(
        'film review: the scene changed during the review (key k1 before its first place, k2 after its last): run film review again',
      );
    }),
  );
});
