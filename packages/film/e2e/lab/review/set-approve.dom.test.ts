// A Set's approve of a scene's render names its own run (the post's `op`), so
// its receipt offers the exact Undo: a withdraw given that op. A render the
// project calls out of date is refused by the server, and the refusal says so
// in the receipt, with no Undo.

import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  Match,
  Option,
  Predicate,
  Record,
  Schema,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { SetSayPost, pageHref } from '../../../src/core/api.ts';
import { VerbRefused } from '../../../src/core/refusals.ts';
import { json, openReview, refused, route } from '../../../src/lab/fixtures/harness.ts';
import type { FakeRoute, Json } from '../../../src/lab/fixtures/harness.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../../src/lab/fixtures/studio-film.ts';
import { countIs, evaluates, textHas, until, waitFor } from '../../../src/lab/fixtures/settled.ts';

const isFields = (value: Json): value is { readonly [key: string]: Json } =>
  Predicate.isObject(value);
const isList = (value: Json): value is ReadonlyArray<Json> => Arr.isArray(value);

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

/** `value` (a folder or the index) with each version's approval as `stateOf` says, where it says. */
const withApprovals = (value: Json, stateOf: (id: string) => Option.Option<string>): Json =>
  Match.value(value).pipe(
    Match.when(isList, (all): Json => all.map((one) => withApprovals(one, stateOf))),
    Match.when(isFields, (record): Json => {
      const mapped = Record.map(record, (one) => withApprovals(one, stateOf));
      const id = record['id'];
      return Option.match(
        Option.flatMap(Option.liftPredicate(id, Predicate.isString), (version) =>
          Option.filter(stateOf(version), () => 'approval' in record),
        ),
        { onNone: () => mapped, onSome: (approval) => ({ ...mapped, approval }) },
      );
    }),
    Match.orElse(() => value),
  );

/** `value` (the project) with each scene's sources keyed `key`, as after an edit. */
const withSceneKey = (value: Json, key: string): Json =>
  Match.value(value).pipe(
    Match.when(isList, (all): Json => all.map((one) => withSceneKey(one, key))),
    Match.when(isFields, (record): Json => {
      const mapped = Record.map(record, (one) => withSceneKey(one, key));
      return Bool.match(Predicate.isString(record['scene']) && 'key' in record, {
        onTrue: (): Json => ({ ...mapped, key }),
        onFalse: () => mapped,
      });
    }),
    Match.orElse(() => value),
  );

/**
 * The studio's project after an edit (each scene's sources keyed `k2`), its
 * own folder for the film `own` (`ProjectView.folder`).
 */
const movedOn = (own: string): FakeRoute => {
  const projectRoute = Option.getOrThrow(
    Arr.findFirst(studioRoutes, (r) => r.path.test('/api/films/toy/project')),
  );
  return route('GET', /^\/api\/films\/toy\/project$/, (a) => {
    const answer = projectRoute.answer(a);
    return Option.getOrElse(
      Option.map(
        Option.liftPredicate(answer, (r) => r._tag === 'Json'),
        (r) =>
          json(
            Match.value(withSceneKey(r.json, 'k2')).pipe(
              Match.when(isFields, (view): Json => ({ ...view, folder: own })),
              Match.orElse((other) => other),
            ),
          ),
      ),
      () => answer,
    );
  });
};

/** What the server holds besides this page's approve: versions approved before it, and `main` gone stale. */
interface World {
  readonly earlier: ReadonlyArray<string>;
  stale: boolean;
  /** Another approved `main` since the page read it: this page's approve gives nothing. */
  approvedSince?: boolean;
  /** Another withdrew `main`'s approval since: an Undo takes nothing. */
  withdrawnSince?: boolean;
}

