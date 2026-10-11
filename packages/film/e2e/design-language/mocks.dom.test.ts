// Every design-language mock sets its lengths on the scales, read in the
// browser as the page it is (`mock-lengths.ts`): each mock is one case, read
// at each width its queries name, on the phone's pointer and the desk's; one
// more case reads every mock for the selectors of the sheets they share. A
// planted page of each shape a length can take shows the check catches it.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { type Raw, mockLengths } from './mock-lengths.ts';

const ROOT = `${import.meta.dir}/../../../..`;
const MOCKS = '/design-language/mocks';
const TOKENS = '/packages/film/src/player/tokens.css';
const TYPES = new Map([
  ['html', 'text/html'],
  ['css', 'text/css'],
]);

const typeOf = (path: string) => TYPES.get(path.split('.').pop() ?? '') ?? 'text/plain';

/** The pages of the repo the mocks load, by their paths from the root: each mock, its sheets, the player's tokens; `pages` beside them. */
const serve = (pages: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = (yield* fs.readDirectory(`${ROOT}${MOCKS}`)).map((file) => `${MOCKS}/${file}`);
    const repo = yield* Effect.forEach([...files, TOKENS], (path) =>
      Effect.map(
        fs.readFileString(`${ROOT}${path}`),
        (text) => [path, respond(text, typeOf(path))] as const,
      ),
    );
    const planted = Object.entries(pages).map(
      ([path, text]) => [path, respond(text, typeOf(path))] as const,
    );
    return servePaths(Object.fromEntries([...repo, ...planted]));
  }).pipe(Effect.provide(BunServices.layer));

/** A page to read: its name in the findings, its path, and the planted pages served beside the repo's. */
interface Page {
  readonly file: string;
  readonly path: string;
  readonly pages: Readonly<Record<string, string>>;
}

/** The page read on one pointer, at each width its queries name, then `then` on the tab. */
const visit = <A, E, R>(
  page: Page,
  coarse: boolean,
  then: (tab: Tab, script: ReturnType<typeof mockLengths>) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const tab = yield* openTab({
      width: 1440,
      height: 900,
      microphone: false,
      init: [],
      assets: [],
      serve: yield* serve(page.pages),
      coarse,
    });
    yield* tab.goto(page.path);
    const script = mockLengths(page.file);
    const widths = yield* tab.evaluate<ReadonlyArray<number>>(script.pass);
    for (const width of widths) {
      yield* tab.resize(width, 900);
      yield* tab.evaluate(script.pass);
    }
    return yield* then(tab, script);
  }).pipe(Effect.scoped);

/** What one pointer found, read once the passes are done (each pass is synchronous, so nothing is left to settle). */
const rawOf = (page: Page, coarse: boolean) =>
  visit(page, coarse, (tab, script) => tab.evaluate<Raw>(script.raw));

/**
 * What the check finds on a page, read on the phone's pointer and then the
 * desk's: every red either finds, and each of the page's own selectors that
 * reaches no element on either: `want`.
 */
const read = (page: Page, want: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const phone = yield* rawOf(page, true);
    yield* visit(page, false, (tab, script) => evaluates(tab, script.found(phone), want));
  });

/** The selectors of the shared sheets no page reaches on either pointer. */
const sharedUnreached = (pages: ReadonlyArray<Page>) =>
  Effect.gen(function* () {
    const each = yield* Effect.forEach(pages, (page) =>
      Effect.map(Effect.all([rawOf(page, true), rawOf(page, false)]), ([phone, desk]) =>
        phone.shared.filter((line) => desk.shared.includes(line)),
      ),
    );
    const [first = [], ...rest] = each;
    return first.filter((line) => rest.every((here) => here.includes(line)));
  });

const wears = `<link rel="stylesheet" href="${TOKENS}"><link rel="stylesheet" href="${MOCKS}/kit.css">`;

/** A planted page's html: `head` (the tokens and the kit), its own `css` over `body`. */
const pageOf = (css: string, body: string, head = wears) =>
  `<!doctype html><html><head>${head}<style>${css}</style></head><body>${body}</body></html>`;

/** A planted mock, `case.html` (or `file`): wearing the tokens and the kit (or `head`), its own `css` over `body`. */
const planted = (
  css: string,
  body: string,
  want: ReadonlyArray<string>,
  file = 'case.html',
  head = wears,
) => read({ file, path: `/${file}`, pages: { [`/${file}`]: pageOf(css, body, head) } }, want);

