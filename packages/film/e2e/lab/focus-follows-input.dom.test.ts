// The ring follows the input that asked: a property over every path the
// pages offer that may move the focus, each run by the keyboard and by the
// pointer. A path's every focus move, and the focus it leaves, shows the
// studio's ring (`:focus-visible`) if and only if the keyboard asked for it,
// a text field excepted, which rings on a click too (the browser's rule).
//
// The paths are generated, not listed by hand:
// - every command each page's registry holds, read from ⌘K with a query
//   every id matches (`.`), so the Go to entries found only by typing are
//   in it too (one per kind of thing: they share one `go`), on each page as it
//   opens and with the thing selected that a command is about (a scene, a
//   point). Each runs from ⌘K by its keys (Control+k, then the row chosen
//   with the arrows and Enter) and by the pointer (the header's Go to…
//   clicked, then the row clicked); a command a page names in its `moves`
//   must also have moved the focus where it goes, by both;
// - every place in the lab's sources that moves the focus from script
//   (`FOCUS_SITES` in `src/lab/focus-sites.test.ts`, by file and call, the
//   lab's wrappers' callers and the kit popups' `initialFocus` too): that
//   unit test's source scan fails on a place not named there, and each site's
//   paths that no command reaches (a kind's tab, Back and Forward, a studio
//   button or its prompter, a kept take's reload, an ask's index entry and
//   its Send with a question open), or that a page's walk
//   reaches only once (the Script's note commands), run below, by the
//   keyboard and by the pointer, and a key pressed in the middle of a click.
// `:focus-visible` matches only in the window that has the focus, so every
// case runs alone, and a page without it answers so instead of passing.