/** `answer` (a folder) with `fields` beside it, as a set's say answers it (`SetSaid`). */
const withSaid = (answer: ReturnType<FakeRoute['answer']>, fields: Json) =>
  Option.getOrElse(
    Option.map(
      Option.liftPredicate(answer, (r) => r._tag === 'Json'),
      (r) =>
        json(
          Match.value(r.json).pipe(
            Match.when(isFields, (folder): Json => ({
              ...folder,
              ...Match.value(fields).pipe(
                Match.when(isFields, (f) => f),
                Match.orElse(() => ({})),
              ),
            })),
            Match.orElse((other) => other),
          ),
        ),
    ),
    () => answer,
  );

/** The run a withdraw was given. */
const givenOf = (say: SetSayPost['say']) =>
  Match.value(say).pipe(
    Match.tag('Withdraw', (w) => w.given),
    Match.orElse(() => Option.none<string>()),
  );

const decoded = (body: Parameters<FakeRoute['answer']>[0]['body']) =>
  Option.flatMap(body, Schema.decodeUnknownOption(SetSayPost));

/**
 * The studio as a server keeps it: `main` is approved from the approve to the
 * withdraw, in the say's answer and in the index a reload reads. Every say
 * posted is pushed to `asked`.
 */
const approving = (
  asked: Array<SetSayPost>,
  world: World = { earlier: [], stale: false },
): ReadonlyArray<FakeRoute> => {
  const approvedNow = () => Option.exists(Arr.last(asked), (p) => p.say._tag === 'Approve');
  const stateOf = (id: string) =>
    Match.value(id).pipe(
      Match.when('main', () =>
        Bool.match(approvedNow(), {
          onTrue: () =>
            Option.some(
              Bool.match(world.stale, { onTrue: () => 'stale', onFalse: () => 'approved' }),
            ),
          onFalse: () => Option.none<string>(),
        }),
      ),
      Match.orElse((other) =>
        Bool.match(world.earlier.includes(other), {
          onTrue: () => Option.some('approved'),
          onFalse: () => Option.none<string>(),
        }),
      ),
    );
  const stated = (answer: ReturnType<FakeRoute['answer']>) =>
    Option.getOrElse(
      Option.map(
        Option.liftPredicate(answer, (r) => r._tag === 'Json'),
        (r) => json(withApprovals(r.json, stateOf)),
      ),
      () => answer,
    );
  return [
    route('POST', SAY, (a) => {
      const had = approvedNow() || world.approvedSince === true;
      const post = decoded(a.body);
      Option.map(post, (p) => asked.push(p));
      // What the catalogue gave or took, as the server answers it: open's approval, when it moved.
      const said = Option.getOrElse(
        Option.map(post, (p): Json =>
          Match.value(p.say).pipe(
            Match.tag('Approve', (): Json =>
              Option.getOrElse(
                Option.map(
                  Option.filter(Option.fromUndefinedOr(p.op), () => !had),
                  (op): Json => ({ gave: { op, at: 0, scenes: ['open'] } }),
                ),
                () => ({}),
              ),
            ),
            Match.tag('Withdraw', (w): Json =>
              Option.getOrElse(
                Option.map(w.given, (op): Json => ({
                  took: {
                    op,
                    scenes: Arr.filter(['open'], () => had && world.withdrawnSince !== true),
                  },
                })),
                () => ({}),
              ),
            ),
            Match.orElse((): Json => ({})),
          ),
        ),
        (): Json => ({}),
      );
      return withSaid(stated(folder(a)), said);
    }),
    route('GET', /^\/api\/review\/index/, (a) => stated(index.answer(a))),
    ...studioRoutes,
  ];
};

