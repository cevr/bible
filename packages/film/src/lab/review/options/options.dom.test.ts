// A film's options in a browser, its routes faked over a synthetic film of
// three score options and one library sound: home links the film; its page
// puts the render on the clock and one mix heard over it (🔊 swaps it: a
// score option's, a take's in place); Pick writes `play` and the page reads
// the film again (the pick shown, Undo offered, the check after it); a take
// is kept; Undo is sent to the film's own route; a placement jumps the clock;
// a mix whose first load failed is heard once its retry lands; and a phone's
// width scrolls nothing sideways.

import { Effect, FileSystem, Option } from 'effect';
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import {
  type FakeRoute,
  type Json,
  file,
  json,
  openReview,
  route,
  text,
} from '../../fixtures/harness.ts';
import { tone } from '../../fixtures/tone.ts';

const SLOW = 30_000;

const variant = (id: string, state: string): Json => ({
  id,
  styles: [`${id} style`],
  acts: [],
  state,
});

const take = (id: string, state: string, index: number): Json => ({
  id,
  state,
  index,
  secs: 1.5,
  loudest: -18,
  made: '2026-09-01',
  current: true,
});

const KEPT = 'a'.repeat(64);
const WAITING = 'b'.repeat(64);

const choices = (picked: string): Json => ({
  film: 'toy',
  pictures: [{ ref: 'out/toy/toy.mp4', name: 'toy.mp4', size: 2048, mtime: 0, phone: 'none' }],
  choices: [
    {
      _tag: 'ScoreChoice',
      picked,
      variants: [
        variant('strings', 'current'),
        variant('piano', 'stale'),
        variant('choir', 'missing'),
      ],
    },
    {
      _tag: 'EffectChoice',
      sound: 'paper.page',
      placements: [{ effect: 'hush', scene: 'open', at: 2 }],
      takes: [take(KEPT, 'kept', 1), take(WAITING, 'candidate', 1)],
    },
  ],
});

/** The fake film: what it plays, and whether a write stands to be undone. */
const fakeFilm = () => {
  let picked = 'strings';
  let undo = Option.none<string>();
  const wrote = (target: string, file: string): Json => ({
    file,
    target,
    choices: choices(picked),
    findings: [],
  });
  const routes: ReadonlyArray<FakeRoute> = [
    route('GET', /^\/review\/index/, () => json({ folders: [] })),
    route('GET', /^\/review\/films$/, () => json({ films: ['toy'] })),
    route('GET', /^\/lab\/toy\/options$/, () => json(choices(picked))),
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
    route('POST', /^\/lab\/toy\/options\/score\/pick$/, () => {
      picked = 'piano';
      undo = Option.some('score play piano');
      return json(wrote('score play piano', 'sound.ts'));
    }),
    route('POST', /^\/lab\/toy\/options\/effect\/paper\.page\/takes$/, () =>
      json(wrote('sound paper.page keep bbbbbbbbbbbb', '../../sounds/library.lock.json')),
    ),
    route('POST', /^\/lab\/toy\/undo$/, () => {
      picked = 'strings';
      undo = Option.none();
      return json({ file: 'sound.ts', target: 'undo score play piano', findings: [] });
    }),
  ];
  return routes;
};

const FILM = '?film=toy';

const waitFor = (page: Page, selector: string) =>
  Effect.promise(() => page.waitForSelector(selector));

const until = (page: Page, check: string) => Effect.promise(() => page.waitForFunction(check));

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

const evaluate = <A>(page: Page, script: string) =>
  Effect.promise(() => page.evaluate(script) as Promise<A>);

const MIX = "document.querySelector('audio.rv-mix')?.getAttribute('src') ?? ''";

