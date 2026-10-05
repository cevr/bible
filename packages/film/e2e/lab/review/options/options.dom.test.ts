// A film's choices in a browser, its routes faked over a synthetic film with
// a score of three options, one library sound's takes, a look and a level:
// home links the film; its page puts the render on the clock and one mix
// heard over it (🔊 swaps it: a score option's, a take's in place); Pick
// writes `play`, the page reads the film again (the pick shown, its receipt
// saying it before → after with an Undo, the check after it) and runs the
// sound check, showing its
// findings; a take is kept; a look picked; a level's knob set; a variant
// approved, commented on and its approval withdrawn; Undo (the receipt's, ⌘Z,
// or the menu's, naming what it
// undoes) is sent to the film's own route, and the choices it reads again,
// landing after a say asked later, leave the say shown; a mark
// jumps the clock from its card's menu or on `.`; ⌥→/⌥← audition a point's
// variants and Enter picks the one heard; a level's value is typed into its
// field; Show only… keeps the points in one state (`?only=`); a
// mix whose first load failed is heard once its retry
// lands; and a phone's width scrolls nothing sideways. Every wait is on the
// page (a selector, a condition) or its clock, never a fixed time.

import { Deferred, Effect, Exit, FileSystem, Option, Schedule, Schema } from 'effect';
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../../src/core/api.ts';
import type { Tab } from '../../../../src/lab/fixtures/tab.ts';
import {
  type FakeRoute,
  type Json,
  changeOf,
  file,
  json,
  later,
  openReview,
  refused,
  route,
  text,
} from '../../../../src/lab/fixtures/harness.ts';
import {
  SourceRefused,
  StepNotNewest,
  TakeMismatch,
  UndoUnavailable,
  newerFirst,
} from '../../../../src/core/refusals.ts';
import {
  MENU_ITEMS,
  closeCommandMenu,
  menuEntry,
  menuOffers,
  openCommandMenu,
  rightClick,
  touch,
} from '../../../../src/lab/fixtures/gestures.ts';
import {
  attributeIs,
  attributesAre,
  countIs,
  evaluates,
  textHas,
  textIs,
  until,
  valueIs,
  waitFor,
} from '../../../../src/lab/fixtures/settled.ts';
import { tone } from '../../../../src/lab/fixtures/tone.ts';

const SLOW = 30_000;

/** A posted body as its JSON text. */
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const KEPT = 'a'.repeat(64);
const WAITING = 'b'.repeat(64);

interface VariantFields {
  readonly state?: string;
  readonly picked?: boolean;
  readonly verbs?: ReadonlyArray<string>;
  readonly media?: Json;
  readonly approval?: string;
  readonly comments?: ReadonlyArray<Json>;
}

/** A variant as the server encodes it. */
const variant = (id: string, fields: VariantFields = {}): Json => ({
  id,
  label: id.slice(0, 12),
  lines: [`${id.slice(0, 12)} line`],
  state: fields.state ?? 'current',
  picked: fields.picked ?? false,
  verbs: fields.verbs ?? [],
  media: fields.media ?? { _tag: 'Heard', alone: false, inPlace: true },
  key: id,
  approval: fields.approval ?? 'none',
  comments: fields.comments ?? [],
});

/** A point as the server encodes it. */
const point = (
  id: string,
  kind: string,
  address: Json,
  variants: ReadonlyArray<Json>,
  more: { readonly marks?: ReadonlyArray<Json>; readonly knob?: Json } = {},
): Json => ({
  id,
  kind,
  address,
  title: id,
  lines: [],
  start: 0,
  marks: more.marks ?? [],
  ...Option.match(Option.fromUndefinedOr(more.knob), {
    onNone: () => ({}),
    onSome: (knob) => ({ knob }),
  }),
  variants,
});

const FILM_AT: Json = { _tag: 'Film' };
const OPEN_AT: Json = { _tag: 'Scenes', ids: ['open'] };

/** The fake film's state: what it plays, and what was said. */
interface Toy {
  picked: string;
  look: string;
  level: number;
  approved: boolean;
  said: ReadonlyArray<string>;
}

const SCORE_STATES = new Map([
  ['strings', 'current'],
  ['piano', 'stale'],
  ['choir', 'missing'],
]);

/** What was said of the strings option, as the server lists it. */
const saidOf = (toy: Toy): ReadonlyArray<Json> =>
  toy.said.map((t, i) => ({
    id: `c${i + 1}`,
    address: FILM_AT,
    point: 'score',
    variant: 'strings',
    key: 'strings',
    text: t,
    at: i,
    onThis: true,
  }));

const scoreOption = (toy: Toy, id: string): Json => {
  const own = id === 'strings';
  return variant(id, {
    state: SCORE_STATES.get(id),
    picked: id === toy.picked,
    verbs: [id].filter((v) => v !== toy.picked && v !== 'choir').map(() => 'pick'),
    media: { _tag: 'Heard', alone: false, inPlace: id !== 'choir' },
    approval: [own && toy.approved].filter(Boolean).map(() => 'approved')[0] ?? 'none',
    comments: [own].filter(Boolean).flatMap(() => saidOf(toy)),
  });
};

const choices = (toy: Toy, more: ReadonlyArray<Json> = []): Json => ({
  film: 'toy',
  pictures: [{ ref: 'out/toy/toy.mp4', name: 'toy.mp4', size: 2048, mtime: 0, phone: 'none' }],
  points: [
    point(
      'score',
      'score',
      FILM_AT,
      ['strings', 'piano', 'choir'].map((id) => scoreOption(toy, id)),
    ),
    point(
      'look:ground',
      'look',
      FILM_AT,
      ['now', 'light'].map((id) =>
        variant(id, {
          picked: id === toy.look,
          verbs: [id].filter((v) => v !== toy.look).map(() => 'pick'),
          media: { _tag: 'Unseen' },
        }),
      ),
    ),
    point(
      'take:paper.page',
      'take',
      OPEN_AT,
      [
        variant(KEPT, {
          picked: true,
          verbs: ['unpick'],
          media: { _tag: 'Heard', alone: true, inPlace: true },
        }),
        variant(WAITING, {
          verbs: ['pick', 'reject'],
          media: { _tag: 'Heard', alone: true, inPlace: true },
        }),
      ],
      { marks: [{ t: 2, label: 'hush · open' }] },
    ),
    point('level:const:PAPER', 'level', OPEN_AT, [], {
      knob: { value: toy.level, min: -40, max: 0, step: 0.5, unit: 'dB' },
    }),
    ...more,
  ],
});

/** The text of a posted body, when it has one. */
const bodyText = (body: Option.Option<Json>): string =>
  Option.getOrElse(Option.map(body, jsonText), () => '');

/** The fake film as it opens: strings picked, nothing said. */
const freshToy = (): Toy => ({
  picked: 'strings',
  look: 'now',
  level: -24,
  approved: false,
  said: [],
});

/** One change in the fake film's history: what it changed, and how Undo puts it back. */
interface FakeChange {
  readonly target: string;
  readonly file: string;
  readonly back: () => void;
}

/**
 * The fake film: its choices, its writes, its check and its sound check,
 * over `toy`. Its source writes stack as the lab's do (`undos`, newest
 * last): Undo puts the newest back, and one asked for another change (a
 * receipt's) is refused as the lab refuses it.
 */