const SLOW = 30_000;

/** The mocks, one case each: named here, as a case is named before any runs; the first case holds the list to the folder. */
const MOCK_PAGES = [
  'choices.html',
  'films.html',
  'folder.html',
  'lab-compare.html',
  'lab-motion.html',
  'lab-note.html',
  'lab-record.html',
  'lab-source.html',
  'lab.html',
  'play.html',
  'project.html',
  'scenes.html',
  'set.html',
];

describe('the design-language mocks', () => {
  it.live('are each read: every page in the folder is a case', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pages = (yield* fs.readDirectory(`${ROOT}${MOCKS}`)).filter((file) =>
        file.endsWith('.html'),
      );
      expect(pages.toSorted()).toEqual(MOCK_PAGES);
    }).pipe(Effect.provide(BunServices.layer)),
  );
  for (const file of MOCK_PAGES)
    it.live(
      `${file} sets each space, type size, leading and radius on its scale`,
      () => read({ file, path: `${MOCKS}/${file}`, pages: {} }, []),
      SLOW,
    );
});

describe('the mock length check, on planted pages', () => {
  it.live(
    'names a mock that wears no kit, or writes a token; a Lab mock wears the Lab sheet too',
    () =>
      Effect.andThen(
        planted(
          ':root { --accent: #f00; } .x { --s-2: 3px; --own: 1px; }',
          '<p class="x">x</p>',
          ['case.html: links no kit.css', 'case.html: writes --accent', 'case.html: writes --s-2'],
          'case.html',
          `<link rel="stylesheet" href="${TOKENS}">`,
        ),
        planted('', '<p>x</p>', ['lab-case.html: links no lab.css'], 'lab-case.html'),
      ),
    SLOW,
  );

  it.live(
    'names a length off each scale: a space, a type size, a leading and a radius, in a rule or a style attribute',
    () =>
      planted(
        `.space { padding: 6px var(--s-2) 8px; margin-block-end: 7px; gap: 12px; }
         .type { font: 15px/19px monospace; } .one { font-size: 1px; line-height: 1px; }
         .corner { border-top-left-radius: 3px; }
         .units { padding: 0.5rem; gap: 0.7em; font-size: 0.93rem; }
         .panel { width: 34px; height: 100px; margin-bottom: -17px; }
         .other { font-size: var(--s-2); padding: var(--hairline); border-radius: var(--hairline); }
         .outer { padding: 6px; .inner { color: red; } }`,
        `<p class="space">a</p><p class="type">b</p><p class="one">b</p><p class="corner">c</p><p class="units">d</p>
         <p class="panel">e</p><p class="other">f</p><div class="outer"><i class="inner">g</i></div>
         <p style="margin: 6px; padding: 4px">h</p>`,
        [
          'case.html: padding 6px is no space step (.space)',
          'case.html: margin-block-end 7px is no space step (.space)',
          'case.html: font-size 15px is no type size step (.type)',
          'case.html: line-height 19px is no line height step (.type)',
          'case.html: font-size 1px is no type size step (.one)',
          'case.html: line-height 1px is no line height step (.one)',
          'case.html: border-top-left-radius 3px is no radius step (.corner)',
          'case.html: padding 0.5rem is no space step (.units)',
          'case.html: gap 0.7em is no space step (.units)',
          'case.html: font-size 0.93rem is no type size step (.units)',
          'case.html: margin-bottom -17px is no space step (.panel)',
          'case.html: padding 6px is no space step (.outer)',
          'case.html: margin 6px is no space step (p[style])',
          'case.html: padding var(--hairline) is 1px, no space step (.other)',
          'case.html: border-radius var(--hairline) is 1px, no radius step (.other)',
          'case.html: font-size var(--s-2) is 8px, no type size step (.other)',
        ],
      ),
    SLOW,
  );

  it.live(
    'passes a step, a token, a zero and a dot centred on its size',
    () =>
      planted(
        `.a { padding: 0 var(--s-2) 8px; gap: var(--hairline); margin-top: var(--hairline); }
       .b { font: var(--w-3) var(--fs-2) / var(--lh-2) var(--font); border-radius: var(--r-2); }
       .c { font-size: var(--body-fs); padding: var(--gutter); --step: var(--s-2); margin: var(--step); }
       .dot { --dot: 34px; width: var(--dot); margin: calc(var(--dot) / -2) 0 0 calc(var(--dot) / -2); }
       .wipe { --divider: 2px; width: var(--divider); margin-left: calc(var(--divider) / -2); }
       .wipe::after { --dot: 20px; content: ''; width: var(--dot); margin: calc(var(--dot) / -2) 0 0 calc(var(--dot) / -2); }
       .lanes { --cue-names: 72px; padding-left: var(--cue-names); }
       .centred { margin-block: calc((var(--panel-head-h) - var(--hit)) / 2); }`,
        `<p class="a">a</p><p class="b">b</p><p class="c">c</p><i class="dot"></i>
       <div class="wipe"></div><div class="lanes">l</div><p class="centred">c</p>`,
        [],
      ),
    SLOW,
  );

  it.live(
    'reads a length a script sets, a calc of lengths as the one length it computes, and the lengths written in a sum of tokens',
    () =>
      planted(
        `.four { padding: calc(2px * 2); } .six { padding: calc(2px * 3); }
         .loc4 { --pad: calc(2px * 2); padding: var(--pad); } .loc6 { --pad: calc(3px * 2); padding: var(--pad); }
         .sum { font: 12px/calc(var(--lh-2) + 3px) monospace; }
         .half { --half: calc(var(--s-1) + 2px); padding: var(--half); }
         .pc { padding-left: calc(100% - 7px); gap: min(100%, 7px); } .vw { margin-top: calc(50vw - 8px); margin-bottom: calc(50vw - 7px); }
         @keyframes slide { from { padding: 6px; } }`,
        `<p class="four">a</p><p class="six">b</p><p class="loc4">c</p><p class="loc6">d</p><p class="sum">e</p><p class="half">f</p>
         <p class="pc">g</p><p class="vw">h</p>
         <script>document.body.style.gap = '7px'; document.body.style.setProperty('padding-top', '8px');</script>`,
        [
          'case.html: padding 6px is no space step (.six)',
          'case.html: line-height 3px is no line height step (.sum)',
          // A function with a percentage or a viewport's length computes no length of its own:
          // the px written in it are read, once (`calc(50vw - 8px)`'s 8px, a step at every width).
          'case.html: gap 7px is no space step (.pc)',
          'case.html: padding-left 7px is no space step (.pc)',
          'case.html: margin-bottom 7px is no space step (.vw)',
          'case.html: padding 6px is no space step (@keyframes slide 0%)',
          'case.html: gap 7px is no space step (body[style])',
          'case.html: padding var(--pad) is 6px, no space step (.loc6)',
          // So is a sum that computes with a token, a composition (a hit area centred, a bar
          // cleared): the lengths written in it are read, never the sum.
          'case.html: padding var(--half) is 2px, no space step (.half)',
        ],
      ),
    SLOW,
  );

  it.live(
    'names a local the element that reads it is given off the scale, whatever shape the rule that gives it has',
    () =>
      planted(
        `.n1 { --pad: 8px; & .n1b { padding: var(--pad); } } .n1b.big { --pad: 6px; }
         .n2 { --pad: 8px; & .n2b { padding: var(--pad); } } @media (max-width: 600px) { .n2 .n2b { --pad: 6px; } }
         .n3 { --pad: 8px; & .n3b { padding: var(--pad); @media (max-width: 600px) { --pad: 6px; } } }
         .n4 { --pad: 8px; & .n4b { padding: var(--pad); } } .n4.wide { --pad: 6px; }
         .is1 { --pad: 8px; padding: var(--pad); } :is(.is1, .x) { --pad: 6px; }
         .t1 { --pad: 8px; padding: var(--pad); } div.t1 { --pad: 6px; }
         .t2 { --pad: 8px; padding: var(--pad); } .big.t2 { --pad: 6px; }
         .l1, .l2 { --pad: 8px; padding: var(--pad); } .l2.big { --pad: 6px; }
         .ctx { --pad: 8px; padding: var(--pad); .dark & { --pad: 6px; } }
         .q1 { --pad: 8px; padding: var(--pad); } @media (max-width: 600px) { .q1 { --pad: 6px; } }
         .w1 { --pad: 8px; padding: var(--pad); &.wide { --pad: 6px; } }
         .al1 { --b: 8px; & .al1c { --b: 6px; --a: var(--b); padding: var(--a); } }
         .ps { --pad: 8px; } .ps::before { --pad: 6px; content: 'x'; padding: var(--pad); }
         @media (max-width: 600px) { .lose { --pad: 8px; } } .lose { --pad: 6px; padding: var(--pad); }
         .c1 { --gap: 6px; } .c2 { --gap: 8px; } .e1 { gap: var(--gap); }
         .memo { --x: var(--y); --x: 6px; --y: var(--x); padding: var(--x) var(--y); }
         .wide2 { --pad: 8px; padding: var(--pad); } @media (min-width: 1600px) { .wide2 { --pad: 6px; } }
         .k { --p2: 8px; } @media (min-width: 900px) { .k { --p2: 6px; } } .l { padding: var(--p2); }
         .m { --q: 6px; padding: var(--q); } .n { --q: 8px; }`,
        `<div class="n1"><p class="n1b big">.</p></div><div class="n2"><p class="n2b">.</p></div>
         <div class="n3"><p class="n3b">.</p></div><div class="n4 wide"><p class="n4b">.</p></div>
         <p class="is1">.</p><div class="t1">.</div><p class="t2 big">.</p>
         <p class="l1">.</p><p class="l2 big">.</p><div class="dark"><p class="ctx">.</p></div>
         <p class="q1">.</p><p class="w1 wide">.</p><div class="al1"><p class="al1c">.</p></div>
         <p class="ps">.</p><p class="lose">.</p>
         <div class="c1"><i class="e1">.</i></div><div class="c2"><i class="e1">.</i></div><p class="memo">.</p><p class="wide2">.</p>
         <div class="k"><p class="l">.</p></div><p class="m">.</p><p class="n">.</p>`,
        [
          // At 1440 px wide.
          'case.html: padding var(--pad) is 6px, no space step (& .n1b)',
          'case.html: padding var(--pad) is 6px, no space step (& .n4b)',
          'case.html: padding var(--pad) is 6px, no space step (.is1)',
          'case.html: padding var(--pad) is 6px, no space step (.t1)',
          'case.html: padding var(--pad) is 6px, no space step (.t2)',
          'case.html: padding var(--pad) is 6px, no space step (.l1, .l2)',
          'case.html: padding var(--pad) is 6px, no space step (.ctx)',
          'case.html: padding var(--pad) is 6px, no space step (.w1)',
          'case.html: padding var(--a) is 6px, no space step (& .al1c)',
          'case.html: padding var(--pad) is 6px, no space step (.ps::before)',
          'case.html: padding var(--pad) is 6px, no space step (.lose)',
          'case.html: gap var(--gap) is 6px, no space step (.e1)',
          'case.html: padding var(--x) is 6px, no space step (.memo)',
          'case.html: padding var(--y) is 6px, no space step (.memo)',
          'case.html: padding var(--p2) is 6px, no space step (.l)',
          'case.html: padding var(--q) is 6px, no space step (.m)',
          // The queries' own, 600 px wide and under.
          'case.html: padding var(--pad) is 6px, no space step (& .n2b)',
          'case.html: padding var(--pad) is 6px, no space step (& .n3b)',
          'case.html: padding var(--pad) is 6px, no space step (.q1)',
          // 1600 px wide and over.
          'case.html: padding var(--pad) is 6px, no space step (.wide2)',
        ],
      ),
    SLOW,
  );

  it.live(
    "passes a local the element that reads it is given on the scale: another element's own, a losing rule's, an alias resolved where it is given",
    () =>
      planted(
        `.ps2 { --pad: 8px; padding: var(--pad); } .ps2::before { --pad: 3px; content: 'x'; left: var(--pad); }
         .card .title { --pad: 8px; padding: var(--pad); } .toast .title { --pad: 5px; height: var(--pad); }
         .a3 { --pad: 8px; padding: var(--pad); } .a3 .b3 { --pad: 6px; width: var(--pad); }
         .m3a { --pad: 8px; padding: var(--pad); } .m3b { --pad: 6px; width: var(--pad); }
         .a4 { --pad: 8px; padding: var(--pad); } .a4-b { --pad: 6px; } .a4b { --pad: 6px; }
         .a5 { --pad: 8px; padding: var(--pad); } :where(.a5) { --pad: 6px; }
         .a8 { --b: var(--s-2); --a: var(--b); & .c8 { padding: var(--a); } }
         .card2 > .t9 { --pad: 8px; padding: var(--pad); } .toast2:not(.card2) > .t9 { --pad: 5px; height: var(--pad); }
         .a10:not(.x, .y) { --pad: 8px; padding: var(--pad); } .b10:not(.a10, .y) { --pad: 5px; width: var(--pad); }
         .a11[data-k~="x"] { --pad: 8px; padding: var(--pad); } .b11[data-k~="a"] { --pad: 5px; width: var(--pad); }
         :root { --rpad: 8px; } .m4 { padding: var(--rpad); } .m4card { --rpad: 6px; width: var(--rpad); }
         .k2 { --b: 8px; --a: var(--b); & .k2c { --b: 6px; padding: var(--a); } }
         .f1 { --m: 8px; .g1 { margin: var(--m); } } .f2 { --m: 6px; width: var(--m); }
         @media (min-width: 900px) { .h1 { --p: 6px; } } .i1 { --p: 8px; padding: var(--p); }
         @media (max-width: 600px) { .lose2 { --pad: 6px; } } .lose2 { --pad: 8px; padding: var(--pad); }`,
        `<p class="ps2">.</p><div class="card"><p class="title">.</p></div><div class="toast"><p class="title">.</p></div>
         <div class="a3"><i class="b3">.</i></div><p class="a4">.</p><p class="a4-b">.</p><p class="a4b">.</p>
         <p class="a5">.</p><div class="a8"><p class="c8">.</p></div>
         <div class="card2"><p class="t9">.</p></div><div class="toast2"><p class="t9">.</p></div>
         <p class="a10">.</p><p class="b10">.</p><p class="a11" data-k="x">.</p><p class="b11" data-k="a">.</p>
         <p class="m4">.</p><p class="m4card">.</p><div class="k2"><p class="k2c">.</p></div>
         <div class="f1"><p class="g1">.</p></div><p class="f2">.</p><p class="h1">.</p><p class="i1">.</p>
         <p class="lose2">.</p><p class="m3a">.</p><p class="m3b">.</p>`,
        [],
      ),
    SLOW,
  );

  it.live(
    'takes the dock whole in a padding and the hairline in a gap or a margin, through a local too; nowhere else',
    () =>
      planted(
        `.d1 { padding: 0 0 var(--dock-h); } .d2 { padding-block-end: var(--dock-h); }
         .d3 { padding-bottom: calc(var(--dock-h) + var(--s-3)); } .d5 { --clear: var(--dock-h); padding-bottom: var(--clear); }
         .d4 { bottom: var(--dock-h); inset: auto 0 var(--dock-h) 0; min-height: var(--dock-h); height: var(--dock-h); }
         .h1 { --rule-w: var(--hairline); margin-top: var(--rule-w); gap: var(--hairline); }
         .d6 { gap: var(--dock-h); } .d7 { margin-bottom: var(--dock-h); } .d8 { font-size: var(--dock-h); border-radius: var(--dock-h); }
         .h2 { --rule-w: var(--hairline); padding: var(--rule-w); } .t3 { --pad: var(--fs-1); padding: var(--pad); }`,
        `<p class="d1">.</p><p class="d2">.</p><p class="d3">.</p><p class="d5">.</p><p class="d4">.</p>
         <p class="h1">.</p><p class="d6">.</p><p class="d7">.</p><p class="d8">.</p><p class="h2">.</p><p class="t3">.</p>`,
        [
          // The dock is 45 px on the desk's density (900 px wide and over), 61 px on the phone's.
          'case.html: gap var(--dock-h) is 45px, no space step (.d6)',
          'case.html: margin-bottom var(--dock-h) is 45px, no space step (.d7)',
          'case.html: border-radius var(--dock-h) is 45px, no radius step (.d8)',
          'case.html: font-size var(--dock-h) is 45px, no type size step (.d8)',
          'case.html: padding var(--rule-w) is 1px, no space step (.h2)',
          'case.html: padding var(--pad) is 10px, no space step (.t3)',
          'case.html: gap var(--dock-h) is 61px, no space step (.d6)',
          'case.html: margin-bottom var(--dock-h) is 61px, no space step (.d7)',
          'case.html: border-radius var(--dock-h) is 61px, no radius step (.d8)',
          'case.html: font-size var(--dock-h) is 61px, no type size step (.d8)',
        ],
      ),
    SLOW,
  );

  it.live(
    'names a local given or read where no element the mock shows is, and one nothing gives or that names itself',
    () =>
      planted(
        `.u1 { --pad: 8px; } .u1:hover { padding: var(--pad); } .nobody { padding: var(--pad); }
         .u2:hover { --pad: 6px; } .gone { margin: var(--nowhere); } .self { --own: var(--own); padding: var(--own); }`,
        '<p class="u1 u2">.</p><p class="gone">.</p><p class="self">.</p>',
        [
          'case.html: margin var(--nowhere) is no token, and no length the mock gives (.gone)',
          'case.html: padding var(--own) is no token, and no length the mock gives (.self)',
          'case.html: padding var(--pad) is read on no element the mock shows (.u1:hover)',
          'case.html: padding var(--pad) is read on no element the mock shows (.nobody)',
          'case.html: --pad is given on no element the mock shows (.u2:hover)',
        ],
      ),
    SLOW,
  );

  it.live(
    'reads each selector of a list on its own reach, a pointer query on the pointer it names, every width a query names, and a container query on the page as laid out',
    () =>
      planted(
        `.p1 { --pad: 8px; padding: var(--pad); } .p1:hover, .p1b { --pad: 6px; }
         .p6 { --pad: 8px; padding: var(--pad); } @media (pointer: coarse) { .p6 { --pad: var(--s-3); } }
         .p7 { --pad: 8px; padding: var(--pad); } @media (pointer: coarse) { .p7 { --pad: 6px; } }
         .r1 { --pad: 8px; padding: var(--pad); } @media (width >= 1700px) { .r1 { --pad: 6px; } }
         .r2 { --pad: 8px; padding: var(--pad); } @media (max-width: 30em) { .r2 { --pad: 6px; } }
         .r3 { --pad: 8px; padding: var(--pad); } @media (500px <= width <= 700px) { .r3 { --pad: 6px; } }
         .p9box { container-type: inline-size; width: calc(var(--s-1) * 50); }
         .p9 { --pad: 8px; padding: var(--pad); } @container (max-width: 300px) { .p9 { --pad: 6px; } }
         .p10box { container-type: inline-size; width: calc(var(--s-1) * 100); }
         .p10 { --pad: 8px; padding: var(--pad); } @container (max-width: 300px) { .p10 { --pad: 6px; } }`,
        `<p class="p1">.</p><p class="p1b">.</p><p class="p6">.</p><p class="p7">.</p>
         <p class="r1">.</p><p class="r2">.</p><p class="r3">.</p>
         <div class="p9box"><p class="p9">.</p></div><div class="p10box"><p class="p10">.</p></div>`,
        [
          // The desk's, then the phone's.
          'case.html: padding var(--pad) is 6px, no space step (.p9)',
          'case.html: padding var(--pad) is 6px, no space step (.r2)',
          'case.html: padding var(--pad) is 6px, no space step (.r3)',
          'case.html: padding var(--pad) is 6px, no space step (.r1)',
          'case.html: padding var(--pad) is 6px, no space step (.p7)',
          // A selector no element matches on either pointer, at any width.
          'case.html: --pad is given on no element the mock shows (.p1:hover)',
          'case.html: --pad is given on no element the mock shows (.p10)',
        ],
      ),
    SLOW,
  );

  it.live(
    "names a shared sheet's selector no mock reaches, and passes one some mock reaches",
    () =>
      Effect.gen(function* () {
        const shared = '/planted/shared.css';
        const head = `${wears}<link rel="stylesheet" href="${shared}">`;
        const sheet =
          '.only-a { --pad: 8px; padding: var(--pad); } .only-b, .nowhere { --gap: 8px; gap: var(--gap); }';
        const pages = {
          [shared]: sheet,
          '/a.html': pageOf('', '<p class="only-a">.</p>', head),
          '/b.html': pageOf('', '<p class="only-b">.</p>', head),
        };
        const unreached = yield* sharedUnreached([
          { file: 'a.html', path: '/a.html', pages },
          { file: 'b.html', path: '/b.html', pages },
        ]);
        expect(unreached).toEqual([
          'shared.css: --gap is given on no element any mock shows (.nowhere)',
          'shared.css: gap var(--gap) is read on no element any mock shows (.nowhere)',
        ]);
      }),
    SLOW,
  );
});

describe("the mocks' shared sheets", () => {
  it.live(
    'reach each selector that gives or reads a local on some mock',
    () =>
      Effect.gen(function* () {
        const unreached = yield* sharedUnreached(
          MOCK_PAGES.map((file) => ({ file, path: `${MOCKS}/${file}`, pages: {} })),
        );
        expect(unreached).toEqual([]);
      }),
    60_000,
  );
});
