// The lab's choices routes as the review page calls them: the list, a pick, a knob,
// a say, a sound check and a variant heard alone; the film's steps without a check; and
// a path or body that does not decode answers its refusal.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';
import { CheckReport, LabWrite } from '../core/schema.ts';
import { Steps, labUrls } from '../core/api.ts';
import { ChoiceWrite, FilmChoices, SoundCheck } from '../core/choice.ts';
import {
  REVIEW_CHOICES,
  REVIEW_TEST_HOME,
  ReviewTestRoot,
  reviewHttpFixture,
  reviewTestAsk,
  reviewTestBody,
  reviewTestGet,
  reviewTestPost,
  reviewTestRefusalOf,
} from './testing.ts';

/** A pick as the review's page sends it. */
const pick = (film: string, body: string, origin: string, type = 'application/json') =>
  reviewTestPost(labUrls.choices.pick({ params: { film } }), body, origin, type);

const PICK_BRIGHT = '{"point":"score","variant":"bright","verb":"pick"}';

describe("a film's choices", () => {
  it.effect('are listed for any film the app has; an unknown one is 404', () =>
    Effect.gen(function* () {
      const listed = yield* reviewTestAsk(
        reviewTestGet(labUrls.choices.list({ params: { film: 'f' } })),
      );
      expect(listed.status).toBe(200);
      const choices = yield* Schema.decodeEffect(Schema.fromJsonString(FilmChoices))(
        yield* reviewTestBody(listed),
      );
      expect(choices).toEqual(REVIEW_CHOICES);
      const unknown = yield* reviewTestAsk(
        reviewTestGet(labUrls.choices.list({ params: { film: 'nope' } })),
      );
      expect(unknown.status).toBe(404);
      expect(reviewTestRefusalOf(yield* reviewTestBody(unknown))).toMatchObject({
        _tag: 'FilmUnknown',
        film: 'nope',
        known: ['f'],
      });
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a film named by a path is no film: 404, its answer naming no folder of its own', () =>
    Effect.gen(function* () {
      const dir = yield* ReviewTestRoot;
      for (const film of ['..%2Fbeside', '%2E%2E%2Fbeside', encodeURIComponent(`${dir}/films/f`)])
        for (const route of ['choices', 'check', 'choices/mix?point=score&variant=warm']) {
          const answer = yield* reviewTestAsk(reviewTestGet(`/api/films/${film}/${route}`));
          const text = yield* reviewTestBody(answer);
          expect([film, route, answer.status]).toEqual([film, route, 404]);
          expect(reviewTestRefusalOf(text)).toMatchObject({
            _tag: 'FilmUnknown',
            film: decodeURIComponent(film),
            known: ['f'],
          });
        }
      const undo = yield* reviewTestAsk(
        new Request('http://127.0.0.1:8229/api/films/..%2Fbeside/undo', {
          method: 'POST',
          headers: { host: 'box.example:8229', 'content-type': 'application/json' },
          body: '{}',
        }),
      );
      expect(undo.status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("a pick is answered with the file it changed, the choices, and the film's check", () =>
    Effect.gen(function* () {
      const picked = yield* reviewTestAsk(pick('f', PICK_BRIGHT, REVIEW_TEST_HOME));
      expect(picked.status).toBe(200);
      const answer = yield* Schema.decodeEffect(Schema.fromJsonString(ChoiceWrite))(
        yield* reviewTestBody(picked),
      );
      expect(answer).toEqual({
        file: 'sound.ts',
        target: 'score play bright',
        choices: REVIEW_CHOICES,
        findings: [],
      });
      const undo = new Request(
        `http://127.0.0.1:8229${labUrls.steps.undo({ params: { film: 'f' } })}`,
        {
          method: 'POST',
          headers: { host: 'box.example:8229', 'content-type': 'application/json' },
          body: '{}',
        },
      );
      const undone = yield* Schema.decodeEffect(Schema.fromJsonString(LabWrite))(
        yield* reviewTestBody(yield* reviewTestAsk(undo)),
      );
      expect(undone).toEqual({
        file: 'sound.ts',
        target: 'undo score play bright',
        findings: [],
      });
      const check = yield* Schema.decodeEffect(Schema.fromJsonString(CheckReport))(
        yield* reviewTestBody(
          yield* reviewTestAsk(reviewTestGet(labUrls.steps.check({ params: { film: 'f' } }))),
        ),
      );
      expect(check).toEqual({
        findings: [],
        redo: { file: 'sound.ts', target: 'score play bright' },
      });
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a pick from another site, or not as JSON, is refused before it runs', () =>
    Effect.gen(function* () {
      const cross = yield* reviewTestAsk(pick('f', PICK_BRIGHT, 'https://evil.example'));
      expect(cross.status).toBe(403);
      const form = yield* reviewTestAsk(pick('f', 'point=score', REVIEW_TEST_HOME, 'text/plain'));
      expect(form.status).toBe(415);
      const bad = yield* reviewTestAsk(
        pick('f', '{"point":"score","variant":"bright","verb":"keep"}', REVIEW_TEST_HOME),
      );
      expect(bad.status).toBe(400);
      const refusal = reviewTestRefusalOf(yield* reviewTestBody(bad));
      expect(refusal).toMatchObject({ _tag: 'RequestInvalid', part: 'Payload' });
      expect(refusal.message).toContain('verb');
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a query or a body that does not decode answers RequestInvalid, naming it', () =>
    Effect.gen(function* () {
      const answers = yield* Effect.forEach(
        [
          reviewTestGet('/api/review/frame'),
          reviewTestGet('/api/films/f/project?variant=Bad%20Name'),
          reviewTestPost(
            labUrls.project.say({ params: { film: 'f' } }),
            '{"address":{"_tag":"Nope"},"say":{"_tag":"Approve"}}',
            REVIEW_TEST_HOME,
          ),
        ],
        (request) =>
          Effect.gen(function* () {
            const res = yield* reviewTestAsk(request);
            return [res.status, reviewTestRefusalOf(yield* reviewTestBody(res))] as const;
          }),
      );
      expect(answers).toMatchObject([
        [400, { _tag: 'RequestInvalid', part: 'Query', reason: 'Missing key at ["ref"]' }],
        [400, { _tag: 'RequestInvalid', part: 'Query' }],
        [400, { _tag: 'RequestInvalid', part: 'Payload' }],
      ]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("the sound check after a pick answers the mix's findings", () =>
    Effect.gen(function* () {
      const checked = yield* reviewTestAsk(
        reviewTestGet(labUrls.choices.soundCheck({ params: { film: 'f' } })),
      );
      expect(checked.status).toBe(200);
      expect(
        yield* Schema.decodeEffect(Schema.fromJsonString(SoundCheck))(
          yield* reviewTestBody(checked),
        ),
      ).toEqual({
        findings: [{ level: 'warning', tag: 'DeadAir', message: 'no sound 3.0-4.2 s' }],
      });
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("a variant's say answers the choices as they stand", () =>
    Effect.gen(function* () {
      const approved = yield* reviewTestAsk(
        reviewTestPost(
          labUrls.choices.say({ params: { film: 'f' } }),
          '{"point":"score","variant":"warm","say":{"_tag":"Approve"}}',
          REVIEW_TEST_HOME,
        ),
      );
      expect(approved.status).toBe(200);
      const withdrawn = yield* reviewTestAsk(
        reviewTestPost(
          labUrls.choices.say({ params: { film: 'f' } }),
          '{"point":"score","variant":"warm","say":{"_tag":"Withdraw"}}',
          REVIEW_TEST_HOME,
        ),
      );
      expect(withdrawn.status).toBe(200);
      const said = yield* reviewTestAsk(
        reviewTestPost(
          labUrls.choices.say({ params: { film: 'f' } }),
          '{"point":"score","variant":"warm","say":{"_tag":"Comment","text":""}}',
          REVIEW_TEST_HOME,
        ),
      );
      expect(said.status).toBe(400);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("the steps are the film's history alone: no check runs", () =>
    Effect.gen(function* () {
      const steps = yield* reviewTestAsk(
        reviewTestGet(labUrls.steps.steps({ params: { film: 'f' } })),
      );
      expect(steps.status).toBe(200);
      expect(
        yield* Schema.decodeEffect(Schema.fromJsonString(Steps))(yield* reviewTestBody(steps)),
      ).toEqual({
        redo: { file: 'sound.ts', target: 'score play bright' },
      });
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );
});
