// The Transcript view in a browser over a talk (`labTalkFilm`, its words as
// the server reads them answered at `GET …/talk`), on a laptop (a column
// beside the picture) and on a phone (a sheet of its own): `?text=follow`
// opens it; its words show in play order, struck ones hidden until Show
// cuts; the word playing at `#t=` is lit and follows play, until a hand
// scrolls the view; `?words=a-b` selects; a tap seeks to a word's start;
// Cut, Restore and Mark here each send their write and show the server's
// receipt, whose Undo (held, as the editor's are, until the page reads the
// history with the change) asks the server to undo the change it made, a
// rebuild the write causes waiting for its answer; a word of another
// section is selected whatever cue or knob is; a phone selects a range by
// a held word's Select to here; and on a phone it fits the window, its
// targets a finger's size.

import { Boolean as Bool, Deferred, Effect, Exit, Option, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type TalkWords, pageHref } from '../../../src/core/api.ts';
import { createTalk } from '../../../src/canvas/talk.ts';
import { SourceRefused } from '../../../src/core/refusals.ts';
import { talkCut } from '../../../src/core/talk.ts';
import { MENU_ITEMS, touch as fingerDown } from '../../../src/lab/fixtures/gestures.ts';
import {
  DESK,
  PHONE,
  type Viewport,
  hold,
  json,
  later,
  openLab,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { fitsPhone, noSidewaysBox } from '../../../src/lab/fixtures/phone-fit.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
} from '../../../src/lab/fixtures/settled.ts';
import { TALK, TALK_EDIT, TALK_TAKE } from '../../../src/lab/fixtures/talk-film.ts';
import { DESK_HIT, PHONE_HIT, undersizedTargets } from '../../../src/lab/fixtures/touch-targets.ts';
import { TALK_FILE, talkWords } from '../../../src/tools/talk-source.ts';

/** The talk's API, as the lab's server serves it: under the film's path. */
const TALK_API = `/api/films/${TALK}`;
const at = (path: string) => new RegExp(`^${TALK_API}${path}$`);

/** The talk's words as the server reads them from its edit and take: cut as the page cuts it. */
const takes = { a: TALK_TAKE };
const cut = Result.getOrThrow(talkCut(TALK_EDIT, takes));
const WORDS: TalkWords = talkWords(TALK_FILE, { talk: TALK_EDIT, takes, cut });

/** The talk as the lab lays it out (`labTalkFilm`): where each section's voice starts, in scene seconds. */
const placed = createTalk(TALK_EDIT, takes, cut).placed;
const speechOf = (id: string) => placed.find((p) => p.spec.id === id)?.speechStart ?? Number.NaN;

/** Word `index` of section `id`, as the server reads it. */
const wordOf = (id: string, index: number) =>
  WORDS.sections.find((s) => s.id === id)?.words.find((w) => w.index === index);
/** Where word `index` of section `id` starts, in its scene's seconds. */
const startOf = (id: string, index: number) =>
  speechOf(id) + (wordOf(id, index)?.heard?.[0] ?? Number.NaN);

/** The words the cut plays, in play order. */
const PLAYED = WORDS.sections.flatMap((s) => s.words.filter((w) => !w.struck).map((w) => w.text));

/**
 * Whether the focused element shows the kit's ring drawn inside it
 * (`--focus-ring-inset`, as a box whose column clips what stands outside it
 * draws it) and no outline: its computed shadow against the token's, read off
 * a probe beside it.
 */
const INSET_RING_SHOWN = `((el) => { const probe = document.createElement('i'); probe.style.boxShadow = 'var(--focus-ring-inset)'; el.parentElement.append(probe); const ring = getComputedStyle(probe).boxShadow; probe.remove(); const s = getComputedStyle(el); return s.outlineStyle === 'none' && ring !== 'none' && s.boxShadow === ring; })(document.activeElement)`;

/** A write the server took, as it answers one. */
const wrote = (scene: string, target: string) => ({
  scene,
  file: TALK_FILE,
  target,
  change: `${scene}:${target}`,
  findings: [],
});

