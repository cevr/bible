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
// jumps the clock; Show only… keeps the points in one state (`?only=`); a
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
  file,
  json,
  later,
  openReview,
  refused,
  route,
  text,
} from '../../../../src/lab/fixtures/harness.ts';
import { SourceRefused } from '../../../../src/core/refusals.ts';
import {
  MENU_ITEMS,
  closeCommandMenu,
  menuEntry,
  menuOffers,
  openCommandMenu,
  rightClick,
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

const choices = (toy: Toy): Json => ({
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

/** The fake film: its choices, its writes, its check and its sound check, over `toy`. */
const fakeFilm = (toy: Toy = freshToy()) => {
  let undo = Option.none<string>();
  const wrote = (target: string, file: string): Json => ({
    file,
    target,
    choices: choices(toy),
    findings: [],
  });
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
          },
        ],
      }),
    ),
    route('GET', /^\/api\/films\/toy\/check$/, () =>
      json({
        findings: Option.match(undo, {
          onNone: () => [],
          onSome: () => [{ level: 'warning', tag: 'score', message: 'piano is stale' }],
        }),
        ...Option.match(undo, {
          onNone: () => ({}),
          onSome: (target) => ({ undo: { file: 'sound.ts', target } }),
        }),
      }),
    ),
    route('POST', /^\/api\/films\/toy\/choices\/pick$/, (asked) => {
      const body = bodyText(asked.body);
      if (body.includes('look:ground')) {
        toy.look = 'light';
        return json(wrote('look ground play light', 'palette.ts'));
      }
      if (body.includes('take:paper.page'))
        return json(wrote('sound paper.page keep bbbbbbbbbbbb', '../../sounds/library.lock.json'));
      toy.picked = 'piano';
      undo = Option.some('score play piano');
      return json(wrote('score play piano', 'sound.ts'));
    }),
    route('POST', /^\/api\/films\/toy\/choices\/knob$/, () => {
      toy.level = -20;
      return json(wrote('level:const:PAPER -20', 'sound.ts'));
    }),
    route('POST', /^\/api\/films\/toy\/choices\/say$/, (asked) => {
      const body = bodyText(asked.body);
      if (body.includes('"Approve"')) toy.approved = true;
      if (body.includes('"Withdraw"')) toy.approved = false;
      if (body.includes('"Comment"')) toy.said = [...toy.said, 'warmer in the close'];
      return json(choices(toy));
    }),
    route('GET', /^\/api\/films\/toy\/steps$/, () =>
      json(
        Option.match(undo, {
          onNone: () => ({}),
          onSome: (target) => ({ undo: { file: 'sound.ts', target } }),
        }),
      ),
    ),
    route('POST', /^\/api\/films\/toy\/undo$/, () => {
      toy.picked = 'strings';
      undo = Option.none();
      return json({ file: 'sound.ts', target: 'undo score play piano', findings: [] });
    }),
  ];
  return routes;
};

const FILM = pageHref.choices('toy');

const click = (page: Tab, selector: string) => page.click(selector);

const MIX = "document.querySelector('audio.rv-mix')?.getAttribute('src') ?? ''";

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

