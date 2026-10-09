// A Set's approve of a scene's render names its own run (the post's `op`), so
// its receipt offers the exact Undo: a withdraw given that op. A render the
// project calls out of date is refused by the server, and the refusal says so
// in the receipt, with no Undo.

import { Array as Arr, Effect, Match, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SetSayPost, pageHref } from '../../../src/core/api.ts';
import { VerbRefused } from '../../../src/core/refusals.ts';
import { json, openReview, refused, route } from '../../../src/lab/fixtures/harness.ts';
import type { FakeRoute } from '../../../src/lab/fixtures/harness.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../../src/lab/fixtures/studio-film.ts';
import { countIs, textHas, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const SAY = /^\/api\/review\/sets\/out%2Ftoy\/render%3Ascenes%3Aopen\/say$/;
const INSPECTOR = '[data-role="inspector"]';
const RECEIPT = '[data-receipt="set"]';
const index = studioRoutes[0]!;

/** The studio's folder as a say answers it: the index's one folder. */
const folder = (a: Parameters<FakeRoute['answer']>[0]) => {
  const answer = index.answer(a);
  return json(
    Option.getOrElse(
      Option.flatMap(
        Option.flatMap(
          Option.liftPredicate(answer, (r) => r._tag === 'Json'),
          (r) =>
            Schema.decodeUnknownOption(Schema.Struct({ folders: Schema.Array(Schema.Json) }))(
              r.json,
            ),
        ),
        (r) => Arr.head(r.folders),
      ),
      () => ({}),
    ),
  );
};

/** The run a withdraw was given. */
const givenOf = (say: SetSayPost['say']) =>
  Match.value(say).pipe(
    Match.tag('Withdraw', (w) => w.given),
    Match.orElse(() => Option.none<string>()),
  );

const decoded = (body: Parameters<FakeRoute['answer']>[0]['body']) =>
  Option.flatMap(body, Schema.decodeUnknownOption(SetSayPost));

describe('a Set approving a scene render', () => {
  it.live(
    'names its run, offers its Undo, and the Undo withdraws exactly that run',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', SAY, (a) => {
            Option.map(decoded(a.body), (post) => asked.push(post));
            return folder(a);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        const op = Option.flatMap(Arr.head(asked), (p) => Option.fromUndefinedOr(p.op));
        expect(Option.isSome(op)).toBe(true);
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Undid approving');
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve', 'Withdraw']);
        expect(Option.flatMap(Arr.get(asked, 1), (p) => givenOf(p.say))).toEqual(op);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a render the project calls out of date is refused in the receipt, with no Undo',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', SAY, () =>
            refused(
              VerbRefused.make({
                point: 'render:scenes:open',
                variant: 'main',
                verb: 'approve',
                reason: 'its sources changed since it was made',
              }),
            ),
          ),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* textHas(page, RECEIPT, 'sources changed');
        yield* countIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 0);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