const fakeFilm = (toy: Toy = freshToy(), undos: Array<FakeChange> = []) => {
  const top = () => Option.fromUndefinedOr(undos.at(-1));
  const history = () =>
    Option.match(top(), {
      onNone: () => ({}),
      onSome: (c) => ({ undo: { file: c.file, target: c.target, change: changeOf(c.target) } }),
    });
  const wrote = (target: string, file: string): Json => ({
    file,
    target,
    change: changeOf(target),
    choices: choices(toy),
    findings: [],
  });
  /** A source write of `target` to `file`, which `back` puts back. */
  const made = (target: string, file: string, back: () => void) => {
    undos.push({ target, file, back });
    return json(wrote(target, file));
  };
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/api\/review\/index/, () => json({ folders: [] })),
    route('GET', /^\/api\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/api\/films\/toy\/choices$/, () => json(choices(toy))),
    route('GET', /^\/api\/films\/toy\/choices\/check$/, () =>
      json({
        findings: [
          {
            level: 'warning',
            tag: 'Balance',
            message: `the score sits under the voice at ${toy.picked}`,
            address: { part: { _tag: 'Film' }, time: 2 },
          },
        ],
      }),
    ),
    route('GET', /^\/api\/films\/toy\/check$/, () =>
      json({
        findings: Option.match(top(), {
          onNone: () => [],
          onSome: () => [{ level: 'warning', tag: 'score', message: 'piano is stale' }],
        }),
        ...history(),
      }),
    ),
    route('POST', /^\/api\/films\/toy\/choices\/pick$/, (asked) => {
      const body = bodyText(asked.body);
      if (body.includes('look:ground')) {
        const was = toy.look;
        toy.look = 'light';
        return made('look ground play light', 'palette.ts', () => {
          toy.look = was;
        });
      }
      if (body.includes('take:paper.page'))
        return made(
          'sound paper.page keep bbbbbbbbbbbb',
          '../../sounds/library.lock.json',
          () => {},
        );
      const was = toy.picked;
      toy.picked = 'piano';
      return made('score play piano', 'sound.ts', () => {
        toy.picked = was;
      });
    }),
    route('POST', /^\/api\/films\/toy\/choices\/knob$/, () => {
      const was = toy.level;
      toy.level = -20;
      return made('level:const:PAPER -20', 'sound.ts', () => {
        toy.level = was;
      });
    }),
    route('POST', /^\/api\/films\/toy\/choices\/say$/, (asked) => {
      const body = bodyText(asked.body);
      if (body.includes('"Approve"')) toy.approved = true;
      if (body.includes('"Withdraw"')) toy.approved = false;
      if (body.includes('"Comment"')) toy.said = [...toy.said, 'warmer in the close'];
      return json(choices(toy));
    }),
    route('GET', /^\/api\/films\/toy\/steps$/, () => json(history())),
    route('POST', /^\/api\/films\/toy\/undo$/, (asked) =>
      Option.match(top(), {
        onNone: () =>
          refused(UndoUnavailable.make({ reason: 'the lab has made no change to toy to undo' })),
        onSome: (c) => {
          // Asked for one change (a receipt's): that one, while it is the newest; else refused.
          const asks = bodyText(asked.body);
          if (asks.includes('"change"') && !asks.includes(`"${changeOf(c.target)}"`))
            return refused(
              StepNotNewest.make({ verb: 'undo', reason: newerFirst('undo', c.target) }),
            );
          undos.pop();
          c.back();
          return json({
            file: c.file,
            target: `undo ${c.target}`,
            change: changeOf(c.target),
            findings: [],
          });
        },
      }),
    ),
  ];
  return routes;
};

const FILM = pageHref.choices('toy');

const click = (page: Tab, selector: string) => page.click(selector);

// In parentheses: a check reads `${MIX}.endsWith(…)`, which must test the src, not the `''`.
const MIX = "(document.querySelector('audio.rv-mix')?.getAttribute('src') ?? '')";

/** A variant's element by its point and id. */
const at = (point: string, id: string) => `[data-point="${point}"] [data-variant="${id}"]`;

/** The open inspector: one at a time. */
const INSPECTOR = '[data-role="inspector"]';

/** Open the inspector of the thing at `row` by a tap on its name. */
const inspect = (page: Tab, row: string) =>
  Effect.andThen(click(page, `${row} [data-act="inspect"]`), waitFor(page, INSPECTOR));

/** The film's receipt: what its newest write did, before → after, or why it was refused. */
const RECEIPT = '[data-receipt="film"]';

/** Wait until the film's receipt reads something containing `part`. */
const receiptSays = (page: Tab, part: string) =>
  textHas(page, `${RECEIPT} .lab-receipt-said`, part);

/** The body a POST to `path` carried. */
const posted = (
  asked: ReadonlyArray<{ readonly path: string; readonly body: Option.Option<Json> }>,
  path: string,
) =>
  Option.getOrUndefined(
    Option.flatMap(Option.fromUndefinedOr(asked.find((a) => a.path === path)), (a) => a.body),
  );

/**
 * The lab's wait for a film's mixes: the first wait answers `build` once
 * `mixed` is done, every later one only once `never` is.
 */
const mixWait = (mixed: Deferred.Deferred<void>, never: Deferred.Deferred<void>, build: number) => {
  let waits = 0;
  return route('GET', /^\/api\/review\/build/, () => {
    waits += 1;
    if (waits === 1) return later(mixed, json({ build, server: 'lab' }));
    return later(never, json({ build, server: 'lab' }));
  });
};

/** A score pick of piano whose answer stamps the mix it made `build`, as the lab's does. */
const stampedPick = (toy: Toy, build: number) =>
  route('POST', /^\/api\/films\/toy\/choices\/pick$/, () => {
    toy.picked = 'piano';
    return json({
      file: 'sound.ts',
      target: 'score play piano',
      change: changeOf('score play piano'),
      choices: choices(toy),
      findings: [],
      mixed: { build, server: 'lab' },
    });
  });

/** How many times the film's steps were read. */
const stepsRead = (asked: ReadonlyArray<{ readonly method: string; readonly path: string }>) =>
  asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/steps').length;

/** Wait, on the test's side, until `done` holds. */
const holds = (done: () => boolean) =>
  Effect.void.pipe(
    Effect.repeat({ until: done, schedule: Schedule.spaced('50 millis') }),
    Effect.timeout('10 seconds'),
  );