describe('a Set approving a scene render', () => {
  it.live(
    'names its run, offers its Undo, and the Undo withdraws exactly that run',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const routes = approving(asked);
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
    'an approve the catalogue says gave nothing (approved since by another) says so, and offers no Undo',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const { page, errors } = yield* openReview(
          approving(asked, { earlier: [], stale: false, approvedSince: true }),
          { href: pageHref.set(STUDIO_FOLDER, STUDIO_SET) },
        );
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Approved already');
        yield* countIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 0);
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an Undo the catalogue says took nothing (withdrawn since by another) says nothing was left to undo',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const world: World = { earlier: [], stale: false };
        const { page, errors } = yield* openReview(approving(asked, world), {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        world.withdrawnSince = true;
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Nothing left to undo');
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve', 'Withdraw']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an approve's receipt restored by a reload still undoes it: the withdraw names the run and the version approved",
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const routes = approving(asked);
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        const op = Option.flatMap(Arr.head(asked), (p) => Option.fromUndefinedOr(p.op));
        yield* page.reload;
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Undid approving');
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve', 'Withdraw']);
        expect(Option.flatMap(Arr.get(asked, 1), (p) => givenOf(p.say))).toEqual(op);
        expect(Arr.get(asked, 1).pipe(Option.map((p) => p.variant))).toEqual(Option.some('main'));
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'another version approved earlier stays: the Undo withdraws just the version this run approved, in one withdraw',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const { page, errors } = yield* openReview(
          approving(asked, { earlier: ['warm'], stale: false }),
          {
            href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
          },
        );
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Undid approving');
        expect(asked.map((p) => [p.say._tag, p.variant])).toEqual([
          ['Approve', 'main'],
          ['Withdraw', 'main'],
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a render gone stale since its approve is still undone: the withdraw is of the version the receipt names',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const world: World = { earlier: [], stale: false };
        const { page, errors } = yield* openReview(approving(asked, world), {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        world.stale = true;
        yield* page.reload;
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Undid approving');
        expect(asked.map((p) => [p.say._tag, p.variant])).toEqual([
          ['Approve', 'main'],
          ['Withdraw', 'main'],
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a receipt kept before it named its version still restores, and its Undo says why it cannot run, sending nothing',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const { page, errors } = yield* openReview(approving(asked), {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        // The tab's kept receipts as an earlier build wrote them: the run and its scenes, no version.
        // Written after the page's own keep on the way out, so the reload reads this.
        yield* page.evaluate(
          `addEventListener('pagehide', () => sessionStorage.setItem('film-receipts', '{"scope":"review","receipts":[{"slot":"set","said":"Approved version main","undo":"project.undo-approve","bound":{"film":"toy","gave":{"op":"mv0rtvgr-hmmvsqak47","scenes":["open"]}},"tone":"done"}]}'))`,
        );
        yield* page.reload;
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* page.click(`${RECEIPT} [data-act="receipt-undo"]`);
        yield* textHas(page, '[data-role="receipts"]', 'before it named');
        expect(asked).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a version drawn from sources the film has moved past offers no Approve: judged by the project, as the write judges it',
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        // The index's record calls every version current; the film's sources now carry another key.
        const { page, errors } = yield* openReview([movedOn(STUDIO_FOLDER), ...approving(asked)], {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* evaluates(
          page,
          `document.querySelector('${INSPECTOR} [data-act="approve"]').disabled`,
          true,
        );
        yield* textHas(page, `${INSPECTOR} .rv-verdict`, 'out of date');
        expect(asked).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a folder of the film under another root is judged by its record, as the write judges it: the project's sources are its own folder's",
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        // The checkout's own folder for the film is another ref (`watercolor=` holds a copy of it).
        const { page, errors } = yield* openReview(
          [movedOn('out/elsewhere/toy'), ...approving(asked)],
          { href: pageHref.set(STUDIO_FOLDER, STUDIO_SET) },
        );
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        // The project answered, and the version still reads as its record says.
        yield* until(
          page,
          `performance.getEntriesByType('resource').some((e) => e.name.endsWith('/api/films/toy/project'))`,
        );
        yield* evaluates(
          page,
          `document.querySelector('${INSPECTOR} [data-act="approve"]').disabled`,
          false,
        );
        yield* countIs(page, `${INSPECTOR} .rv-verdict .rv-tag[data-state="stale"]`, 0);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* textHas(page, `${RECEIPT} .lab-receipt-said`, 'Approved');
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve']);
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