describe("a film's options", () => {
  it.live(
    'home links the film; its page hears the picked option over the render, and 🔊 swaps it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(fakeFilm());
        yield* click(page, 'a.rv-chip >> text=toy · options');
        yield* until(page, "location.search === '?film=toy'");
        yield* waitFor(page, '.rv-transport');
        yield* waitFor(page, '.rv-picture video');
        // The picked option is heard first; the picture's own sound is muted.
        yield* until(page, `${MIX}.startsWith('/lab/toy/options/score/strings/mix')`);
        expect(
          yield* evaluate<boolean>(page, "document.querySelector('.rv-picture video').muted"),
        ).toBe(true);
        // A missing option cannot be heard.
        expect(
          yield* evaluate<boolean>(
            page,
            'document.querySelector(\'[data-option="choir"] [data-act="hear"]\').disabled',
          ),
        ).toBe(true);
        yield* click(page, '[data-option="piano"] [data-act="hear"]');
        yield* until(page, `${MIX}.startsWith('/lab/toy/options/score/piano/mix')`);
        yield* waitFor(page, '[data-option="piano"] [data-act="hear"][aria-pressed="true"]');
        // A take in place.
        yield* click(page, `[data-take="${WAITING}"] [data-act="hear"]`);
        yield* until(
          page,
          `${MIX}.startsWith('/lab/toy/options/effect/paper.page/takes/${WAITING}/mix')`,
        );
        // The picture's own sound: no mix, the picture heard.
        yield* click(page, '.rv-picture [data-act="hear"]');
        yield* until(page, "document.querySelector('audio.rv-mix') === null");
        yield* until(page, "document.querySelector('.rv-picture video').muted === false");
        // A placement jumps the clock to it.
        yield* click(page, '[data-sound="paper.page"] button[data-at="2"]');
        yield* until(page, "document.querySelector('.rv-time').textContent.startsWith('0:02.0')");
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a pick is written and read back, a take kept, and Undo sent to the film',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openReview(fakeFilm(), { search: FILM });
        yield* waitFor(page, '[data-option="strings"] .rv-badge');
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === true');
        yield* click(page, '[data-option="piano"] [data-act="pick"]');
        yield* waitFor(page, '[data-option="piano"] .rv-badge');
        yield* until(
          page,
          "document.querySelector('.rv-status').textContent.includes('score play piano')",
        );
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === false');
        yield* until(
          page,
          'document.querySelector(\'.rv-findings li[data-level="warning"]\') !== null',
        );
        const pick = asked.find((a) => a.path === '/lab/toy/options/score/pick');
        expect(
          Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(pick), (a) => a.body)),
        ).toEqual({
          option: 'piano',
        });
        // Every mix is asked for again once the source has changed.
        yield* until(page, `${MIX}.endsWith('?v=1')`);

        yield* click(page, `[data-take="${WAITING}"] [data-act="keep"]`);
        yield* until(
          page,
          "document.querySelector('.rv-status').textContent.includes('sound paper.page keep')",
        );
        const keep = asked.find((a) => a.path === '/lab/toy/options/effect/paper.page/takes');
        expect(
          Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(keep), (a) => a.body)),
        ).toEqual({
          take: WAITING,
          act: 'keep',
        });
        // A kept take can only be unkept.
        expect(
          yield* evaluate<string>(
            page,
            `Array.from(document.querySelectorAll('[data-take="${KEPT}"] .rv-chip')).map((b) => b.dataset.act).join()`,
          ),
        ).toBe('unkeep');

        yield* click(page, '[data-act="undo"]');
        yield* waitFor(page, '[data-option="strings"] .rv-badge');
        yield* until(page, 'document.querySelector(\'[data-act="undo"]\').disabled === true');
        expect(asked.some((a) => a.method === 'POST' && a.path === '/lab/toy/undo')).toBe(true);
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
          route('GET', /^\/lab\/toy\/options\/score\/strings\/mix/, () => {
            asks += 1;
            if (asks === 1) return text('the connection dropped', 502);
            return file(wav);
          }),
          ...fakeFilm(),
        ];
        const { page, errors } = yield* openReview(routes, { search: FILM });
        // The page's timers from here on are the test's: the retry's wait is run through.
        yield* Effect.promise(() => page.clock.install());
        yield* waitFor(page, '.rv-picture video');
        yield* until(page, `${MIX}.startsWith('/lab/toy/options/score/strings/mix')`);
        yield* until(page, "document.querySelector('audio.rv-mix').error !== null");
        yield* Effect.promise(() => page.keyboard.press('Space'));
        yield* until(page, "document.querySelector('.rv-picture video').paused === false");
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
        yield* waitFor(page, '[data-sound="paper.page"]');
        expect(
          yield* evaluate<boolean>(page, 'document.documentElement.scrollWidth <= innerWidth'),
        ).toBe(true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