describe("a film's choices", () => {
  it.live(
    "home's film card opens its choices; its page hears the picked option over the render, and 🔊 swaps it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm());
        // A film card opens its choices from its context menu, which offers each of its parts.
        yield* rightClick(page, '.rv-film-card[data-film="toy"]');
        yield* evaluates(page, `${MENU_ITEMS}.filter((id) => id.startsWith('film.'))`, [
          'film.scenes',
          'film.lab',
          'film.choices',
          'film.project',
          'film.play',
        ]);
        yield* click(page, '[data-role="context-menu"] [data-command="film.choices"]');
        yield* until(page, `location.pathname === '${FILM}'`);
        yield* waitFor(page, '.rv-transport');
        yield* waitFor(page, '.rv-picture video');
        // The picked option is heard first; the picture's own sound is muted.
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* evaluates(page, "document.querySelector('.rv-picture video').muted", true);
        // A row says its state only when it is not current, in a word (UR2-2); a take in place
        // says nothing of it: its 🔊 hears it over the picture.
        yield* countIs(page, `${at('score', 'strings')} [data-state]:not([data-variant])`, 0);
        yield* textIs(page, `${at('score', 'piano')} .rv-badge[data-state="stale"]`, 'Out of date');
        yield* textIs(
          page,
          `${at('score', 'choir')} .rv-badge[data-state="missing"]`,
          'Not made yet',
        );
        yield* evaluates(
          page,
          "document.querySelector('.rv-main').innerText.includes('in place')",
          false,
        );
        // A missing option cannot be heard.
        yield* countIs(page, `${at('score', 'choir')} [data-act="hear"]`, 0);
        yield* click(page, `${at('score', 'piano')} [data-act="hear"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=piano')`,
        );
        yield* waitFor(page, `${at('score', 'piano')} [data-act="hear"][aria-pressed="true"]`);
        // A take in place, and alone.
        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="hear"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=take%3Apaper.page&variant=${WAITING}')`,
        );
        // Alone: no player bar per take, one ▶ on the film's one alone player (UR-52).
        yield* countIs(page, 'audio[controls]', 0);
        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="hear-alone"]`);
        yield* attributeIs(
          page,
          'audio.rv-alone',
          'src',
          `/api/films/toy/choices/alone?point=take%3Apaper.page&variant=${WAITING}`,
        );
        yield* waitFor(
          page,
          `${at('take:paper.page', WAITING)} [data-act="hear-alone"][aria-pressed="true"]`,
        );
        // Pressed again it stops; the clock played, it stops too.
        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="hear-alone"]`);
        yield* countIs(page, 'audio.rv-alone', 0);
        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="hear-alone"]`);
        yield* countIs(page, 'audio.rv-alone', 1);
        yield* click(page, '.rv-transport [data-act="play"]');
        yield* countIs(page, 'audio.rv-alone', 0);
        yield* click(page, '.rv-transport [data-act="play"]');
        // The picture's own sound: no mix, the picture heard.
        yield* click(page, '.rv-picture [data-act="hear"]');
        yield* until(page, "document.querySelector('audio.rv-mix') === null");
        yield* until(page, "document.querySelector('.rv-picture video').muted === false");
        // A mark jumps the clock to it, from its card's menu (UR-45); none at rest.
        yield* countIs(page, '[data-point="take:paper.page"] button[data-at]', 0);
        yield* rightClick(page, '[data-point="take:paper.page"] > .rv-cap .rv-name');
        yield* click(
          page,
          '[data-role="context-menu"] [data-command="review.mark.take:paper.page.0"]',
        );
        yield* until(
          page,
          "document.querySelector('.rv-time').textContent.startsWith('00:00:02:00')",
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a second tab hears another tab's pick: the film mixed again, it reads its choices again and asks its mix again",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        // The lab's wait: the film's track mixed again once the other tab's pick lands, then nothing.
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        let waits = 0;
        const build = route('GET', /^\/api\/review\/build/, () => {
          waits += 1;
          if (waits === 1) return later(mixed, json({ build: 1, server: 'lab' }));
          return later(never, json({ build: 1, server: 'lab' }));
        });
        const { page, errors } = yield* openReview([build, ...fakeFilm(toy)], {
          href: FILM,
          build: { build: 0, server: 'lab' },
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=0')`);
        // Another tab picks piano: the source changes and the lab mixes the track again.
        toy.picked = 'piano';
        yield* Deferred.done(mixed, Exit.void);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a mix made elsewhere with the same choices (a fade remixed, a change another tab made and undid) is asked again, and the steps read again',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const undos: Array<FakeChange> = [];
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        let waits = 0;
        const build = route('GET', /^\/api\/review\/build/, () => {
          waits += 1;
          if (waits === 1) return later(mixed, json({ build: 1, server: 'lab' }));
          return later(never, json({ build: 1, server: 'lab' }));
        });
        const { page, asked, errors } = yield* openReview([build, ...fakeFilm(toy, undos)], {
          href: FILM,
          build: { build: 0, server: 'lab' },
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=0')`);
        const stepsRead = () =>
          asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/steps').length;
        const before = stepsRead();
        // Elsewhere the film is remixed and a change is left to undo, the choices as they were.
        undos.push({ target: 'bed amb.hall fade 2', file: 'sound.ts', back: () => {} });
        yield* Deferred.done(mixed, Exit.void);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        yield* Effect.void.pipe(
          Effect.repeat({
            until: () => stepsRead() > before,
            schedule: Schedule.spaced('50 millis'),
          }),
          Effect.timeout('10 seconds'),
        );
        expect(stepsRead()).toBeGreaterThan(before);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a mix heard past this tab's own (another tab's fade remixed in the same settle) is asked again, though the choices did not move",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const { page, errors } = yield* openReview(
          [mixWait(mixed, never, 2), stampedPick(toy, 1), ...fakeFilm(toy)],
          { href: FILM, build: { build: 0, server: 'lab' } },
        );
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=0')`);
        // This tab's pick lands with the mix it made, stamped 1: its mix is asked again.
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        // One wake for that mix and another tab's fade remixed within the settle: stamped 2.
        yield* Deferred.done(mixed, Exit.void);
        yield* until(page, `${MIX}.endsWith('&v=2')`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a mix heard at this tab's own write's stamp asks nothing again: the mix it asked plays on",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const { page, asked, errors } = yield* openReview(
          [mixWait(mixed, never, 1), stampedPick(toy, 1), ...fakeFilm(toy)],
          { href: FILM, build: { build: 0, server: 'lab' } },
        );
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        const before = stepsRead(asked);
        // The wake is the pick's own mix: heard (the steps read again), its mix not asked again.
        yield* Deferred.done(mixed, Exit.void);
        yield* holds(() => stepsRead(asked) > before);
        yield* page.clock.runFor(100);
        yield* evaluates(page, `${MIX}.endsWith('&v=1')`, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a mix made elsewhere after a write that mixed nothing and one refused is asked again',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const refusedPick = route('POST', /^\/api\/films\/toy\/choices\/pick$/, (asked) => {
          if (bodyText(asked.body).includes('look:ground')) {
            toy.look = 'light';
            return json({
              file: 'palette.ts',
              target: 'look ground play light',
              change: changeOf('look ground play light'),
              choices: choices(toy),
              findings: [],
            });
          }
          return refused(
            SourceRefused.make({ file: 'sound.ts', target: 'play', reason: 'computed' }),
          );
        });
        const { page, errors } = yield* openReview(
          [mixWait(mixed, never, 1), refusedPick, ...fakeFilm(toy)],
          { href: FILM, build: { build: 0, server: 'lab' } },
        );
        yield* waitFor(page, `${at('look:ground', 'now')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=0')`);
        // A look picked: a source write, its answer stamping no mix (it made none).
        yield* click(page, `${at('look:ground', 'light')} [data-act="pick"]`);
        yield* waitFor(page, `${at('look:ground', 'light')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        // A score pick refused: it wrote nothing.
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
        // Another tab's fade remixed, the choices as they were: the mix is asked again.
        yield* Deferred.done(mixed, Exit.void);
        yield* until(page, `${MIX}.endsWith('&v=2')`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a comment answered before a mix's read of the choices leaves the mix asked again and the steps read, and the comment shown",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const answer = yield* Deferred.make<void>();
        let reads = 0;
        // The first read answers at once; the read after the mix waits on the test.
        const held = route('GET', /^\/api\/films\/toy\/choices$/, () => {
          reads += 1;
          if (reads === 1) return json(choices(toy));
          return later(answer, json(choices(toy)));
        });
        const { page, asked, errors } = yield* openReview(
          [mixWait(mixed, never, 1), held, ...fakeFilm(toy)],
          { href: FILM, build: { build: 0, server: 'lab' } },
        );
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=0')`);
        yield* inspect(page, at('score', 'strings'));
        const before = stepsRead(asked);
        // The film is mixed elsewhere: its choices are read again, and the read is held…
        yield* Deferred.done(mixed, Exit.void);
        yield* holds(() => reads >= 2);
        // …while a comment, asked after it, lands first: the read's choices are older.
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'warmer in the close');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* Deferred.done(answer, Exit.void);
        // The mix and the steps are the mix's to refresh, whoever's choices are shown.
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        yield* holds(() => stepsRead(asked) > before);
        yield* page.clock.runFor(100);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a film's read again after a mix elsewhere stops with its page: left for another, nothing it asked lands",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const mixed = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const answer = yield* Deferred.make<void>();
        let waits = 0;
        let reads = 0;
        const build = route('GET', /^\/api\/review\/build/, () => {
          waits += 1;
          if (waits === 1) return later(mixed, json({ build: 1, server: 'lab' }));
          return later(never, json({ build: 1, server: 'lab' }));
        });
        // The first read answers at once; the read after the mix waits on the test.
        const held = route('GET', /^\/api\/films\/toy\/choices$/, () => {
          reads += 1;
          if (reads === 1) return json(choices(toy));
          return later(answer, json(choices(toy)));
        });
        const { page, asked, errors } = yield* openReview([build, held, ...fakeFilm(toy)], {
          href: FILM,
          build: { build: 0, server: 'lab' },
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        // Another tab picks piano and the film is mixed again: this page reads its choices again…
        toy.picked = 'piano';
        yield* Deferred.done(mixed, Exit.void);
        yield* Effect.void.pipe(
          Effect.repeat({ until: () => reads >= 2, schedule: Schedule.spaced('50 millis') }),
          Effect.timeout('10 seconds'),
        );
        // …and is left for Films, in the page (the shell's link), before the read answers.
        yield* click(page, '.sh-films');
        yield* until(page, `location.pathname === '${pageHref.home()}'`);
        yield* countIs(page, '[data-point]', 0);
        const left = asked.length;
        yield* Deferred.done(answer, Exit.void);
        yield* page.evaluate('new Promise((done) => setTimeout(() => done(true), 800))');
        expect(asked.slice(left).filter((a) => a.path.startsWith('/api/films/toy/'))).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a time typed in the address bar seeks the player, and Back lands it on the time its entry keeps',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), { href: `${FILM}#t=2` });
        const time = "(document.querySelector('.rv-time')?.textContent ?? '')";
        yield* waitFor(page, '.rv-picture video');
        yield* until(page, `${time}.startsWith('00:00:02:00')`);
        // A new hash is an entry of its own (the browser's), landed on as Back lands.
        yield* page.evaluate("location.hash = '#t=5'; true");
        yield* until(page, `${time}.startsWith('00:00:05:00')`);
        yield* page.back;
        yield* until(page, "location.hash === '#t=2'");
        yield* until(page, `${time}.startsWith('00:00:02:00')`);
        // Past the time's throttle, the entry still keeps its own time.
        yield* page.evaluate('new Promise((done) => setTimeout(() => done(true), 600))');
        yield* until(page, "location.hash === '#t=2'");
        yield* until(page, `${time}.startsWith('00:00:02:00')`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the sound heard and the time are in the link, which opens the player as it was',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, '.rv-picture video');
        yield* click(page, `${at('score', 'piano')} [data-act="hear"]`);
        yield* until(page, "location.search === '?heard=score&variant=piano'");
        // `.` on the take's row jumps to the next place it plays.
        yield* page.focus(`${at('take:paper.page', WAITING)} [data-act="pick"]`);
        yield* page.press('.');
        yield* until(page, "location.hash === '#t=2'");
        const link = `${FILM}?heard=score&variant=piano#t=2`;
        yield* evaluates(page, 'location.pathname + location.search + location.hash', link);
        yield* page.goto(pageHref.home());
        yield* page.goto(`${FILM}?heard=own#t=2`);
        yield* waitFor(page, '.rv-picture [data-act="hear"][aria-pressed="true"]');
        yield* until(page, "document.querySelector('audio.rv-mix') === null");
        yield* until(
          page,
          "document.querySelector('.rv-time').textContent.startsWith('00:00:02:00')",
        );
        yield* page.goto(link);
        yield* waitFor(page, `${at('score', 'piano')} [data-act="hear"][aria-pressed="true"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=piano')`,
        );
        yield* until(
          page,
          "document.querySelector('.rv-time').textContent.startsWith('00:00:02:00')",
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Show only… in ⌘K keeps the points in one state, in the link, until Show every point',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, '[data-point="look:ground"]');
        yield* openCommandMenu(page, 'show only out of date');
        yield* click(page, menuEntry('review.only-stale'));
        yield* until(page, "location.search === '?only=stale'");
        // The score has a stale option; the look, the take and the level none.
        yield* countIs(page, '[data-point="look:ground"]', 0);
        yield* countIs(page, '[data-point="take:paper.page"]', 0);
        yield* waitFor(page, '[data-point="score"]');
        yield* textHas(page, '[data-only="stale"]', 'Showing only the points out of date');
        yield* menuOffers(page, 'show only', 'review.only-stale', false);
        yield* menuOffers(page, 'show every', 'review.only-all', true);
        // The link opens the page as it was.
        yield* page.reload;
        yield* waitFor(page, '[data-only="stale"]');
        yield* countIs(page, '[data-point="look:ground"]', 0);
        yield* click(page, '[data-act="show-every-point"]');
        yield* until(page, "location.search === ''");
        yield* waitFor(page, '[data-point="look:ground"]');
        yield* countIs(page, '[data-only]', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a pick is written and read back, the sound check shown after it, a take kept, and Undo sent',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        // Nothing to undo yet: the menu offers no Undo.
        yield* menuOffers(page, 'undo', 'review.undo', false);
        // No sound check before a pick.
        expect(asked.some((a) => a.path === '/api/films/toy/choices/check')).toBe(false);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        // The receipt says what the pick moved, before → after, and offers its Undo.
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Undo');
        // The menu's Undo says what it would undo.
        yield* openCommandMenu(page, 'undo');
        yield* textHas(page, menuEntry('review.undo'), 'Undo score play piano');
        yield* closeCommandMenu(page);
        expect(posted(asked, '/api/films/toy/choices/pick')).toEqual({
          point: 'score',
          variant: 'piano',
          verb: 'pick',
        });
        // The sound check runs after the pick: its count at rest, F walks the clock to its
        // finding's time (UR-37/38), and the count opens the Findings sheet that lists it.
        const soundCount = '[data-act="findings"][data-check="sound check"]';
        yield* waitFor(page, `${soundCount}[data-findings="1"]`);
        yield* countIs(page, '[data-role="findings"]', 0);
        yield* page.press('f');
        yield* until(page, "location.hash === '#t=2'");
        yield* click(page, soundCount);
        yield* textHas(
          page,
          '[data-role="findings"] [data-check="sound check"] li',
          'the score sits under the voice at piano',
        );
        yield* textIs(
          page,
          '[data-role="findings"] [data-check="sound check"] .rv-at',
          '00:00:02:00',
        );
        yield* click(page, '[data-act="close-findings"]');
        yield* countIs(page, '[data-role="findings"]', 0);
        // Every mix is asked for again once the source has changed.
        yield* until(page, `${MIX}.endsWith('&v=1')`);

        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="pick"]`);
        yield* receiptSays(page, `Picked ${WAITING.slice(0, 12)}`);
        // A kept take can only be unkept (and approved): at rest its approve, the rest in its inspector.
        yield* attributesAre(page, `${at('take:paper.page', KEPT)} button.sh-btn`, 'data-act', [
          'approve',
        ]);
        yield* inspect(page, at('take:paper.page', KEPT));
        yield* attributesAre(page, `${INSPECTOR} button.sh-btn`, 'data-act', [
          'approve',
          'unpick',
          'comment',
        ]);
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);

        // The receipt's Undo undoes the write it said (the take, by its change), and no
        // other; its own receipt offers Redo, and the pick before it is still to undo.
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid sound paper.page keep bbbbbbbbbbbb');
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Redo');
        expect(posted(asked, '/api/films/toy/undo')).toEqual({
          change: changeOf('sound paper.page keep bbbbbbbbbbbb'),
        });
        yield* openCommandMenu(page, 'undo');
        yield* textHas(page, menuEntry('review.undo'), 'Undo score play piano');
        yield* closeCommandMenu(page);
        yield* countIs(page, `${at('score', 'piano')} .rv-picked`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "an older receipt's Undo, a newer change before it, says why and steps nothing, until its own change is the newest",
    () =>
      Effect.gen(function* () {
        const undos: Array<FakeChange> = [];
        const { page, asked, errors } = yield* openReview(fakeFilm(freshToy(), undos), {
          href: FILM,
        });
        const undone = () =>
          asked.filter((a) => a.method === 'POST' && a.path === '/api/films/toy/undo');
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        // A second quick edit, from another page on the film (the lab's editor): a level.
        const level: FakeChange = {
          target: 'level:const:PAPER -20',
          file: 'sound.ts',
          back: () => {},
        };
        undos.push(level);
        // The receipt outlives the reload; the page reads the film's history as it now stands.
        yield* page.reload;
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* menuOffers(page, 'undo', 'review.undo', true);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'level:const:PAPER -20 came after it: undo that first');
        // Still offered, and nothing stepped: the newest change is not this receipt's.
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Undo');
        expect(undone()).toEqual([]);
        // The editor undoes its level: once the page reads that, the receipt says again what it did.
        undos.pop();
        yield* page.reload;
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        // A page that knew an older history asks for its change all the same, and the lab refuses.
        undos.push(level);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(
          page,
          'cannot undo that change: level:const:PAPER -20 came after it: undo that first',
        );
        expect(undone().map((a) => a.body)).toEqual([
          Option.some({ change: changeOf('score play piano') }),
        ]);
        yield* countIs(page, `${at('score', 'piano')} .rv-picked`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a receipt whose change the lab no longer has (it restarted) retires its Undo, saying so, rather than holding it as not available',
    () =>
      Effect.gen(function* () {
        const undos: Array<FakeChange> = [];
        const { page, asked, errors } = yield* openReview(fakeFilm(freshToy(), undos), {
          href: FILM,
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        // The lab restarts: its history, kept in memory, is gone.
        undos.splice(0);
        yield* page.reload;
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        // The page has read the lab's history: nothing to undo.
        yield* menuOffers(page, 'undo', 'review.undo', false);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        // Said why, and no Undo left on it: no press can ever step that change.
        yield* until(
          page,
          `(() => {
            const receipt = document.querySelector('${RECEIPT}');
            return (receipt?.textContent ?? '').includes(
              'the lab no longer has that change to undo: it was undone already, or the lab restarted since',
            ) && receipt.querySelectorAll('[data-act="receipt-undo"]').length === 0;
          })()`,
        );
        expect(asked.some((a) => a.method === 'POST' && a.path === '/api/films/toy/undo')).toBe(
          false,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a write that changed nothing (a level already so) offers no Undo, and the change before it is still the one to undo',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        // The level is already -24: the lab writes nothing and answers no change.
        const alreadySo = route('POST', /^\/api\/films\/toy\/choices\/knob$/, () =>
          json({
            file: 'sound.ts',
            target: 'level:const:PAPER -24 (already so)',
            choices: choices(toy),
            findings: [],
          }),
        );
        const { page, asked, errors } = yield* openReview([alreadySo, ...fakeFilm(toy)], {
          href: FILM,
        });
        const knob = '[data-knob="level:const:PAPER"]';
        yield* waitFor(page, `${knob} input`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Undo');
        yield* page.evaluate(`(() => {
            const input = document.querySelector('${knob} input');
            input.value = '-24';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        // Its receipt offers no Undo: one would step the pick, which this write did not make.
        // Both read at once, so the toast expiring cannot pass it.
        yield* until(
          page,
          `(() => {
            const receipt = document.querySelector('${RECEIPT}');
            return (receipt?.textContent ?? '').includes('level:const:PAPER: -24 → -24 dB') &&
              receipt.querySelectorAll('[data-act="receipt-undo"]').length === 0;
          })()`,
        );
        yield* openCommandMenu(page, 'undo');
        yield* textHas(page, menuEntry('review.undo'), 'Undo score play piano');
        yield* closeCommandMenu(page);
        expect(asked.some((a) => a.path === '/api/films/toy/undo')).toBe(false);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a receipt carried to another film's page says whose change it was and steps nothing there; back on its film it steps its own",
    () =>
      Effect.gen(function* () {
        const choir = {
          file: 'sound.ts',
          target: 'score play choir',
          change: changeOf('score play choir'),
        };
        // A second film whose own history has a change for its Undo.
        const tin: ReadonlyArray<FakeRoute> = [
          route('GET', /^\/api\/films$/, () => json({ films: ['toy', 'tin'] })),
          route('GET', /^\/api\/films\/tin\/choices$/, () =>
            json({ ...(choices(freshToy()) as Record<string, Json>), film: 'tin' }),
          ),
          route('GET', /^\/api\/films\/tin\/check$/, () => json({ findings: [], undo: choir })),
          route('GET', /^\/api\/films\/tin\/steps$/, () => json({ undo: choir })),
          route('POST', /^\/api\/films\/tin\/undo$/, () =>
            json({ ...choir, target: `undo ${choir.target}`, findings: [] }),
          ),
        ];
        const { page, asked } = yield* openReview([...tin, ...fakeFilm()], { href: FILM });
        const undone = () => asked.filter((a) => a.method === 'POST' && a.path.endsWith('/undo'));
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* page.goto(pageHref.choices('tin'));
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        // Tin's own Undo is available, and names tin's change; the receipt is toy's.
        yield* menuOffers(page, 'undo', 'review.undo', true);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'that was a change to toy: open toy to undo it');
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Undo');
        expect(undone()).toEqual([]);
        // On its own film again, it says what it did, and its Undo steps that change.
        yield* page.goto(FILM);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        yield* menuOffers(page, 'undo', 'review.undo', true);
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* receiptSays(page, 'Undid score play piano in sound.ts');
        expect(undone().map((a) => [a.path, a.body])).toEqual([
          ['/api/films/toy/undo', Option.some({ change: changeOf('score play piano') })],
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a long press on the page itself (on no thing) opens the page's menu: Undo, Show only…",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        // The clock held: the long press's delay passes only as the test runs it on.
        yield* page.clock.hold;
        yield* touch(page, '.sh-header', 0);
        yield* page.clock.runFor(700);
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.undo"]');
        yield* textHas(page, '[data-role="context-menu"] [data-command="review.undo"]', 'Undo');
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.only-stale"]');
        yield* page.finger.up;
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'choices read again after an undo, landing after a say asked later, leave the say shown',
    () =>
      Effect.gen(function* () {
        const routes = fakeFilm();
        const plain = Option.getOrThrow(
          Option.fromUndefinedOr(
            routes.find((r) => r.method === 'GET' && r.path.test('/api/films/toy/choices')),
          ),
        );
        // The read after the undo answers the choices as they stood when asked, once let land.
        const land = yield* Deferred.make<void>();
        let reads = 0;
        const lateRead = route('GET', /^\/api\/films\/toy\/choices$/, (asked) => {
          reads += 1;
          const then = plain.answer(asked);
          if (reads === 1) return then;
          return later(land, then);
        });
        const { page, asked, errors } = yield* openReview([lateRead, ...routes], {
          href: FILM,
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-picked`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* receiptSays(page, 'Picked piano');
        // Once the steps are read again, ⌘Z undoes it, as the menu's Undo would.
        yield* menuOffers(page, 'undo', 'review.undo', true);
        yield* page.press('Control+z');
        yield* Effect.sync(
          () =>
            asked.filter((a) => a.method === 'GET' && a.path === '/api/films/toy/choices').length,
        ).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, '.rv-writes', 'data-reading', 'true');
        // Said while the read is out: the say answers the choices with the comment.
        yield* inspect(page, at('score', 'strings'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'warmer in the close');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        // The older read lands last: the page has read it, and the comment stays.
        yield* Deferred.done(land, Exit.void);
        yield* attributeIs(page, '.rv-writes', 'data-reading', 'false');
        yield* countIs(page, `${INSPECTOR} [data-comment="c1"]`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the player lives through writes: a pick and a say keep the picture, a say the mix',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, '.rv-picture video');
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* page.evaluate(`(() => {
            window.__picture = document.querySelector('.rv-picture video');
            window.__mix = document.querySelector('audio.rv-mix');
          })()`);
        const same = "document.querySelector('.rv-picture video') === window.__picture";
        const sameMix = "document.querySelector('audio.rv-mix') === window.__mix";
        // A say answers new choices; the picture and the mix heard stay the same elements.
        yield* inspect(page, at('score', 'strings'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'warmer in the close');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* evaluates(page, same, true);
        yield* evaluates(page, sameMix, true);
        // A pick changes the source: the mix is asked for again, the picture plays on.
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        yield* until(page, `${MIX}.endsWith('&v=1')`);
        yield* evaluates(page, same, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a pick made while a comment is in flight leaves the comment its own answer',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const routes = fakeFilm(toy);
        // The comment is held: the server records it once the test lets it land.
        const land = yield* Deferred.make<void>();
        const heldSay = route('POST', /^\/api\/films\/toy\/choices\/say$/, () =>
          later(land, json(choices({ ...toy, said: [...toy.said, 'warmer in the close'] }))),
        );
        const { page, asked, errors } = yield* openReview([heldSay, ...routes], {
          href: FILM,
        });
        const box = `${INSPECTOR} .rv-comment-input`;
        const comment = `${INSPECTOR} [data-act="comment"]`;
        yield* inspect(page, at('score', 'strings'));
        yield* waitFor(page, box);
        yield* page.fill(box, 'warmer in the close');
        yield* click(page, comment);
        yield* Effect.sync(() => asked.some((a) => a.path === '/api/films/toy/choices/say')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
        // The comment's own button waits; a pick on another option is free to go.
        yield* evaluates(page, `document.querySelector('${comment}').disabled`, true);
        yield* evaluates(
          page,
          `document.querySelector('${at('score', 'piano')} [data-act="pick"]').disabled`,
          false,
        );
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-picked`);
        // The pick's answer is not the comment's: its box keeps the text.
        yield* evaluates(page, `document.querySelector('${box}').value`, 'warmer in the close');
        // The comment lands: the page shows it, and its box empties.
        yield* Effect.sync(() => {
          toy.said = [...toy.said, 'warmer in the close'];
        });
        yield* Deferred.done(land, Exit.void);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        yield* valueIs(page, box, '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a write asked earlier and answered later leaves a newer write's check shown",
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        // The pick is held, and answers a clean check once let land.
        const land = yield* Deferred.make<void>();
        const heldPick = route('POST', /^\/api\/films\/toy\/choices\/pick$/, () =>
          later(
            land,
            json({
              file: 'sound.ts',
              target: 'score play piano',
              choices: choices({ ...toy, picked: 'piano' }),
              findings: [],
            }),
          ),
        );
        // The knob, sent after it, answers a warning at once.
        const warnedKnob = route('POST', /^\/api\/films\/toy\/choices\/knob$/, () =>
          json({
            file: 'sound.ts',
            target: 'level:const:PAPER -20',
            choices: choices({ ...toy, level: -20 }),
            findings: [{ level: 'warning', tag: 'Balance', message: 'the paper is loud' }],
          }),
        );
        const { page, asked, errors } = yield* openReview(
          [heldPick, warnedKnob, ...fakeFilm(toy)],
          { href: FILM },
        );
        const knob = '[data-knob="level:const:PAPER"]';
        const findings = '[data-act="findings"][data-check="check"]';
        yield* waitFor(page, `${knob} input`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* Effect.sync(() => asked.some((a) => a.path === '/api/films/toy/choices/pick')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
        yield* page.evaluate(`(() => {
            const input = document.querySelector('${knob} input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        yield* attributeIs(page, findings, 'data-findings', '1');
        yield* receiptSays(page, 'level:const:PAPER: -24 → -20 dB');
        // The pick lands last: the knob's check, asked after it, stays, and
        // so does the knob's receipt.
        const pickLanded = yield* page.nextAnswer((a) => a.url.endsWith('/choices/pick'));
        yield* Deferred.done(land, Exit.void);
        yield* pickLanded;
        yield* page.clock.runFor(100);
        yield* attributeIs(page, findings, 'data-findings', '1');
        yield* textIs(page, `${RECEIPT} .lab-receipt-said`, 'level:const:PAPER: -24 → -20 dB');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a write that fails while an earlier one is in flight keeps its failure on the receipt',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        const land = yield* Deferred.make<void>();
        const heldPick = route('POST', /^\/api\/films\/toy\/choices\/pick$/, () =>
          later(
            land,
            json({
              file: 'sound.ts',
              target: 'score play piano',
              choices: choices({ ...toy, picked: 'piano' }),
              findings: [],
            }),
          ),
        );
        const refusedKnob = route('POST', /^\/api\/films\/toy\/choices\/knob$/, () =>
          refused(SourceRefused.make({ file: 'sound.ts', target: 'PAPER', reason: 'computed' })),
        );
        const { page, asked, errors } = yield* openReview(
          [heldPick, refusedKnob, ...fakeFilm(toy)],
          { href: FILM },
        );
        const knob = '[data-knob="level:const:PAPER"]';
        yield* waitFor(page, `${knob} input`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* Effect.sync(() => asked.some((a) => a.path === '/api/films/toy/choices/pick')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
        yield* page.evaluate(`(() => {
            const input = document.querySelector('${knob} input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        yield* Effect.sync(() => asked.some((a) => a.path === '/api/films/toy/choices/knob')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
        yield* waitFor(page, `${knob} input:not([disabled])`);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
        // The pick, asked first, lands last: the knob's failure is the newest said.
        const pickLanded = yield* page.nextAnswer((a) => a.url.endsWith('/choices/pick'));
        yield* Deferred.done(land, Exit.void);
        yield* pickLanded;
        yield* page.clock.runFor(100);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a look is picked, a level's knob set, and a variant approved and commented on",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, `${at('look:ground', 'now')} .rv-picked`);
        yield* click(page, `${at('look:ground', 'light')} [data-act="pick"]`);
        yield* waitFor(page, `${at('look:ground', 'light')} .rv-picked`);
        expect(posted(asked, '/api/films/toy/choices/pick')).toEqual({
          point: 'look:ground',
          variant: 'light',
          verb: 'pick',
        });

        // The knob is written on release.
        yield* page.evaluate(`(() => {
            const input = document.querySelector('[data-knob="level:const:PAPER"] input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        yield* receiptSays(page, 'level:const:PAPER: -24 → -20 dB');
        expect(posted(asked, '/api/films/toy/choices/knob')).toEqual({
          point: 'level:const:PAPER',
          value: -20,
        });

        yield* click(page, `${at('score', 'strings')} [data-act="approve"]`);
        yield* waitFor(
          page,
          `${at('score', 'strings')} [data-act="approve"][data-approval="approved"]`,
        );
        expect(posted(asked, '/api/films/toy/choices/say')).toEqual({
          point: 'score',
          variant: 'strings',
          say: { _tag: 'Approve' },
        });
        yield* inspect(page, at('score', 'strings'));
        yield* page.fill(`${INSPECTOR} .rv-comment-input`, 'warmer in the close');
        yield* click(page, `${INSPECTOR} [data-act="comment"]`);
        yield* waitFor(page, `${INSPECTOR} [data-comment="c1"]`);
        expect(
          asked
            .filter((a) => a.path === '/api/films/toy/choices/say')
            .map((a) => Option.getOrUndefined(a.body)),
        ).toEqual([
          { point: 'score', variant: 'strings', say: { _tag: 'Approve' } },
          {
            point: 'score',
            variant: 'strings',
            say: { _tag: 'Comment', text: 'warmer in the close' },
          },
        ]);
        // An approval is unapproved from its inspector; the card's approve is back at rest.
        yield* click(page, `${INSPECTOR} [data-act="unapprove"]`);
        yield* waitFor(
          page,
          `${at('score', 'strings')} [data-act="approve"][data-approval="none"]`,
        );
        // The card counts the comment; the list is in the inspector, not on the card.
        yield* textIs(page, `${at('score', 'strings')} .lab-count`, '1');
        yield* countIs(page, `${at('score', 'strings')} [data-comment]`, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a knob whose write is refused shows the film's value again, beside the failure",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(
          [
            route('POST', /^\/api\/films\/toy\/choices\/knob$/, () =>
              refused(
                SourceRefused.make({ file: 'sound.ts', target: 'PAPER', reason: 'computed' }),
              ),
            ),
            ...fakeFilm(),
          ],
          { href: FILM },
        );
        const knob = '[data-knob="level:const:PAPER"]';
        yield* waitFor(page, `${knob} input`);
        yield* page.evaluate(`(() => {
            const input = document.querySelector('${knob} input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
        // Its value's field and its slider both read the film's value again, in its unit.
        yield* valueIs(page, `${knob} .lab-num`, '-24');
        yield* textIs(page, `${knob} .rv-tag`, 'dB');
        yield* valueIs(page, `${knob} input[type="range"]`, '-24');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a mix that loads on a retry while the film plays is heard',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'options-mix-' });
        // The picture and the mix: ten seconds of tone each, real media the page plays.
        const wav = `${dir}/tone.wav`;
        yield* fs.writeFile(wav, tone(10, 0.1));
        let asks = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', /^\/api\/review\/files\/out\/toy\/toy\.mp4/, () => file(wav)),
          // The first ask is cut off while the mix renders; the retry finds it made.
          route('GET', /^\/api\/films\/toy\/choices\/mix\?point=score&variant=strings/, () => {
            asks += 1;
            if (asks === 1) return text('the connection dropped', 502);
            return file(wav);
          }),
          ...fakeFilm(),
        ];
        const { page, errors } = yield* openReview(routes, { href: FILM });
        yield* waitFor(page, '.rv-picture video');
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* until(page, "document.querySelector('audio.rv-mix').error !== null");
        yield* page.press('Space');
        // The requested play is kept while the missing mix buffers.
        yield* textIs(page, '.rv-transport [data-act="play"]', '❚❚');
        // Fire the retry deadline once; intermediate picture frames aren't asserted.
        yield* page.clock.fastForward(5_000);
        yield* until(page, "document.querySelector('audio.rv-mix').readyState >= 1");
        expect(asks).toBe(2);
        // The reload stalls the set (Buffering) until the mix can play, and the set resumes it.
        yield* until(page, "document.querySelector('.rv-picture video').paused === false");
        yield* until(page, "document.querySelector('audio.rv-mix').paused === false");
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SLOW,
  );

  it.live(
    'on a phone, a picture whose proxy is still being made says so and streams nothing',
    () =>
      Effect.gen(function* () {
        const pending = route('GET', /^\/api\/films\/toy\/choices$/, () =>
          json({
            ...(choices(freshToy()) as Record<string, Json>),
            pictures: [
              {
                ref: 'out/toy/toy.mp4',
                name: 'toy.mp4',
                size: 900_000_000,
                mtime: 0,
                phone: 'pending',
              },
            ],
          }),
        );
        const { page, errors } = yield* openReview([pending, ...fakeFilm()], {
          href: FILM,
          viewport: { width: 390, height: 844 },
        });
        yield* waitFor(page, '.rv-picture [data-proxy="pending"]');
        yield* textHas(page, '.rv-picture [data-proxy="pending"]', 'Proxy being made');
        yield* countIs(page, '.rv-picture video', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "lists its points one under another across the page, each variant's verbs on its name's row",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), {
          href: FILM,
          viewport: { width: 1440, height: 900 },
        });
        const take = at('take:paper.page', WAITING);
        yield* waitFor(page, `${take} [data-act="pick"]`);
        // Every card is as wide as the page's column: no column of cards beside an empty two.
        yield* evaluates(
          page,
          "(() => { const main = document.querySelector('.rv-main').getBoundingClientRect().width; return [...document.querySelectorAll('.rv-option')].every((c) => c.getBoundingClientRect().width >= main - 64); })()",
          true,
        );
        // A row is one line of the list: its verb sits level with its name, at the row's end.
        yield* evaluates(
          page,
          `(() => { const name = document.querySelector('${take} .rv-name').getBoundingClientRect(); const pick = document.querySelector('${take} [data-act="pick"]').getBoundingClientRect(); const row = document.querySelector('${take}').getBoundingClientRect(); return pick.top < name.bottom && row.right - pick.right < 48; })()`,
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "scrolls nothing sideways at a phone's width",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), {
          href: FILM,
          viewport: { width: 390, height: 844 },
        });
        yield* waitFor(page, '[data-point="take:paper.page"]');
        yield* evaluates(page, 'document.documentElement.scrollWidth <= innerWidth', true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a variant's rare verbs are one step away: in its context menu, its keys and its inspector",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { href: FILM });
        const waiting = at('take:paper.page', WAITING);
        yield* waitFor(page, `${waiting} [data-act="pick"]`);
        // At rest a waiting take offers its keep, never its reject or its approve (it is not the kept one).
        yield* attributesAre(page, `${waiting} button.sh-btn`, 'data-act', ['pick']);
        yield* rightClick(page, `${waiting} .rv-name`);
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.reject"]');
        yield* evaluates(page, `${MENU_ITEMS}.filter((id) => id.startsWith('review.'))`, [
          'review.inspect',
          'review.comment',
          'review.approve',
          'review.reject',
          'review.mark.take:paper.page.0',
        ]);
        // Its menu's Inspect opens the inspector, which offers the reject too.
        yield* click(page, '[data-role="context-menu"] [data-command="review.inspect"]');
        yield* waitFor(page, `${INSPECTOR} [data-act="reject"]`);
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);
        // `x` on the focused take rejects it, as its button does.
        yield* page.focus(`${waiting} [data-act="pick"]`);
        yield* page.press('x');
        yield* Effect.sync(() => asked.some((a) => a.path === '/api/films/toy/choices/pick')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
        expect(posted(asked, '/api/films/toy/choices/pick')).toEqual({
          point: 'take:paper.page',
          variant: WAITING,
          verb: 'reject',
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a voice heard as something else is refused with Accept anyway, on its receipt and its menu, which keeps it',
    () =>
      Effect.gen(function* () {
        const toy = freshToy();
        // Beat `a`'s two readings: the take, and an attempt heard as something else.
        const voice = point('voice:a', 'voice', OPEN_AT, [
          variant('a.take.flac', { picked: true }),
          variant('a.other.flac', {
            verbs: ['pick'],
            media: { _tag: 'Heard', alone: true, inPlace: false },
          }),
        ]);
        const voiced = route('GET', /^\/api\/films\/toy\/choices$/, () =>
          json(choices(toy, [voice])),
        );
        // Refused as heard as something else, unless the pick accepts it anyway.
        const picks = route('POST', /^\/api\/films\/toy\/choices\/pick$/, (asked) => {
          if (bodyText(asked.body).includes('"acceptMismatch":true'))
            return json({
              file: 'narration/timings.json',
              target: 'voice a keep a.other.flac',
              choices: choices(toy, [voice]),
              findings: [],
            });
          return refused(
            TakeMismatch.make({
              id: 'a',
              script: 'Hello world.',
              heard: 'Goodbye moon.',
              wer: 1.5,
            }),
          );
        });
        const { page, asked, errors } = yield* openReview([voiced, picks, ...fakeFilm(toy)], {
          href: FILM,
        });
        const other = at('voice:a', 'a.other.flac');
        const ACCEPT = `${RECEIPT} [data-command="review.accept-anyway"]`;
        yield* waitFor(page, `${other} [data-act="pick"]`);
        // At rest nothing offers it.
        yield* countIs(page, '[data-command="review.accept-anyway"]', 0);
        yield* click(page, `${other} [data-act="pick"]`);
        yield* attributeIs(page, RECEIPT, 'data-type', 'refused');
        yield* receiptSays(page, 'says something else');
        yield* textIs(page, ACCEPT, 'Accept anyway');
        // Its row's context menu offers it too, while the refusal stands.
        yield* rightClick(page, `${other} .rv-name`);
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.accept-anyway"]');
        yield* page.press('Escape');
        yield* countIs(page, '[data-role="context-menu"]', 0);
        yield* click(page, ACCEPT);
        const accepted = () =>
          asked.filter((a) => a.path === '/api/films/toy/choices/pick').map((a) => a.body);
        yield* Effect.sync(() => accepted().length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n === 2 }),
          Effect.timeout('10 seconds'),
        );
        expect(accepted()).toEqual([
          Option.some({ point: 'voice:a', variant: 'a.other.flac', verb: 'pick' }),
          Option.some({
            point: 'voice:a',
            variant: 'a.other.flac',
            verb: 'pick',
            acceptMismatch: true,
          }),
        ]);
        yield* attributeIs(page, RECEIPT, 'data-type', 'done');
        // Kept, nothing is left to accept.
        yield* rightClick(page, `${other} .rv-name`);
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.inspect"]');
        yield* countIs(page, '[data-role="context-menu"] [data-command="review.accept-anyway"]', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'audition: ⌥→ and ⌥← hear the selected point’s variants in place, and Enter picks the one heard',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { href: FILM });
        yield* waitFor(page, '.rv-picture video');
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* page.focus(`${at('score', 'strings')} [data-act="hear"]`);
        // The missing choir is skipped; the focus follows what is heard.
        yield* page.press('Alt+ArrowRight');
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=piano')`,
        );
        yield* evaluates(
          page,
          "document.activeElement.closest('[data-variant]').dataset.variant",
          'piano',
        );
        yield* page.press('Alt+ArrowLeft');
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* page.press('Alt+ArrowRight');
        yield* waitFor(page, `${at('score', 'piano')} [data-act="hear"][aria-pressed="true"]`);
        yield* page.press('Enter');
        yield* receiptSays(page, 'Picked piano · score: strings → piano');
        expect(posted(asked, '/api/films/toy/choices/pick')).toEqual({
          point: 'score',
          variant: 'piano',
          verb: 'pick',
        });
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live("a level's value is a field: typed arithmetic commits on Enter", () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openReview(fakeFilm(), { href: FILM });
      const field = '[data-knob="level:const:PAPER"] .lab-num';
      yield* valueIs(page, field, '-24');
      yield* page.fill(field, '-24+4');
      yield* page.press('Enter');
      yield* receiptSays(page, 'level:const:PAPER: -24 → -20 dB');
      expect(posted(asked, '/api/films/toy/choices/knob')).toEqual({
        point: 'level:const:PAPER',
        value: -20,
      });
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
