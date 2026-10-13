// The ring follows the input that asked: a property over every path the
// pages offer that may move the focus, each run by the keyboard and by the
// pointer. A path's every focus move, and the focus it leaves, shows the
// studio's ring (`:focus-visible`) if and only if the keyboard asked for it,
// a text field excepted, which rings on a click too (the browser's rule).
//
// The paths are generated, not listed by hand:
// - every command each page's registry holds, read from ⌘K with a query
//   every id matches (`.`), so the Go to entries found only by typing are
//   in it too (one per kind of thing: they share one `go`). Each runs from ⌘K
//   by its keys (Control+k, then the row chosen with the arrows and Enter) and
//   by the pointer (the header's Go to… clicked, then the row clicked);
// - every place in the lab's sources that moves the focus from script
//   (`FOCUS_SITES`): a source scan fails on a file that moves the focus and
//   is not named there, and each named site's paths that no command reaches
//   (a kind's tab, a studio button, a kept take's reload) run below it, by
//   the keyboard and by the pointer.
// `:focus-visible` matches only in the window that has the focus, so every
// case runs alone, and a page without it answers so instead of passing.

import { BunServices } from '@effect/platform-bun';
import { Effect, Exit, FileSystem, Path, Scope } from 'effect';
import { expect, it, test } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import {
  DESK,
  type Json,
  json,
  labAt,
  openLab,
  openPlayer,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { until, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { type Input, LEFT_OPEN, registry, runFromMenu, sampled } from './registry.ts';
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
}

/**
 * Run every command of the page's registry from ⌘K by each input, on the page `opened`
 * opens; a command that leaves the page (another part) or leaves a root open has the page
 * opened again before the next. Fails naming each stop whose ring is not the input's.
 */
const everyCommand = (opened: Opened) =>
  Effect.gen(function* () {
    let scope = yield* Scope.make();
    let page = (yield* Scope.provide(scope)(opened.open())).page;
    const start = yield* page.evaluate<string>('location.pathname');
    const ids = sampled(yield* registry(page));
    const failures: Array<string> = [];
    const ran: Array<string> = [];
    for (const id of ids)
      for (const input of INPUTS) {
        const [offered, seen] = yield* watchedThen(page, runFromMenu(page, id, input));
        // A command that would open another part moves nothing on this page.
        if (offered && seen.watching && !seen.leaving) {
          ran.push(`${id} by ${input}`);
          failures.push(...wrong(`${opened.name}: ${id}`, input, seen));
        }
        const away = yield* page.evaluate<boolean>(
          `location.pathname !== '${start}' || window.focusMoves === undefined || window.focusLeaving === true || ${LEFT_OPEN}`,
        );
        if (away) {
          yield* Scope.close(scope, Exit.void);
          scope = yield* Scope.make();
          page = (yield* Scope.provide(scope)(opened.open())).page;
        }
      }
    yield* Scope.close(scope, Exit.void);
    expect(ran.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
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
const PAGES: ReadonlyArray<Opened> = [
  { name: 'the Lab', open: () => openLab() },
  { name: 'Record', open: inRecord },
  {
    name: 'Scenes',
    open: () =>
      openPlayer(
        { href: pageHref.scenes(PROBE), viewport: DESK },
        '.sc-still[data-drawn="true"] canvas',
      ),
  },
  {
    name: 'Play',
    open: () =>
      openPlayer({ href: pageHref.play(PROBE), viewport: DESK }, '.bar [data-act="play"]'),
  },
  { name: 'Choices', open: () => onChoices() },
];

/**
 * Every place in the lab's sources that moves the focus from script, by file, with the paths
 * that reach it: a command's (run above, from each registry), or one of the cases below.
 */
const FOCUS_SITES = {
  'notes/section.tsx': "the Lab's Note frame command opens the composer, a text field",
  'scenes/view.tsx': "Scenes' comment command focuses a scene's field, a text field",
  'review/options/choice.tsx':
    "Choices' Go to entries; a kind's tab, clicked and pressed; a page opened on a point",
  'review/options/context.tsx': "Choices' auditions, from ⌘K",
  'studio/section.tsx':
    'a studio button pressed after the keyboard; a kept take’s reload, by the keyboard and the pointer; a control the keyboard pressed away',
};

/** The lab's sources (tests and fixtures aside) that move the focus from script. */
const focusingFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.join(import.meta.dir, '..', '..', 'src', 'lab');
  const sources = (yield* fs.readDirectory(root, { recursive: true })).filter(
    (f) => /\.tsx?$/.test(f) && !/(^|\/)fixtures\/|\.test\.tsx?$/.test(f),
  );
  const moving = yield* Effect.filter(sources, (file) =>
    Effect.map(fs.readFileString(path.join(root, file)), (source) =>
      /\.focus\s*\(|\bfocusFor\s*\(/.test(source),
    ),
  );
  return moving.toSorted();
});

/** The file that owns the lab's focus moves: it moves the focus for every site. */
const HELPER = 'focus.ts';

/**
 * A case that runs alone, its scope closed at its end: `:focus-visible` matches only in the
 * window that has the focus, and a sibling case opening its own tab at once takes it.
 */
const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  test.serial(name, () => Effect.runPromise(Effect.scoped(body)), timeout);

it.effect.layer(BunServices.layer)(
  'every lab source that moves the focus is a named site, with its paths',
  () =>
    Effect.map(focusingFiles, (files) =>
      expect(files.filter((f) => f !== HELPER)).toEqual(Object.keys(FOCUS_SITES).toSorted()),
    ),
);

for (const opened of PAGES)
  alone(
    `on ${opened.name}, every command run from ⌘K shows the ring where it moves the focus iff the keyboard asked`,
    everyCommand(opened),
    REGISTRY,
  );

/** How each input asks, as a case's name says it. */
const ASKED = { key: 'pressed', pointer: 'clicked' } as const;

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

/** The studio, a beat in it, and an earlier attempt's Keep. */
const STUDIO = '[data-role="studio"]';
const BEAT = '[data-beat="thesis"]';
const KEEP = '[data-file="thesis.new.flac"] [data-act="keep"]';

alone(
  'in Record, the keyboard on the studio, then a studio button pressed with the mouse: the ring goes',
  Effect.gen(function* () {
    const { page, errors } = yield* inRecord();
    yield* waitFor(page, BEAT);
    yield* page.focus(STUDIO);
    yield* page.press('ArrowRight');
    const seen = yield* watched(page, page.click(BEAT));
    yield* holds('a studio button after the keyboard', 'pointer', seen);
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
