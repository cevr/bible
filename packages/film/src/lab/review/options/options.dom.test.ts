// A film's choices in a browser, its routes faked over a synthetic film with
// a score of three options, one library sound's takes, a look and a level:
// home links the film; its page puts the render on the clock and one mix
// heard over it (🔊 swaps it: a score option's, a take's in place); Pick
// writes `play`, the page reads the film again (the pick shown, Undo
// offered, the check after it) and runs the sound check, showing its
// findings; a take is kept; a look picked; a level's knob set; a variant
// approved, commented on and its approval withdrawn; Undo, naming what it
// undoes, is sent to the film's own route, and the choices it reads again,
// landing after a say asked later, leave the say shown; a mark
// jumps the clock; a mix whose first load failed is heard once its retry
// lands; and a phone's width scrolls nothing sideways. Every wait is on the
// page (a selector, a condition) or its clock, never a fixed time.

import { Deferred, Effect, Exit, FileSystem, Option, Schedule, Schema } from 'effect';
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
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
} from '../../fixtures/harness.ts';
import { SourceRefused } from '../../../core/refusals.ts';
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
} from '../../fixtures/settled.ts';
import { tone } from '../../fixtures/tone.ts';

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

/** The fake film: its choices, its writes, its check and its sound check. */
const fakeFilm = () => {
  const toy: Toy = { picked: 'strings', look: 'now', level: -24, approved: false, said: [] };
  let undo = Option.none<string>();
  const wrote = (target: string, file: string): Json => ({
    file,
    target,
    choices: choices(toy),
    findings: [],
  });
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/review\/index/, () => json({ folders: [] })),
    route('GET', /^\/review\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/lab\/toy\/choices$/, () => json(choices(toy))),
    route('GET', /^\/lab\/toy\/choices\/check$/, () =>
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
    route('GET', /^\/lab\/toy\/check$/, () =>
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
    route('POST', /^\/lab\/toy\/choices\/pick$/, (asked) => {
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
    route('POST', /^\/lab\/toy\/choices\/knob$/, () => {
      toy.level = -20;
      return json(wrote('level:const:PAPER -20', 'sound.ts'));
    }),
    route('POST', /^\/lab\/toy\/choices\/say$/, (asked) => {
      const body = bodyText(asked.body);
      if (body.includes('"Approve"')) toy.approved = true;
      if (body.includes('"Withdraw"')) toy.approved = false;
      if (body.includes('"Comment"')) toy.said = [...toy.said, 'warmer in the close'];
      return json(choices(toy));
    }),
    route('GET', /^\/lab\/toy\/steps$/, () =>
      json(
        Option.match(undo, {
          onNone: () => ({}),
          onSome: (target) => ({ undo: { file: 'sound.ts', target } }),
        }),
      ),
    ),
    route('POST', /^\/lab\/toy\/undo$/, () => {
      toy.picked = 'strings';
      undo = Option.none();
      return json({ file: 'sound.ts', target: 'undo score play piano', findings: [] });
    }),
  ];
  return routes;
};

const FILM = '?film=toy';

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

const MIX = "document.querySelector('audio.rv-mix')?.getAttribute('src') ?? ''";

/** A variant's element by its point and id. */
const at = (point: string, id: string) => `[data-point="${point}"] [data-variant="${id}"]`;

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
        yield* click(page, 'a.rv-chip >> text=toy · choices');
        yield* until(page, "location.search === '?film=toy'");
        yield* waitFor(page, '.rv-transport');
        yield* waitFor(page, '.rv-picture video');
        // The picked option is heard first; the picture's own sound is muted.
        yield* until(page, `${MIX}.startsWith('/lab/toy/choices/mix?point=score&variant=strings')`);
        yield* evaluates(page, "document.querySelector('.rv-picture video').muted", true);
        // A missing option cannot be heard.
        yield* countIs(page, `${at('score', 'choir')} [data-act="hear"]`, 0);
        yield* click(page, `${at('score', 'piano')} [data-act="hear"]`);
        yield* until(page, `${MIX}.startsWith('/lab/toy/choices/mix?point=score&variant=piano')`);
        yield* waitFor(page, `${at('score', 'piano')} [data-act="hear"][aria-pressed="true"]`);
        // A take in place, and alone.
        yield* click(page, `${at('take:paper.page', WAITING)} [data-act="hear"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/lab/toy/choices/mix?point=take%3Apaper.page&variant=${WAITING}')`,
        );
        yield* attributeIs(
          page,
          `${at('take:paper.page', WAITING)} audio`,
          'src',
          `/lab/toy/choices/alone?point=take%3Apaper.page&variant=${WAITING}`,
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
    'a pick is written and read back, the sound check shown after it, a take kept, and Undo sent',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { search: FILM });
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === true');
        // No sound check before a pick.
        expect(asked.some((a) => a.path === '/lab/toy/choices/check')).toBe(false);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* waitFor(page, `${at('score', 'piano')} .rv-badge`);
        yield* until(
          page,
          "document.querySelector('.rv-status').textContent.includes('score play piano')",
        );
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === false');
        // Undo says what it would undo.
        yield* textIs(page, '[data-act="undo"]', 'Undo score play piano');
        expect(posted(asked, '/lab/toy/choices/pick')).toEqual({
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
        yield* until(
          page,
          "document.querySelector('.rv-status').textContent.includes('sound paper.page keep')",
        );
        // A kept take can only be unkept (and approved).
        yield* attributesAre(page, `${at('take:paper.page', KEPT)} button.rv-chip`, 'data-act', [
          'unpick',
          'approve',
          'comment',
        ]);

        yield* click(page, '[data-act="undo"]');
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === true');
        expect(asked.some((a) => a.method === 'POST' && a.path === '/lab/toy/undo')).toBe(true);
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
            routes.find((r) => r.method === 'GET' && r.path.test('/lab/toy/choices')),
          ),
        );
        // The read after the undo answers the choices as they stood when asked, once let land.
        const land = yield* Deferred.make<void>();
        let reads = 0;
        const lateRead = route('GET', /^\/lab\/toy\/choices$/, (asked) => {
          reads += 1;
          const then = plain.answer(asked);
          if (reads === 1) return then;
          return later(land, then);
        });
        const { page, asked, errors } = yield* openReview([lateRead, ...routes], {
          search: FILM,
        });
        yield* waitFor(page, `${at('score', 'strings')} .rv-badge`);
        yield* click(page, `${at('score', 'piano')} [data-act="pick"]`);
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === false');
        yield* click(page, '[data-act="undo"]');
        yield* Effect.sync(
          () => asked.filter((a) => a.method === 'GET' && a.path === '/lab/toy/choices').length,
        ).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        yield* attributeIs(page, '.rv-writes', 'data-reading', 'true');
        // Said while the read is out: the say answers the choices with the comment.
        yield* Effect.promise(() =>
          page.fill(`${at('score', 'strings')} .rv-comment-input`, 'warmer in the close'),
        );
        yield* click(page, `${at('score', 'strings')} [data-act="comment"]`);
        yield* waitFor(page, `${at('score', 'strings')} [data-comment="c1"]`);
        // The older read lands last: the page has read it, and the comment stays.
        yield* Deferred.done(land, Exit.void);
        yield* attributeIs(page, '.rv-writes', 'data-reading', 'false');
        yield* countIs(page, `${at('score', 'strings')} [data-comment="c1"]`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a look is picked, a level's knob set, and a variant approved and commented on",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { search: FILM });
        yield* waitFor(page, `${at('look:ground', 'now')} .rv-badge`);
        yield* click(page, `${at('look:ground', 'light')} [data-act="pick"]`);
        yield* waitFor(page, `${at('look:ground', 'light')} .rv-badge`);
        expect(posted(asked, '/lab/toy/choices/pick')).toEqual({
          point: 'look:ground',
          variant: 'light',
          verb: 'pick',
        });

        // The knob is written on release.
        yield* Effect.promise(() =>
          page.evaluate(`(() => {
            const input = document.querySelector('[data-knob="level:const:PAPER"] input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`),
        );
        yield* until(
          page,
          "document.querySelector('.rv-status').textContent.includes('level:const:PAPER -20')",
        );
        expect(posted(asked, '/lab/toy/choices/knob')).toEqual({
          point: 'level:const:PAPER',
          value: -20,
        });

        yield* click(page, `${at('score', 'strings')} [data-act="approve"]`);
        yield* waitFor(
          page,
          `${at('score', 'strings')} [data-act="approve"][data-approval="approved"]`,
        );
        expect(posted(asked, '/lab/toy/choices/say')).toEqual({
          point: 'score',
          variant: 'strings',
          say: { _tag: 'Approve' },
        });
        yield* Effect.promise(() =>
          page.fill(`${at('score', 'strings')} .rv-comment-input`, 'warmer in the close'),
        );
        yield* click(page, `${at('score', 'strings')} [data-act="comment"]`);
        yield* waitFor(page, `${at('score', 'strings')} [data-comment="c1"]`);
        expect(
          asked
            .filter((a) => a.path === '/lab/toy/choices/say')
            .map((a) => Option.getOrUndefined(a.body)),
        ).toEqual([
          { point: 'score', variant: 'strings', say: { _tag: 'Approve' } },
          {
            point: 'score',
            variant: 'strings',
            say: { _tag: 'Comment', text: 'warmer in the close' },
          },
        ]);
        // An approval is withdrawn from the same card.
        yield* click(page, `${at('score', 'strings')} [data-act="withdraw"]`);
        yield* waitFor(
          page,
          `${at('score', 'strings')} [data-act="approve"][data-approval="none"]`,
        );
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
            route('POST', /^\/lab\/toy\/choices\/knob$/, () =>
              refused(
                SourceRefused.make({ file: 'sound.ts', target: 'PAPER', reason: 'computed' }),
              ),
            ),
            ...fakeFilm(),
          ],
          { search: FILM },
        );
        const knob = '[data-knob="level:const:PAPER"]';
        yield* waitFor(page, `${knob} input`);
        yield* Effect.promise(() =>
          page.evaluate(`(() => {
            const input = document.querySelector('${knob} input');
            input.value = '-20';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          })()`),
        );
        yield* attributeIs(page, '.rv-status', 'data-failed', 'true');
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
          route('GET', /^\/review\/files\/out\/toy\/toy\.mp4/, () => file(wav)),
          // The first ask is cut off while the mix renders; the retry finds it made.
          route('GET', /^\/lab\/toy\/choices\/mix\?point=score&variant=strings/, () => {
            asks += 1;
            if (asks === 1) return text('the connection dropped', 502);
            return file(wav);
          }),
          ...fakeFilm(),
        ];
        const { page, errors } = yield* openReview(routes, { search: FILM });
        yield* waitFor(page, '.rv-picture video');
        yield* until(page, `${MIX}.startsWith('/lab/toy/choices/mix?point=score&variant=strings')`);
        yield* until(page, "document.querySelector('audio.rv-mix').error !== null");
        yield* Effect.promise(() => page.keyboard.press('Space'));
        yield* until(page, "document.querySelector('.rv-picture video').paused === false");
        // The retry's wait is run through on the page's clock.
        yield* Effect.promise(() => page.clock.runFor(5_000));
        yield* until(page, "document.querySelector('audio.rv-mix').readyState >= 1");
        expect(asks).toBe(2);
        // The reload stalls the set (Buffering) until the mix can play, and the set resumes it.
        yield* until(page, "document.querySelector('audio.rv-mix').paused === false");
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SLOW,
  );

  it.live(
    "scrolls nothing sideways at a phone's width",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm(), {
          search: FILM,
          viewport: { width: 390, height: 844 },
        });
        yield* waitFor(page, '[data-point="take:paper.page"]');
        yield* evaluates(page, 'document.documentElement.scrollWidth <= innerWidth', true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
