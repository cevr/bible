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
import { countIs, evaluates, textHas, waitFor } from '../../../src/lab/fixtures/settled.ts';

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

/** `value` (the project) with scene `id`'s approval `approval`. */
const withSceneApproval = (value: Json, id: string, approval: string): Json =>
  Match.value(value).pipe(
    Match.when(isList, (all): Json => all.map((one) => withSceneApproval(one, id, approval))),
    Match.when(isFields, (record): Json => {
      const mapped = Record.map(record, (one) => withSceneApproval(one, id, approval));
      return Bool.match(record['scene'] === id && 'approval' in record, {
        onTrue: (): Json => ({ ...mapped, approval }),
        onFalse: () => mapped,
      });
    }),
    Match.orElse(() => value),
  );

/** The studio's project as `film project` reads it now: open approved while the last say posted approved it. */
const approvedOnceSaid = (asked: ReadonlyArray<SetSayPost>): FakeRoute => {
  const projectRoute = Option.getOrThrow(
    Arr.findFirst(studioRoutes, (r) => r.path.test('/api/films/toy/project')),
  );
  return route('GET', /^\/api\/films\/toy\/project$/, (a) => {
    const answer = projectRoute.answer(a);
    return Option.getOrElse(
      Option.map(
        Option.filter(
          Option.liftPredicate(answer, (r) => r._tag === 'Json'),
          () => Option.exists(Arr.last(asked), (p) => p.say._tag === 'Approve'),
        ),
        (r) => json(withSceneApproval(r.json, 'open', 'approved')),
      ),
      () => answer,
    );
  });
};

/**
 * The film's choices, answered later than the registry keeps an atom nothing
 * reads (400 ms): Project mounts only once they answer, as on the real film,
 * whose `film options` takes over a second.
 */
const slowChoices: FakeRoute = (() => {
  const choicesRoute = Option.getOrThrow(
    Arr.findFirst(studioRoutes, (r) => r.path.test('/api/films/toy/choices')),
  );
  return route('GET', /^\/api\/films\/toy\/choices$/, choicesRoute.answer, '900 millis');
})();

/**
 * The studio's project as the catalogue holds it: open approved once a say on
 * Project approved it, in that say's answer and in every read after.
 */
const projectSays = (catalogue: { approved: boolean }): ReadonlyArray<FakeRoute> => {
  const projectRoute = Option.getOrThrow(
    Arr.findFirst(studioRoutes, (r) => r.path.test('/api/films/toy/project')),
  );
  const now = (a: Parameters<FakeRoute['answer']>[0]) => {
    const answer = projectRoute.answer(a);
    return Option.getOrElse(
      Option.map(
        Option.filter(
          Option.liftPredicate(answer, (r) => r._tag === 'Json'),
          () => catalogue.approved,
        ),
        (r) => json(withSceneApproval(r.json, 'open', 'approved')),
      ),
      () => answer,
    );
  };
  return [
    route('POST', /^\/api\/films\/toy\/project\/say$/, (a) => {
      catalogue.approved = true;
      return now(a);
    }),
    route('GET', /^\/api\/films\/toy\/project$/, now),
  ];
};

/** The index as the catalogue holds it: the set's `main` approved once a say on Project approved open. */
const indexSays = (catalogue: { approved: boolean }): FakeRoute =>
  route('GET', /^\/api\/review\/index/, (a) => {
    const answer = index.answer(a);
    return Option.getOrElse(
      Option.map(
        Option.liftPredicate(answer, (r) => r._tag === 'Json'),
        (r) =>
          json(
            withApprovals(r.json, (id) =>
              Option.filter(Option.some('approved'), () => id === 'main' && catalogue.approved),
            ),
          ),
      ),
      () => answer,
    );
  });

/** How many times the page read the film's project. */
const projectReads = (
  requests: ReadonlyArray<{ readonly method: string; readonly path: string }>,
) => requests.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/project').length;

/** `value` with the studio's folder (`STUDIO_FOLDER`) and the refs under it named under `label`. */
const relabel = (value: Json, label: string): Json =>
  Match.value(value).pipe(
    Match.when(isList, (all): Json => all.map((one) => relabel(one, label))),
    Match.when(isFields, (record): Json => Record.map(record, (one) => relabel(one, label))),
    Match.when(
      (s: Json): s is string => Predicate.isString(s) && s === STUDIO_FOLDER,
      (): Json => label,
    ),
    Match.when(
      (s: Json): s is string => Predicate.isString(s) && s.startsWith(`${STUDIO_FOLDER}/`),
      (s): Json => `${label}${s.slice(STUDIO_FOLDER.length)}`,
    ),
    Match.orElse(() => value),
  );

/**
 * The index with the film's own folder under a root of another label, as
 * `FILM_REVIEW_ROOTS=rbf=…/out/toy` names it: a ref not ending in the film's name.
 */
