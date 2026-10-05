// The lab's project routes as the review page calls them: the project read in a fresh
// run, a scene or act said of, and the CLI-injection guards that refuse a bad variant,
// a flag-like scene name, or an address the project tree has no room for.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
import { ProjectView, labUrls } from '../core/api.ts';
import {
  REVIEW_PROJECT,
  REVIEW_TEST_HOME,
  reviewHttpFixture,
  reviewProjectRuns,
  reviewTestAsk,
  reviewTestBody,
  reviewTestGet,
  reviewTestPost,
  reviewTestRefusalOf,
} from './testing.ts';

describe("a film's project", () => {
  const decodeView = Schema.decodeEffect(Schema.fromJsonString(ProjectView));
  const say = (payload: string) =>
    reviewTestPost(labUrls.project.say({ params: { film: 'f' } }), payload, REVIEW_TEST_HOME);

  it.effect('is read, and said of, in a fresh run of `film project … --json`', () =>
    Effect.gen(function* () {
      reviewProjectRuns.length = 0;
      const read = yield* reviewTestAsk(
        reviewTestGet(labUrls.project.get({ params: { film: 'f' }, query: {} })),
      );
      expect(read.status).toBe(200);
      expect(yield* decodeView(yield* reviewTestBody(read))).toEqual({
        project: REVIEW_PROJECT,
        folder: Option.none(),
        videos: {},
      });
      const all = yield* reviewTestAsk(say('{"address":{"_tag":"Film"},"say":{"_tag":"Approve"}}'));
      expect((yield* decodeView(yield* reviewTestBody(all))).project).toEqual(REVIEW_PROJECT);
      const act = yield* reviewTestAsk(
        say('{"address":{"_tag":"Act","act":"one"},"say":{"_tag":"Approve"}}'),
      );
      expect(act.status).toBe(200);
      const withdrawn = yield* reviewTestAsk(
        say('{"address":{"_tag":"Act","act":"one"},"say":{"_tag":"Withdraw"}}'),
      );
      expect(withdrawn.status).toBe(200);
      // An approve's Undo: the withdraw of just the approvals that approve's op gave.
      const undone = yield* reviewTestAsk(
        say('{"address":{"_tag":"Act","act":"one"},"say":{"_tag":"Withdraw","given":"op-1"}}'),
      );
      expect(undone.status).toBe(200);
      const said = yield* reviewTestAsk(
        say(
          '{"address":{"_tag":"Film"},"say":{"_tag":"Comment","text":"--all of it"},"variant":"ink"}',
        ),
      );
      expect(said.status).toBe(200);
      expect(reviewProjectRuns).toEqual([
        ['f', '--json'],
        ['approve', 'f', '--all', '--json'],
        ['approve', 'f', '--act', 'one', '--json'],
        ['withdraw', 'f', '--act', 'one', '--json'],
        ['withdraw', 'f', '--act', 'one', '--given', 'op-1', '--json'],
        ['comment', 'f', '--variant', 'ink', '--json', '--', '--all of it'],
      ]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("a scene with no render is the run's refusal: 404; a stale one's is a 409", () =>
    Effect.gen(function* () {
      const refused = yield* reviewTestAsk(
        say('{"address":{"_tag":"Scenes","ids":["a"]},"say":{"_tag":"Approve"}}'),
      );
      expect(refused.status).toBe(404);
      expect(reviewTestRefusalOf(yield* reviewTestBody(refused))).toMatchObject({
        _tag: 'SceneNotRendered',
        scene: 'a',
      });
      const stale = yield* reviewTestAsk(
        say('{"address":{"_tag":"Scenes","ids":["b"]},"say":{"_tag":"Approve"}}'),
      );
      expect(stale.status).toBe(409);
      expect(reviewTestRefusalOf(yield* reviewTestBody(stale))).toMatchObject({
        _tag: 'VerbRefused',
        verb: 'approve',
      });
      const unknown = yield* reviewTestAsk(
        reviewTestGet(labUrls.project.get({ params: { film: 'nope' }, query: {} })),
      );
      expect(unknown.status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a short is no part of the project tree: its address is a 400, and nothing runs', () =>
    Effect.gen(function* () {
      reviewProjectRuns.length = 0;
      const short = yield* reviewTestAsk(
        say('{"address":{"_tag":"Short","id":"s"},"say":{"_tag":"Approve"}}'),
      );
      expect(short.status).toBe(400);
      const said = yield* reviewTestAsk(
        say('{"address":{"_tag":"Short","id":"s"},"say":{"_tag":"Comment","text":"cut it"}}'),
      );
      expect(said.status).toBe(400);
      expect(reviewProjectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a comment on more than one scene is a 400, and nothing runs', () =>
    Effect.gen(function* () {
      reviewProjectRuns.length = 0;
      const said = yield* reviewTestAsk(
        say('{"address":{"_tag":"Scenes","ids":["a","b"]},"say":{"_tag":"Comment","text":"x"}}'),
      );
      expect(said.status).toBe(400);
      expect(reviewTestRefusalOf(yield* reviewTestBody(said))).toMatchObject({
        _tag: 'RequestInvalid',
        part: 'Payload',
      });
      expect(reviewProjectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a variant the CLI would refuse is a 400, and never reaches its argv', () =>
    Effect.gen(function* () {
      reviewProjectRuns.length = 0;
      const flag = yield* reviewTestAsk(reviewTestGet('/api/films/f/project?variant=--all'));
      expect(flag.status).toBe(400);
      const all = yield* reviewTestAsk(
        say('{"address":{"_tag":"Film"},"say":{"_tag":"Approve"},"variant":"Ink Two"}'),
      );
      expect(all.status).toBe(400);
      expect(reviewProjectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('a scene or an act named like a flag is a 400, and never reaches its argv', () =>
    Effect.gen(function* () {
      reviewProjectRuns.length = 0;
      for (const address of [
        '{"_tag":"Scenes","ids":["--all"]}',
        '{"_tag":"Scenes","ids":["a","-x"]}',
        '{"_tag":"Act","act":"--all"}',
      ]) {
        const said = yield* reviewTestAsk(say(`{"address":${address},"say":{"_tag":"Approve"}}`));
        expect(said.status).toBe(400);
        expect(reviewTestRefusalOf(yield* reviewTestBody(said))).toMatchObject({
          _tag: 'RequestInvalid',
          part: 'Payload',
        });
      }
      // An Undo's op is never flag-like either.
      const undo = yield* reviewTestAsk(
        say('{"address":{"_tag":"Film"},"say":{"_tag":"Withdraw","given":"--all"}}'),
      );
      expect(undo.status).toBe(400);
      expect(reviewProjectRuns).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );
});