/** The talk's lab, as the fake server answers it: `talk` its words. */
const talkRoutes = (talk: TalkWords = WORDS, undo = Option.none<ReturnType<typeof wrote>>()) => [
  route('GET', at('/notes'), () => json({ film: TALK, seq: 0, notes: [] })),
  route('GET', at('/notes/wait'), () => hold),
  route('GET', at('/check'), () =>
    json(
      Option.match(undo, {
        onNone: () => ({ findings: [] }),
        onSome: (step) => ({ findings: [], undo: step }),
      }),
    ),
  ),
  route('GET', at('/studio/beats'), () => json({ film: TALK, beats: [] })),
  route('GET', at('/scenes/(ask|answer)/source'), (asked) =>
    json({
      scene: asked.path.split('/')[5] ?? '',
      file: TALK_FILE,
      cues: [],
      knobs: [],
      refused: [],
    }),
  ),
  route('GET', at('/scenes/(ask|answer)/head'), (asked) =>
    json({
      scene: asked.path.split('/')[5] ?? '',
      file: TALK_FILE,
      timeline: {},
      knobs: {},
      codeChanged: false,
      sameData: true,
    }),
  ),
  route('GET', at('/talk'), () => json(talk)),
  route('POST', at('/talk/cut'), () => json(wrote('ask', 'cut words 3–4 of ask'))),
  route('POST', at('/talk/restore'), () => json(wrote('ask', 'restore word 2 of ask'))),
  route('POST', at('/talk/mark'), () => json(wrote('ask', 'mark the on word 3 of ask'))),
  route('POST', at('/undo'), () => json({ ...wrote('ask', 'undo cut words 3–4 of ask') })),
];

/** The talk's lab on section `scene` at its seconds `t`, with `picked`. */
const talkAt = (
  scene: string,
  t: number,
  picked: { readonly text?: string; readonly words?: string; readonly knob?: string },
): string => pageHref.labScene(TALK, scene, picked, Option.some(t));

/** Each window the view is checked in: its size, and where the view stands in it. */
const PLACES: ReadonlyArray<readonly [string, Viewport, string]> = [
  ['on a laptop', DESK, '.lab-transcript-col'],
  ['on a phone', PHONE, '.lab-transcript-sheet'],
];

/** The words the view shows, in its order. */
const shown = (where: string) =>
  `[...document.querySelectorAll('${where} .lab-transcript-w')].filter((e) => e.checkVisibility()).map((e) => e.textContent)`;
/** The text a highlight paints, read back from its ranges. */
const painted = (name: string) =>
  `[...(CSS.highlights.get('${name}') ?? [])].map((r) => r.toString())`;