const underLabel = (label: string): FakeRoute =>
  route('GET', /^\/api\/review\/index/, (a) => {
    const answer = index.answer(a);
    return Option.getOrElse(
      Option.map(
        Option.liftPredicate(answer, (r) => r._tag === 'Json'),
        (r) => json(relabel(r.json, label)),
      ),
      () => answer,
    );
  });

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
    "the film's own folder under a root of another label is judged by the project, as the write judges it: the project names it, not its name",
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        // `rbf=…/out/toy`: the checkout's own folder for the film, its ref not the film's name.
        const { page, errors } = yield* openReview(
          [underLabel('rbf'), movedOn('rbf'), ...approving(asked)],
          { href: pageHref.set('rbf', STUDIO_SET) },
        );
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
    "a Set's approve shows on its Project tab: the approve reads the project again, and Project shows that read",
    () =>
      Effect.gen(function* () {
        const asked = new Array<SetSayPost>();
        const {
          page,
          asked: requests,
          errors,
        } = yield* openReview([slowChoices, approvedOnceSaid(asked), ...approving(asked)], {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        // The Set read the project before the approve, open approved in none.
        yield* waitFor(page, '.rv-set-tools[data-sources="project"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"]`);
        yield* page.click(`${INSPECTOR} [data-act="approve"]`);
        yield* waitFor(page, `${RECEIPT} [data-act="receipt-undo"]`);
        // Project, from the Set's own tab, mounting once its slow choices answer: open is
        // approved there, by the one read the approve made.
        yield* page.click('a.sh-tab[data-page="project"]');
        yield* waitFor(page, '.rv-scene[data-scene="open"] [data-approval="approved"]');
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve']);
        expect(projectReads(requests)).toBe(2);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a Set and then its Project tab read the project once, though Project mounts after the registry's idle time",
    () =>
      Effect.gen(function* () {
        const {
          page,
          asked: requests,
          errors,
        } = yield* openReview([slowChoices, ...studioRoutes], {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-set-tools[data-sources="project"]');
        yield* page.click('a.sh-tab[data-page="project"]');
        yield* waitFor(page, '.rv-scene[data-scene="open"]');
        expect(projectReads(requests)).toBe(1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "Project's approve, then the Set, then Project again: each shows the approve, the project read once and the index again (Back onto the Set warns nothing)",
    () =>
      Effect.gen(function* () {
        const catalogue = { approved: false };
        const {
          page,
          asked: requests,
          errors,
        } = yield* openReview(
          [slowChoices, ...projectSays(catalogue), indexSays(catalogue), ...studioRoutes],
          { href: pageHref.set(STUDIO_FOLDER, STUDIO_SET) },
        );
        yield* waitFor(page, '.rv-set-tools[data-sources="project"]');
        yield* page.click('a.sh-tab[data-page="project"]');
        const approve =
          '.rv-scene[data-scene="open"] > .sc-card[data-size="tile"] [data-act="approve"]';
        yield* waitFor(page, approve);
        yield* page.click(approve);
        yield* waitFor(page, '.rv-scene[data-scene="open"] [data-approval="approved"]');
        // Back to the Set, and on to Project again, each in the page: the set mounts as the
        // entry lands, and reads the set untracked.
        yield* page.back;
        yield* waitFor(page, '.rv-set-tools[data-sources="project"]');
        expect(errors).toEqual([]);
        yield* page.forward;
        yield* waitFor(page, '.rv-scene[data-scene="open"] [data-approval="approved"]');
        // Back to the Set again: the version of open's render shows the approve too.
        yield* page.back;
        yield* waitFor(page, '.rv-card[data-id="main"] [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="approve"][data-approval="approved"]`);
        expect(catalogue.approved).toBe(true);
        expect(projectReads(requests)).toBe(1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an approve made elsewhere (the CLI, another tab) shows on Project after a Refresh, which reads the project again',
    () =>
      Effect.gen(function* () {
        const catalogue = { approved: false };
        const {
          page,
          asked: requests,
          errors,
        } = yield* openReview([...projectSays(catalogue), ...studioRoutes], {
          href: pageHref.project('toy'),
        });
        yield* waitFor(page, '.rv-scene[data-scene="open"] [data-act="approve"]');
        yield* countIs(page, '.rv-scene[data-scene="open"] [data-approval="approved"]', 0);
        catalogue.approved = true;
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* page.click('[data-role="view-menu"] [data-command="review.refresh"]');
        yield* waitFor(page, '.rv-scene[data-scene="open"] [data-approval="approved"]');
        expect(projectReads(requests)).toBe(2);
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
        // The project answered and was applied: the folder is not its own, so the record judges.
        yield* waitFor(page, '.rv-set-tools[data-sources="record"]');
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
    'a film added while its Set is open is judged by its project once Refresh reads the films again: until then, by its record',
    () =>
      Effect.gen(function* () {
        // The app has no film of the folder's title when the page loads; a later read has it.
        const answers = [[], ['toy']];
        let reads = 0;
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/films$/, () => {
              const films = answers[Math.min(reads, 1)] ?? [];
              reads += 1;
              return json({ films });
            }),
            ...studioRoutes,
          ],
          { href: pageHref.set(STUDIO_FOLDER, STUDIO_SET) },
        );
        yield* waitFor(page, '.rv-set-tools[data-sources="record"]');
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* page.click('[data-role="view-menu"] [data-command="review.refresh"]');
        yield* waitFor(page, '.rv-set-tools[data-sources="project"]');
        expect(reads).toBe(2);
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