describe("a film's choices", () => {
  it.live(
    'home links the film; its page hears the picked option over the render, and 🔊 swaps it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm());
        yield* click(page, `a.rv-chip[href="${FILM}"]`);
        yield* until(page, `location.pathname === '${FILM}'`);
        yield* waitFor(page, '.rv-transport');
        yield* waitFor(page, '.rv-picture video');
        // The picked option is heard first; the picture's own sound is muted.
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=strings')`,
        );
        yield* evaluates(page, "document.querySelector('.rv-picture video').muted", true);
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
        yield* attributeIs(
          page,
          `${at('take:paper.page', WAITING)} audio`,
          'src',
          `/api/films/toy/choices/alone?point=take%3Apaper.page&variant=${WAITING}`,
        );
        // The picture's own sound: no mix, the picture heard.
        yield* click(page, '.rv-picture [data-act="hear"]');
        yield* until(page, "document.querySelector('audio.rv-mix') === null");
        yield* until(page, "document.querySelector('.rv-picture video').muted === false");
        // A mark jumps the clock to it.
        yield* click(page, '[data-point="take:paper.page"] button[data-at="2"]');
        yield* until(page, "document.querySelector('.rv-time').textContent.startsWith('0:02.0')");
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
        yield* until(page, `${time}.startsWith('0:02.0')`);
        // A new hash is an entry of its own (the browser's), landed on as Back lands.
        yield* page.evaluate("location.hash = '#t=5'; true");
        yield* until(page, `${time}.startsWith('0:05.0')`);
        yield* page.back;
        yield* until(page, "location.hash === '#t=2'");
        yield* until(page, `${time}.startsWith('0:02.0')`);
        // Past the time's throttle, the entry still keeps its own time.
        yield* page.evaluate('new Promise((done) => setTimeout(() => done(true), 600))');
        yield* until(page, "location.hash === '#t=2'");
        yield* until(page, `${time}.startsWith('0:02.0')`);
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
        yield* click(page, '[data-point="take:paper.page"] button[data-at="2"]');
        yield* until(page, "location.hash === '#t=2'");
        const link = `${FILM}?heard=score&variant=piano#t=2`;
        yield* evaluates(page, 'location.pathname + location.search + location.hash', link);
        yield* page.goto(pageHref.home());
        yield* page.goto(`${FILM}?heard=own#t=2`);
        yield* waitFor(page, '.rv-picture [data-act="hear"][aria-pressed="true"]');
        yield* until(page, "document.querySelector('audio.rv-mix') === null");
        yield* until(page, "document.querySelector('.rv-time').textContent.startsWith('0:02.0')");
        yield* page.goto(link);
        yield* waitFor(page, `${at('score', 'piano')} [data-act="hear"][aria-pressed="true"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/api/films/toy/choices/mix?point=score&variant=piano')`,
        );
        yield* until(page, "document.querySelector('.rv-time').textContent.startsWith('0:02.0')");
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
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
        // Nothing to undo yet: the menu offers no Undo.
        yield* menuOffers(page, 'undo', 'review.undo', false);
        // No sound check before a pick.
        expect(asked.some((a) => a.path === '/api/films/toy/choices/check')).toBe(false);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-badge`);
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
        // The sound check runs after the pick, and its findings are shown.
        yield* waitFor(page, '[data-check="sound check"] summary[data-findings="1"]');
        yield* textHas(
          page,
          '[data-check="sound check"] li',
          'the score sits under the voice at piano',
        );
        // Every mix is asked for again once the source has changed.
        yield* until(page, `${MIX}.endsWith('&v=1')`);

        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="pick"]`);
        yield* receiptSays(page, `Picked ${WAITING.slice(0, 12)}`);
        // A kept take can only be unkept (and approved): at rest its approve, the rest in its inspector.
        yield* attributesAre(page, `${at('take:paper.page', KEPT)} button.rv-chip`, 'data-act', [
          'approve',
        ]);
        yield* inspect(page, at('take:paper.page', KEPT));
        yield* attributesAre(page, `${INSPECTOR} button.rv-chip`, 'data-act', [
          'approve',
          'unpick',
          'comment',
        ]);
        yield* page.press('Escape');
        yield* countIs(page, INSPECTOR, 0);

        // The receipt's Undo undoes the write it said; its own receipt offers Redo.
        yield* click(page, `${RECEIPT} [data-act="receipt-undo"]`);
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
        yield* receiptSays(page, 'Undid ');
        yield* textIs(page, `${RECEIPT} [data-act="receipt-undo"]`, 'Redo');
        yield* menuOffers(page, 'undo', 'review.undo', false);
        expect(asked.some((a) => a.method === 'POST' && a.path === '/api/films/toy/undo')).toBe(
          true,
        );
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
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
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
        yield* waitFor(page, `${at('score', 'piano')} .rv-badge`);
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
        yield* waitFor(page, `${at('score', 'piano')} .rv-badge`);
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
        const findings = '[data-check="check"] summary';
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
        yield* waitFor(page, `${at('look:ground', 'now')} .rv-badge`);
        yield* click(page, `${at('look:ground', 'light')} [data-act="pick"]`);
        yield* waitFor(page, `${at('look:ground', 'light')} .rv-badge`);
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
        yield* textIs(page, `${knob} output`, '-24 dB');
        yield* valueIs(page, `${knob} input`, '-24');
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
        yield* attributesAre(page, `${waiting} button.rv-chip`, 'data-act', ['pick']);
        yield* rightClick(page, `${waiting} .rv-name`);
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.reject"]');
        yield* evaluates(page, `${MENU_ITEMS}.filter((id) => id.startsWith('review.'))`, [
          'review.inspect',
          'review.comment',
          'review.approve',
          'review.reject',
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
});