/** The view's scroll box. */
const boxIn = (where: string) => `document.querySelector('${where} .lab-transcript-scroll')`;
/** Two animation frames: a scroll's event is in. */
const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`;
/** The POSTs the page made, by path and body. */
const posted = (asked: ReadonlyArray<{ method: string; path: string; body: unknown }>) =>
  asked.filter((a) => a.method === 'POST').map((a) => ({ path: a.path, body: a.body }));
/** The receipt of a write of the film's source: the editor's slot, the transcript's writes and Undo's alike. */
const said = '[data-receipt="edit"] .lab-receipt-said';

describe('the Transcript view at rest', () => {
  it.live('is closed and reads no words', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab(talkRoutes(), { href: talkAt('ask', 0, {}) });
      yield* countIs(page, '.lab-transcript', 0);
      expect(asked.filter((a) => a.path === `${TALK_API}/talk`)).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('⇧T hides the open view, and Close shuts it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(talkRoutes(), { href: talkAt('ask', 0, { text: 'follow' }) });
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      yield* page.press('Shift+T');
      yield* countIs(page, '.lab-transcript', 0);
      yield* evaluates(page, `new URLSearchParams(location.search).has('text')`, false);
      yield* page.goto(talkAt('ask', 0, { text: 'follow' }));
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      yield* page.click('.lab-transcript-col [data-act="close-transcript"]');
      yield* countIs(page, '.lab-transcript', 0);
    }).pipe(Effect.scoped),
  );

  it.live('a write the server refuses says why in its words, and stands no Undo', () =>
    Effect.gen(function* () {
      const reason = 'talk: section "ask" strikes every word it has, so it plays nothing';
      const { page } = yield* openLab(
        [
          route('POST', at('/talk/cut'), () =>
            refused(
              SourceRefused.make({ file: TALK_FILE, target: 'cut words 0–5 of ask', reason }),
            ),
          ),
          ...talkRoutes(),
        ],
        { href: talkAt('ask', 0, { text: 'follow', words: '0-5' }) },
      );
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      yield* page.click('.lab-transcript-col [data-act="cut-words"]');
      yield* textHas(page, said, reason);
      yield* countIs(page, '[data-receipt="edit"] [data-act="receipt-undo"]', 0);
    }).pipe(Effect.scoped),
  );

  it.live('?text=<word> holds the view on that word, and Follow takes it back to the frame', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(talkRoutes(), {
        href: talkAt('answer', 0, { text: '8', words: '8-8' }),
      });
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      yield* evaluates(page, painted('lab-read'), ['us']);
      yield* attributeIs(
        page,
        '.lab-transcript-col [data-act="follow-transcript"]',
        'aria-pressed',
        'false',
      );
      yield* page.click('.lab-transcript-col [data-act="follow-transcript"]');
      yield* attributeIs(
        page,
        '.lab-transcript-col [data-act="follow-transcript"]',
        'aria-pressed',
        'true',
      );
      yield* evaluates(page, `new URLSearchParams(location.search).get('text')`, 'follow');
      yield* evaluates(page, painted('lab-read'), []);
    }).pipe(Effect.scoped),
  );
});

for (const [name, viewport, where] of PLACES)
  describe(`the Transcript view ${name}`, () => {
    it.live(
      '?text=follow opens it: its words in play order, a struck one hidden until Show cuts',
      () =>
        Effect.gen(function* () {
          const { page } = yield* openLab(talkRoutes(), {
            href: talkAt('ask', 0, { text: 'follow' }),
            viewport,
          });
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* evaluates(page, shown(where), PLAYED);
          yield* page.click(`${where} [data-act="show-cuts"]`);
          yield* attributeIs(page, `${where} [data-act="show-cuts"]`, 'aria-pressed', 'true');
          yield* evaluates(
            page,
            `${shown(where)}.join(' ')`,
            WORDS.sections.flatMap((s) => s.words.map((w) => w.text)).join(' '),
          );
          yield* attributeIs(
            page,
            `${where} [data-scene="ask"] [data-index="2"]`,
            'data-struck',
            'true',
          );
        }).pipe(Effect.scoped),
    );

    it.live('the #t= word is lit, and the lit word follows play', () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(talkRoutes(), {
          href: talkAt('ask', startOf('ask', 3) + 0.01, { text: 'follow' }),
          viewport,
        });
        yield* page.waitFor(`${where} .lab-transcript-page`);
        yield* evaluates(page, painted('lab-live'), ['the']);
        yield* page.evaluate(`document.querySelector('.bar [data-act="play"]').click()`);
        yield* page.clock.runFor(600);
        yield* page.until(
          `(() => { const lit = ${painted('lab-live')}; return lit.length === 1 && lit[0] !== 'the'; })()`,
        );
      }).pipe(Effect.scoped),
    );

    it.live('?words=a-b selects those words', () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(talkRoutes(), {
          href: talkAt('ask', 0, { text: 'follow', words: '3-4' }),
          viewport,
        });
        yield* page.waitFor(`${where} .lab-transcript-page`);
        // Painted as one span, the space between the words with them.
        yield* evaluates(page, painted('lab-picked'), ['the law']);
        yield* textHas(page, `${where} .lab-transcript-picked`, 'words 3–4 of ask');
      }).pipe(Effect.scoped),
    );

    it.live('a tap on a word seeks to its start and selects it', () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(talkRoutes(), {
          href: talkAt('ask', 0, { text: 'follow' }),
          viewport,
        });
        yield* page.waitFor(`${where} .lab-transcript-page`);
        yield* page.click(`${where} [data-scene="answer"] [data-index="7"]`);
        yield* page.until(`new URLSearchParams(location.search).get('words') === '7-7'`);
        yield* evaluates(page, `location.pathname.endsWith('/lab/answer')`, true);
        yield* evaluates(
          page,
          `Math.abs(Number(new URLSearchParams(location.hash.slice(1)).get('t')) - ${startOf('answer', 7)}) < 0.04`,
          true,
        );
        yield* evaluates(page, painted('lab-picked'), ['show']);
      }).pipe(Effect.scoped),
    );

    it.live(
      'Cut sends its write and shows the receipt, whose Undo, held (never retired) until the page reads the history with the Cut, then asks the server to undo the change it made',
      () =>
        Effect.gen(function* () {
          // The history as the page read it at load knows nothing of the Cut; read again, it has it.
          const cutStep = wrote('ask', 'cut words 3–4 of ask');
          let cutLanded = false;
          const { page, asked } = yield* openLab(
            [
              route('GET', at('/check'), () =>
                json(
                  Bool.match(cutLanded, {
                    onFalse: () => ({ findings: [] }),
                    onTrue: () => ({ findings: [], undo: cutStep }),
                  }),
                ),
              ),
              route('POST', at('/talk/cut'), () => {
                cutLanded = true;
                return json(cutStep);
              }),
              ...talkRoutes(),
            ],
            { href: talkAt('ask', 0, { text: 'follow', words: '3-4' }), viewport },
          );
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* page.click(`${where} [data-act="cut-words"]`);
          yield* textHas(page, said, `cut words 3–4 of ask in ${TALK_FILE}`);
          expect(posted(asked)).toEqual([
            { path: `${TALK_API}/talk/cut`, body: Option.some({ section: 'ask', from: 3, to: 4 }) },
          ]);
          // The page's own change, judged as the editor's writes are: held, its Undo kept, not
          // retired as a change the lab no longer has.
          yield* page.click('[data-receipt="edit"] [data-act="receipt-undo"]');
          yield* textHas(page, said, 'Undo is not available now');
          yield* textIs(page, '[data-receipt="edit"] [data-act="receipt-undo"]', 'Undo');
          // The rebuild the write causes reloads the page, which reads the history again.
          yield* page.reload;
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* page.waitFor('[data-act="undo"]:not([disabled])');
          yield* page.click('[data-receipt="edit"] [data-act="receipt-undo"]');
          yield* textHas(page, said, `undid cut words 3–4 of ask in ${TALK_FILE}`);
          expect(posted(asked).map((a) => a.path)).toEqual([
            `${TALK_API}/talk/cut`,
            `${TALK_API}/undo`,
          ]);
          expect(posted(asked)[1]?.body).toEqual(
            Option.some({ request: expect.any(String), change: 'ask:cut words 3–4 of ask' }),
          );
        }).pipe(Effect.scoped),
    );

    it.live(
      "a rebuild while Cut's write is out waits for its answer, so the receipt and its Undo outlive the reload",
      () =>
        Effect.gen(function* () {
          // The lab rebuilds the page as soon as `talk.ts` is written, and answers the write only
          // later, once its check and its mix are done.
          const [posted, answer] = [Deferred.makeUnsafe<void>(), Deferred.makeUnsafe<void>()];
          let waits = 0;
          const { page } = yield* openLab(
            [
              route('GET', /^\/api\/review\/build\?/, () => {
                waits += 1;
                if (waits > 1) return hold;
                return later(posted, json({ build: 1, server: 'lab' }));
              }),
              route('POST', at('/talk/cut'), () => {
                Deferred.doneUnsafe(posted, Effect.void);
                return later(answer, json(wrote('ask', 'cut words 3–4 of ask')));
              }),
              ...talkRoutes(),
            ],
            {
              href: talkAt('ask', 0, { text: 'follow', words: '3-4' }),
              viewport,
              build: { build: 0, server: 'lab' },
            },
          );
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* page.evaluate('window.loadedOnce = true');
          const rebuilt = yield* page.nextAnswer((a) => a.url.includes('/api/review/build'));
          yield* page.click(`${where} [data-act="cut-words"]`);
          yield* rebuilt;
          yield* page.clock.runFor(300);
          // The page holds its reload while the write is out: the write's answer reaches it.
          yield* evaluates(page, 'window.loadedOnce === true', true);
          yield* textHas(page, said, 'cutting…');
          yield* Deferred.done(answer, Exit.void);
          yield* evaluates(page, 'window.loadedOnce === true', false);
          yield* textHas(page, said, `cut words 3–4 of ask in ${TALK_FILE}`);
          yield* textIs(page, '[data-receipt="edit"] [data-act="receipt-undo"]', 'Undo');
        }).pipe(Effect.scoped),
    );

    it.live(
      "its scrolling words are a tab stop, so the keyboard scrolls them, focused with the kit's ring drawn inside the box",
      () =>
        Effect.gen(function* () {
          const { page } = yield* openLab(talkRoutes(), {
            href: talkAt('ask', 0, { text: 'follow' }),
            viewport,
          });
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* attributeIs(page, `${where} .lab-transcript-scroll`, 'tabindex', '0');
          yield* page.focus(`${where} .lab-transcript-scroll`);
          yield* evaluates(page, INSET_RING_SHOWN, true);
        }).pipe(Effect.scoped),
    );

    it.live(
      'Restore plays a struck word again, and Mark here marks a word, each with its receipt',
      () =>
        Effect.gen(function* () {
          const { page, asked } = yield* openLab(talkRoutes(), {
            href: talkAt('ask', 0, { text: 'follow', words: '2-2' }),
            viewport,
          });
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* page.click(`${where} [data-act="restore-words"]`);
          yield* textHas(page, said, `restore word 2 of ask in ${TALK_FILE}`);
          yield* page.goto(talkAt('ask', 0, { text: 'follow', words: '3-3' }));
          yield* page.waitFor(`${where} .lab-transcript-page`);
          yield* page.click(`${where} [data-act="mark-word"]`);
          yield* textHas(page, said, `mark the on word 3 of ask in ${TALK_FILE}`);
          expect(posted(asked)).toEqual([
            {
              path: `${TALK_API}/talk/restore`,
              body: Option.some({ section: 'ask', from: 2, to: 2 }),
            },
            {
              path: `${TALK_API}/talk/mark`,
              body: Option.some({ section: 'ask', word: 3, name: 'the' }),
            },
          ]);
        }).pipe(Effect.scoped),
    );
  });

describe('selecting words', () => {
  it.live(
    'a tap on a word of another section while a knob is selected selects the word, its section taking the path',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(talkRoutes(), {
          href: talkAt('ask', 0, { text: 'follow', knob: 'zoom' }),
        });
        yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
        yield* page.click('.lab-transcript-col [data-scene="answer"] [data-index="7"]');
        yield* page.until(`new URLSearchParams(location.search).get('words') === '7-7'`);
        yield* evaluates(page, `location.pathname.endsWith('/lab/answer')`, true);
        yield* evaluates(page, `new URLSearchParams(location.search).has('knob')`, false);
        yield* evaluates(page, painted('lab-picked'), ['show']);
        yield* textHas(page, '.lab-transcript-col .lab-transcript-picked', 'word 7 of answer');
      }).pipe(Effect.scoped),
  );

  it.live('a text selection across words selects them, from the first to the last', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(talkRoutes(), { href: talkAt('ask', 0, { text: 'follow' }) });
      const word = (i: number) =>
        `document.querySelector('.lab-transcript-col [data-scene="answer"] [data-index="${i}"]')`;
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      // A drag across the words as the browser leaves it: a range from inside one word to inside another, then the click that ends it.
      yield* page.evaluate(
        `(() => { const r = document.createRange(); r.setStart(${word(6)}.firstChild, 1); r.setEnd(${word(8)}.firstChild, 1); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ${word(8)}.click(); })()`,
      );
      yield* page.until(`new URLSearchParams(location.search).get('words') === '6-8'`);
      yield* evaluates(page, `location.pathname.endsWith('/lab/answer')`, true);
    }).pipe(Effect.scoped),
  );

  // Serial, each case here: a finger's touches (`film/touches-serial`).
  it.scopedLive.serial(
    'on a phone, a word tapped and another held then Select to here selects the words between, and Cut cuts them',
    () =>
      Effect.gen(function* () {
        const sheet = '.lab-transcript-sheet';
        const { page, asked } = yield* openLab(talkRoutes(), {
          href: talkAt('ask', 0, { text: 'follow' }),
          viewport: PHONE,
        });
        yield* page.waitFor(`${sheet} .lab-transcript-page`);
        yield* page.click(`${sheet} [data-scene="ask"] [data-index="3"]`);
        yield* page.until(`new URLSearchParams(location.search).get('words') === '3-3'`);
        // A touch held still on the last word opens the page's menu about it.
        yield* page.clock.hold;
        yield* fingerDown(page, `${sheet} [data-scene="ask"] [data-index="4"]`, 0);
        yield* page.clock.runFor(700);
        yield* page.waitFor('[data-role="context-menu"] [data-command="transcript.select-to"]');
        yield* evaluates(page, `${MENU_ITEMS}.includes('transcript.cut')`, true);
        yield* page.finger.up;
        yield* page.click('[data-role="context-menu"] [data-command="transcript.select-to"]');
        yield* page.clock.runFor(100);
        yield* page.until(`new URLSearchParams(location.search).get('words') === '3-4'`);
        yield* evaluates(page, painted('lab-picked'), ['the law']);
        yield* page.click(`${sheet} [data-act="cut-words"]`);
        yield* textHas(page, said, `cut words 3–4 of ask in ${TALK_FILE}`);
        expect(posted(asked)).toEqual([
          { path: `${TALK_API}/talk/cut`, body: Option.some({ section: 'ask', from: 3, to: 4 }) },
        ]);
      }),
  );
});

describe('Follow over a talk longer than the view', () => {
  /** The answer said as many words, evenly over its voice: more than a screen. */
  const answer = placed.find((p) => p.spec.id === 'answer');
  const span = (answer?.dur ?? 0) - speechOf('answer') - 0.2;
  const MANY = 900;
  const long: TalkWords = {
    ...WORDS,
    sections: WORDS.sections.map((s) => {
      if (s.id !== 'answer') return s;
      return {
        ...s,
        words: Array.from({ length: MANY }, (_, k) => ({
          index: 5 + k,
          text: `w${k}`,
          struck: false,
          heard: [(k * span) / MANY, ((k + 0.5) * span) / MANY] as const,
        })),
      };
    }),
  };
  const lateAt = speechOf('answer') + 0.9 * span;

  for (const [name, viewport, where] of PLACES)
    it.live(`${name}, a hand's scroll suspends Follow, and Follow takes the view back`, () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(talkRoutes(long), {
          href: talkAt('answer', lateAt, { text: 'follow' }),
          viewport,
        });
        yield* page.waitFor(`${where} .lab-transcript-page`);
        yield* attributeIs(page, `${where} [data-act="follow-transcript"]`, 'aria-pressed', 'true');
        yield* page.until(`${boxIn(where)}.scrollTop > 0`);
        yield* page.evaluate(`${boxIn(where)}.scrollTop = 0`);
        yield* page.evaluate(FRAMES);
        yield* attributeIs(
          page,
          `${where} [data-act="follow-transcript"]`,
          'aria-pressed',
          'false',
        );
        yield* page.evaluate(FRAMES);
        yield* evaluates(page, `${boxIn(where)}.scrollTop`, 0);
        yield* page.click(`${where} [data-act="follow-transcript"]`);
        yield* attributeIs(page, `${where} [data-act="follow-transcript"]`, 'aria-pressed', 'true');
        yield* page.until(`${boxIn(where)}.scrollTop > 0`);
      }).pipe(Effect.scoped),
    );
});

describe('the Transcript view held to the size rules', () => {
  it.live('on a phone its sheet fits the window, its targets a finger’s size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(talkRoutes(), {
        href: talkAt('ask', 0, { text: 'follow', words: '3-4' }),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-transcript-sheet .lab-transcript-page');
      yield* fitsPhone(page, '.lab-transcript-sheet');
      yield* noSidewaysBox(page, '.lab-transcript-sheet');
      const now = undersizedTargets(PHONE_HIT, '.lab-transcript-sheet');
      yield* page.until(`${now}.length === 0`, { now, say: (found) => `under a finger: ${found}` });
    }).pipe(Effect.scoped),
  );

  it.live('on a laptop its column’s targets a pointer’s size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(talkRoutes(), {
        href: talkAt('ask', 0, { text: 'follow', words: '3-4' }),
      });
      yield* page.waitFor('.lab-transcript-col .lab-transcript-page');
      yield* noSidewaysBox(page, '.lab-transcript-col');
      const now = undersizedTargets(DESK_HIT, '.lab-transcript-col');
      yield* page.until(`${now}.length === 0`, {
        now,
        say: (found) => `under a pointer: ${found}`,
      });
    }).pipe(Effect.scoped),
  );
});