import { Effect, type Scope } from 'effect';
import { expect, it } from 'effect-bun-test';
import type { Input } from '../../src/browser/keys.ts';
import { pageHref } from '../../src/core/api.ts';
import {
  DESK,
  type Json,
  json,
  labAt,
  openLab,
  openPlayer,
  openReview,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import {
  STUDIO_ASK,
  STUDIO_GUIDED,
  guidedRoutes,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { until, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { LEFT_OPEN, pageAfterPage, registry, runFromMenu, sampled } from './registry.ts';
import { ASK_READY, WORK_ROUTES, scriptAt } from './studio-states.ts';
import { onChoices } from './toy-choices.ts';

const SLOW = 30_000;
/** A page's whole registry, each command run twice. */
const REGISTRY = 240_000;

const INPUTS: ReadonlyArray<Input> = ['key', 'pointer'];

/** A page-side function: an element's name, as `tag.class.class[role=…]`. */
const NAME = `((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.hasAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') + (el.dataset.act === undefined ? '' : '[data-act=' + el.dataset.act + ']'))`;

/** A text field: the browser shows the ring on it whatever focused it. */
const TEXT_FIELD = `input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image]), textarea, [contenteditable]:not([contenteditable=false])`;

/**
 * A script that, from now on, keeps every focus move as `[element, shown, text field]` (the
 * shown ones and the ones without the ring alike, unlike a watch on `:focus-visible` matches),
 * and counts animation frames; listening once per document.
 */
const WATCH = `(() => {
  window.focusMoves = [];
  window.focusFrames = 0;
  window.focusLeaving = false;
  if (window.focusWatched !== true) {
    window.focusWatched = true;
    const name = ${NAME};
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      window.focusMoves.push([name(el), el.matches(':focus-visible'), el.matches('${TEXT_FIELD}')]);
    }, true);
    const frame = () => { window.focusFrames += 1; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    // A command that opens another part is kept on this page: it moves no focus here, and the
    // page it would open is not served.
    navigation.addEventListener('navigate', (e) => {
      if (new URL(e.destination.url).pathname === location.pathname || !e.cancelable) return;
      e.preventDefault();
      window.focusLeaving = true;
    });
  }
  return true;
})()`;

/**
 * What the watch saw and where the focus is now: each move, then the focus left (none on the
 * body), each as `[element, shown, text field]`; whether this page armed the watch, whether
 * the window has the focus, and whether a command tried to leave the page.
 */
const SEEN = `({
  watching: Array.isArray(window.focusMoves),
  moves: Array.isArray(window.focusMoves) ? window.focusMoves : [],
  left: [document.activeElement].filter((el) => el !== null && el !== document.body).map((el) => [${NAME}(el), el.matches(':focus-visible'), el.matches('${TEXT_FIELD}')]),
  focused: document.hasFocus(),
  leaving: window.focusLeaving === true,
})`;

type Stop = readonly [element: string, shown: boolean, text: boolean];
interface Seen {
  /** Whether the page armed the watch: a page opened again since has not. */
  readonly watching: boolean;
  readonly moves: ReadonlyArray<Stop>;
  /** The focus left, none when it is on the body. */
  readonly left: ReadonlyArray<Stop>;
  readonly focused: boolean;
  /** A command tried to open another part: it was kept here, and the page is opened again. */
  readonly leaving: boolean;
}

/** How a stop looks, by whether it shows the ring. */
const LOOK = { true: 'shows the ring', false: 'shows none' } as const;

/** Each stop of `seen` whose ring is not what `input` asks: shown iff the keyboard asked, a text field always. */
const wrong = (path: string, input: Input, seen: Seen): ReadonlyArray<string> => {
  if (!seen.focused)
    return [`${path} by ${input}: the window has no focus, so nothing can be read`];
  const off = (where: string) => (stop: Stop) =>
    [stop]
      .filter(([, shown, text]) => shown !== (text || input === 'key'))
      .map(([element, shown]) => `${path} by ${input}: ${where} ${element} ${LOOK[`${shown}`]}`);
  return [...seen.moves.flatMap(off('moved to')), ...seen.left.flatMap(off('left on'))];
};

/**
 * Three frames since the watch was armed, or a page that is going (another part opened: the
 * watch goes with it, and the page is opened again), or a new page, which never armed one.
 */
const SETTLED = `window.focusFrames === undefined || window.focusFrames >= 3 || window.focusLeaving === true`;

/** Arm the watch; then, after `path`, wait three frames and read what it saw, with what the path answered. */
const watchedThen = <A>(page: Tab, path: Effect.Effect<A>) =>
  Effect.gen(function* () {
    yield* page.evaluate(WATCH);
    const answered = yield* path;
    yield* until(page, SETTLED);
    yield* page.evaluate(`window.focusFrames = 0; true`);
    yield* until(page, SETTLED);
    return [answered, yield* page.evaluate<Seen>(SEEN)] as const;
  });

/** Arm the watch; then, after `path`, wait three frames and read what it saw. */
const watched = (page: Tab, path: Effect.Effect<void>) =>
  Effect.map(watchedThen(page, path), ([, seen]) => seen);

/** A page the property opens, by its name. */
interface Opened {
  readonly name: string;
  readonly open: () => Effect.Effect<{ readonly page: Tab }, never, Scope.Scope>;
  /**
   * The commands (by id, or a family's prefix) that move the focus on this page as it opens,
   * each with the element it moves it to (by name, `NAME`): each must run by both inputs and
   * move the focus there, so a site a command reaches is proved reached, not only listed.
   */
  readonly moves: ReadonlyArray<readonly [command: string, to: RegExp]>;
  /**
   * The commands (by id) that must run on this page by both inputs, whose focus move ⌘K's own
   * closing takes back (a text field's: the follow-up in `rings/state.md`); the cases below
   * move it by their keys.
   */
  readonly runs: ReadonlyArray<string>;
}

/**
 * Run every command of the page's registry from ⌘K by each input, on the page `opened`
 * opens; a command that leaves the page (another part) or leaves a root open has the page
 * opened again before the next. Fails naming each stop whose ring is not the input's, and
 * each command of `opened.moves` that did not run, or ran and moved no focus.
 */
const everyCommand = (opened: Opened) =>
  Effect.gen(function* () {
    const walk = yield* pageAfterPage(opened.open);
    const start = yield* walk.page().evaluate<string>('location.pathname');
    const ids = sampled(yield* registry(walk.page()));
    const failures: Array<string> = [];
    const ran: Array<string> = [];
    const reached: Array<string> = [];
    /** Where each of `opened.moves` moved the focus instead, by input. */
    const went = new Map<string, string>();
    for (const id of ids)
      for (const input of INPUTS) {
        const page = walk.page();
        const [offered, seen] = yield* watchedThen(page, runFromMenu(page, id, input));
        // A command that would open another part moves nothing on this page.
        if (offered && seen.watching && !seen.leaving) {
          ran.push(`${id} by ${input}`);
          failures.push(...wrong(`${opened.name}: ${id}`, input, seen));
          for (const [command, to] of opened.moves.filter(([c]) => id.startsWith(c))) {
            if (seen.moves.some(([element]) => to.test(element)))
              reached.push(`${command} by ${input}`);
            went.set(
              `${command} by ${input}`,
              [...seen.moves, ...seen.left].map(([element]) => element).join(' → '),
            );
          }
        }
        const away = yield* page.evaluate<boolean>(
          `location.pathname !== '${start}' || window.focusMoves === undefined || window.focusLeaving === true || ${LEFT_OPEN}`,
        );
        if (away) yield* walk.again;
      }
    expect(ran.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    const missing = opened.moves.flatMap(([command, to]) =>
      INPUTS.filter((input) => !reached.includes(`${command} by ${input}`)).map(
        (input) =>
          `${opened.name}: ${command} by ${input} never moved the focus to ${to} (it went: ${went.get(`${command} by ${input}`) ?? 'not run'})`,
      ),
    );
    expect(missing).toEqual([]);
    const unrun = opened.runs.flatMap((command) =>
      INPUTS.filter((input) => !ran.includes(`${command} by ${input}`)).map(
        (input) => `${opened.name}: ${command} by ${input} never ran`,
      ),
    );
    expect(unrun).toEqual([]);
  });

/** One beat to record, with one earlier attempt that can be kept, whose keep mixes: the page reloads. */
const STUDIO_ROUTES = [
  route('GET', /^\/studio\/beats$/, () =>
    json({
      film: PROBE,
      beats: [
        {
          id: 'thesis',
          file: 'thesis.wav',
          parts: [{ kind: 'line', text: 'The law is holy.' }],
          sources: [],
          state: 'staging',
          recorded: false,
          attempts: 1,
        },
      ],
    }),
  ),
  route('GET', /^\/studio\/takes\/thesis\/attempts$/, () =>
    json({
      beat: 'thesis',
      attempts: [
        {
          file: 'thesis.new.flac',
          transcript: 'the law is holy',
          wer: 0,
          at: 0,
          duration: 2.5,
          kept: false,
          current: true,
        },
      ],
    }),
  ),
  route('POST', /^\/studio\/takes\/thesis\/keep$/, () =>
    json({
      beat: 'thesis',
      take: { hash: 'h', file: 'thesis.new.flac', duration: 2.5, words: [], source: 'recorded' },
      transcript: 'the law is holy',
      wer: 0,
      timings: { voice: 'v', scenes: {} },
      mixed: true,
    } satisfies Json),
  ),
];

/** The Lab in Record over `STUDIO_ROUTES`. */
const inRecord = () =>
  openLab(STUDIO_ROUTES, { href: labAt(1), mic: { allowed: true }, mode: 'record' });

/** The pages whose registries the property runs, each at a desk. */
/** Scenes at a desk, its stills drawn. */
const onScenes = () =>
  openPlayer(
    { href: pageHref.scenes(PROBE), viewport: DESK },
    '.sc-still[data-drawn="true"] canvas',
  );

/** A still on Scenes: a click on it selects its scene. */
const STILL = '.sc-still';

/**
 * Scenes, its project read (the film's mark in the legend), a scene selected by a click on its
 * still: the commands about it are offered, a comment among them.
 */
const sceneChosen = () =>
  Effect.tap(
    openPlayer(
      { href: pageHref.scenes(PROBE), viewport: DESK },
      '.sc-legend-item[data-mark="film"]',
      WORK_ROUTES,
    ),
    ({ page }) =>
      Effect.andThen(page.click(STILL), waitFor(page, `${STILL}[data-selected="true"]`)),
  );

const PAGES: ReadonlyArray<Opened> = [
  { name: 'the Lab', open: () => openLab(), moves: [], runs: [] },
  {
    name: 'the Lab in Note',
    open: () => openLab([], { mode: 'note' }),
    moves: [],
    runs: ['notes.frame'],
  },
  { name: 'Record', open: inRecord, moves: [], runs: [] },
  { name: 'Scenes', open: onScenes, moves: [], runs: [] },
  { name: 'Scenes, a scene selected', open: sceneChosen, moves: [], runs: ['scenes.comment'] },
  {
    name: 'Play',
    open: () =>
      openPlayer({ href: pageHref.play(PROBE), viewport: DESK }, '.bar [data-act="play"]'),
    moves: [],
    runs: [],
  },
  {
    // A point selected: its auditions are offered.
    name: 'Choices',
    open: () => onChoices(),
    moves: [
      ['review.audition-next', /\.rv-sound/],
      ['review.audition-previous', /\.rv-sound/],
      ['go.choice.', /\.lab-inspect|\.rv-/],
    ],
    runs: [],
  },
];

/**
 * A case that runs alone, its scope closed at its end, a timeout's included (`it.scopedLive.serial`):
 * `:focus-visible` matches only in the window that has the focus, and a sibling case opening
 * its own tab at once takes it.
 */
const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  it.scopedLive.serial(name, () => Effect.asVoid(body), timeout);

for (const opened of PAGES)
  alone(
    `on ${opened.name}, every command run from ⌘K shows the ring where it moves the focus iff the keyboard asked`,
    everyCommand(opened),
    REGISTRY,
  );

/** How each input asks, as a case's name says it. */
const ASKED = { key: 'pressed', pointer: 'clicked' } as const;

/** A command whose field ⌘K's closing takes the focus back from, run by its key instead. */
const BY_THEIR_KEYS = [
  {
    command: 'scenes.comment, a scene selected,',
    open: sceneChosen,
    key: 'm',
    field: 'input.rv-comment-input',
  },
  {
    command: 'notes.frame, in Note,',
    open: () => openLab([], { mode: 'note' }),
    key: 'n',
    field: '.lab-compose textarea',
  },
] as const;

for (const { command, open, key, field } of BY_THEIR_KEYS)
  alone(
    `${command} by its key puts the focus in its field, which rings as a text field does`,
    Effect.gen(function* () {
      const { page } = yield* open();
      const seen = yield* watched(
        page,
        Effect.andThen(
          page.press(key),
          until(page, `document.activeElement?.matches('${field}') === true`),
        ),
      );
      yield* holds(command, 'key', seen);
      expect(page.errors).toEqual([]);
    }),
  );

/**
 * The Script's note commands, offered once words are selected and while no note is being
 * made (so a page's walk runs only its first), with the field each opens the composer on:
 * a correction's is the words to say instead.
 */
const SCRIPT_ASKS = [
  { command: 'script.note', field: '.lab-compose textarea' },
  { command: 'script.correct', field: '.lab-compose input.lab-instead' },
] as const;

for (const { command, field } of SCRIPT_ASKS)
  for (const input of INPUTS)
    alone(
      `on the Script, words selected, ${command} ${ASKED[input]} in ⌘K puts the focus in its field, which rings as a text field does`,
      Effect.gen(function* () {
        const page = yield* scriptAt({ words: '4-7' })(DESK);
        const [offered, seen] = yield* watchedThen(
          page,
          Effect.gen(function* () {
            const ran = yield* runFromMenu(page, command, input);
            if (ran) yield* until(page, `document.activeElement?.matches('${field}') === true`);
            return ran;
          }),
        );
        expect(offered).toBe(true);
        yield* holds(`the Script's ${command}`, input, seen);
        expect(page.errors).toEqual([]);
      }),
    );

for (const input of INPUTS)
  alone(
    `on the Script, a correction's Save ${ASKED[input]} with its words unchanged puts the focus in the words to say instead, which rings as a text field does`,
    Effect.gen(function* () {
      const page = yield* scriptAt({ words: '4-7' })(DESK);
      const compose = '[data-role="script-compose"]';
      const save = `${compose} button[type="submit"]`;
      yield* page.click('[data-act="note-words"]');
      yield* waitFor(page, `${compose} .lab-compose:not([hidden])`);
      yield* page.click(`${compose} [data-ask="correction"]`);
      yield* waitFor(page, `${compose} .lab-instead`);
      if (input === 'key') yield* page.focus(save);
      const seen = yield* watched(
        page,
        Effect.gen(function* () {
          if (input === 'key') yield* page.press('Enter');
          else yield* page.click(save);
          yield* until(
            page,
            `document.activeElement?.matches('${compose} .lab-instead[aria-invalid="true"]') === true`,
          );
        }),
      );
      yield* holds('a Save that found the words to say instead wanting', input, seen);
      expect(page.errors).toEqual([]);
    }),
  );

/** Fail naming each stop `seen` holds whose ring is not `input`'s. */
const holds = (path: string, input: Input, seen: Seen) =>
  Effect.sync(() => expect(wrong(path, input, seen)).toEqual([]));

/** A kind's tab on Choices. */
const SCORE_TAB = '.rv-kinds [data-kind="score"]';

alone(
  'on Choices opened on a point, nothing asked: the card has the focus, with no ring',
  Effect.gen(function* () {
    const { page, errors } = yield* onChoices('take:paper.page');
    yield* until(
      page,
      `document.activeElement?.closest('.rv-option')?.id === 'point-take:paper.page'`,
    );
    yield* holds('a page opened on a point', 'pointer', yield* page.evaluate<Seen>(SEEN));
    expect(errors).toEqual([]);
  }),
);

for (const input of INPUTS)
  alone(
    `on Choices, a kind's tab ${ASKED[input]}, the card it goes to shows the ring iff the keyboard asked`,
    Effect.gen(function* () {
      const { page, errors } = yield* onChoices('take:paper.page');
      yield* waitFor(page, SCORE_TAB);
      if (input === 'key') yield* page.focus(SCORE_TAB);
      const seen = yield* watched(
        page,
        Effect.gen(function* () {
          if (input === 'key') yield* page.press('Enter');
          else yield* page.click(SCORE_TAB);
          yield* until(page, `document.activeElement?.closest('.rv-option')?.id === 'point-score'`);
        }),
      );
      yield* holds("a kind's tab", input, seen);
      expect(errors).toEqual([]);
    }),
  );

alone(
  "on Choices, a kind's tab clicked with a key pressed while the button is down: the card it goes to shows no ring",
  Effect.gen(function* () {
    const { page, errors } = yield* onChoices('take:paper.page');
    yield* waitFor(page, SCORE_TAB);
    const tab = yield* page.box(SCORE_TAB);
    const seen = yield* watched(
      page,
      Effect.gen(function* () {
        yield* page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        yield* page.mouse.down;
        yield* page.press('Shift');
        yield* page.mouse.up;
        yield* until(page, `document.activeElement?.closest('.rv-option')?.id === 'point-score'`);
      }),
    );
    yield* holds("a kind's tab clicked, a key pressed mid-click", 'pointer', seen);
    expect(errors).toEqual([]);
  }),
);

/** Another kind's tab: a second step for Back to walk. */
const LEVEL_TAB = '.rv-kinds [data-kind="level"]';

/** The card in focus is `point`'s. */
const onCard = (point: string) =>
  `document.activeElement?.closest('.rv-option')?.id === 'point-${point}'`;

/** How each input walks Back, as a case's name says it. */
const BACK = {
  key: 'by a key the browser walks it by',
  pointer: 'the page never hears (the toolbar’s), after a key',
} as const;

/**
 * Back as a key the browser walks the history by: ⌘[ pressed, and, if this browser (a
 * headless one) left the walk to the page, the step it would have taken.
 */
const backByKey = (page: Tab) =>
  Effect.gen(function* () {
    const before = yield* page.url;
    yield* page.press('Meta+[');
    yield* page.evaluate(`new Promise((done) => setTimeout(() => done(true), 300))`);
    if ((yield* page.url) === before) yield* page.back;
  });

for (const input of INPUTS)
  alone(
    `on Choices, Back ${BACK[input]}: the card it lands on shows the ring iff a key walked`,
    Effect.gen(function* () {
      const { page, errors } = yield* onChoices('take:paper.page');
      yield* waitFor(page, SCORE_TAB);
      yield* page.click(SCORE_TAB);
      yield* until(page, onCard('score'));
      yield* page.click(LEVEL_TAB);
      yield* until(page, onCard('level:const:PAPER'));
      const seen = yield* watched(
        page,
        Effect.gen(function* () {
          if (input === 'key') yield* backByKey(page);
          else {
            // A key the page hears, then a step it does not: the toolbar's Back, a swipe.
            yield* page.press('Shift');
            yield* page.back;
          }
          yield* until(page, onCard('score'));
        }),
      );
      yield* holds('Back', input, seen);
      expect(errors).toEqual([]);
    }),
  );

/** The studio, a beat in it, its prompter, and an earlier attempt's Keep. */
const STUDIO = '[data-role="studio"]';
const BEAT = '[data-beat="thesis"]';
const PROMPTER = '[data-role="prompter"]';
const KEEP = '[data-file="thesis.new.flac"] [data-act="keep"]';

for (const [part, at] of [
  ['a studio button', BEAT],
  ['the prompter', PROMPTER],
] as const)
  alone(
    `in Record, the keyboard on the studio, then ${part} pressed with the mouse: the ring goes`,
    Effect.gen(function* () {
      const { page, errors } = yield* inRecord();
      yield* waitFor(page, BEAT);
      yield* waitFor(page, at);
      yield* page.focus(STUDIO);
      yield* page.press('ArrowRight');
      const seen = yield* watched(page, page.click(at));
      yield* holds(`${part} after the keyboard`, 'pointer', seen);
      expect(errors).toEqual([]);
    }),
  );

for (const input of INPUTS)
  alone(
    `in Record, Keep ${ASKED[input]}, the take kept reloads the page, and the studio takes the focus back with the ring iff the keyboard asked`,
    Effect.gen(function* () {
      const { page, errors } = yield* inRecord();
      yield* waitFor(page, BEAT);
      yield* page.click(BEAT);
      yield* waitFor(page, `${KEEP}:not([disabled])`);
      const loaded = yield* page.nextLoad;
      if (input === 'key') yield* page.pressIn(KEEP, 'Enter');
      else yield* page.click(KEEP);
      yield* loaded;
      yield* waitFor(page, BEAT);
      yield* until(page, `document.activeElement?.matches('${STUDIO}') === true`);
      const seen = yield* page.evaluate<Seen>(SEEN);
      yield* holds('a kept take’s reload', input, seen);
      expect(errors).toEqual([]);
    }),
  );

alone(
  'in Record, Keep pressed, then a beat clicked, then a reload nothing asked for: the studio takes the focus back with no ring',
  Effect.gen(function* () {
    const { page, errors } = yield* inRecord();
    yield* waitFor(page, BEAT);
    yield* page.click(BEAT);
    yield* waitFor(page, `${KEEP}:not([disabled])`);
    const kept = yield* page.nextLoad;
    yield* page.pressIn(KEEP, 'Enter');
    yield* kept;
    yield* waitFor(page, BEAT);
    yield* until(page, `document.activeElement?.matches('${STUDIO}:focus-visible') === true`);
    yield* page.click(BEAT);
    // A reload the viewer did not ask for (the rebuild's, an Undo's) restores the focus as nothing asked.
    yield* page.reload;
    yield* waitFor(page, BEAT);
    yield* until(page, `document.activeElement?.matches('${STUDIO}') === true`);
    yield* holds('a reload after a click', 'pointer', yield* page.evaluate<Seen>(SEEN));
    expect(errors).toEqual([]);
  }),
);

alone(
  'in Record, a studio control the keyboard pressed away hands the focus to the studio, with the ring',
  Effect.gen(function* () {
    const { page, errors } = yield* inRecord();
    yield* waitFor(page, BEAT);
    yield* page.click(BEAT);
    const record = `${STUDIO} [data-act="arm"]`;
    yield* waitFor(page, record);
    yield* page.focus(record);
    const seen = yield* watched(
      page,
      Effect.gen(function* () {
        yield* page.press('Enter');
        yield* until(page, `document.querySelector('${record}') === null`);
        yield* until(page, `document.activeElement?.matches('${STUDIO}') === true`);
      }),
    );
    yield* holds('a studio control pressed away', 'key', seen);
    expect(errors).toEqual([]);
  }),
);

/**
 * An ask's goTo (`ask/parts.tsx`): its index's entry takes the owner to a section's head, and
 * a Send with a question open to the question's first control, each ringed iff the keyboard asked.
 */
const ASK_GOES = [
  {
    path: "an ask's index entry",
    ask: STUDIO_GUIDED,
    routes: guidedRoutes,
    press: '.ak-index li:last-child [data-act="go-section"]',
    lands: '.ak-step:last-child .ak-section-h',
  },
  {
    path: "an ask's Send with a question open",
    ask: STUDIO_ASK,
    routes: studioRoutes,
    press: ASK_READY,
    lands: '.ak-field[data-answer="take"] button',
  },
] as const;

for (const { path, ask, routes, press, lands } of ASK_GOES)
  for (const input of INPUTS)
    alone(
      `on an ask, ${path} ${ASKED[input]} moves the focus where it goes, which rings iff the keyboard asked`,
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: pageHref.ask(ask) });
        yield* waitFor(page, press);
        if (input === 'key') yield* page.focus(press);
        const seen = yield* watched(
          page,
          Effect.gen(function* () {
            if (input === 'key') yield* page.press('Enter');
            else yield* page.click(press);
            yield* until(page, `document.activeElement?.matches('${lands}') === true`);
          }),
        );
        yield* holds(path, input, seen);
        expect(errors).toEqual([]);
      }),
    );
