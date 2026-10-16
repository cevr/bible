// Every place in the lab's sources that moves the focus from script is a named
// site (`FOCUS_SITES`), with the paths that reach it: a command's, run from ⌘K
// by `e2e/lab/focus-follows-input.dom.test.ts`, or one of that file's cases
// below its command walk, each by the keyboard and by the pointer. A source
// scan fails on a place not named here, so a new focus move is never missed
// by the e2e's property over the ring; it reads the sources only, so the gate
// runs it. A place is a call (`.focus(`, the lab's `focusFor`, or a wrapper
// of it that moves the focus for its caller: `focusPoint`, `focusVariant`,
// `goToPoint`), or a kit popup's `initialFocus` or `finalFocus`, which the
// kit focuses when the popup opens or closes. A popup's `() => false` moves
// nothing (the kit leaves the focus where it is) and is no site. A popup with
// neither prop takes the kit's default, which focuses it on open; the scan
// cannot see that default, so those popups are the e2e walk's alone.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { expect, it } from 'effect-bun-test';

/**
 * Every place in the lab's sources that moves the focus from script, by its file and its
 * callee with its first argument (a file's two alike are two rows), with the paths that
 * reach it. The lab's helpers that move it for a caller (`focusPoint`, `focusVariant`,
 * `goToPoint`) are calls too, so each caller is a row of its own; so is a popup that
 * hands the kit an element or `true` (its first focusable, or the lab sheet itself).
 */
const FOCUS_SITES: ReadonlyArray<readonly [file: string, call: string, reached: string]> = [
  [
    'ask/parts.tsx',
    'focusFor(target',
    "an ask's goTo: its index's entry and its Send with a question open, pressed and clicked below",
  ],
  [
    'notes/section.tsx',
    'focusFor(el',
    "the Lab in Note's notes.frame, and the Script's script.note below, a text field",
  ],
  [
    'notes/section.tsx',
    'focusFor(el',
    "the Script's script.correct below, on the words to say instead, a text field",
  ],
  [
    'notes/section.tsx',
    'focusFor(field',
    'a Save that found the words to say instead wanting, pressed and clicked below, a text field',
  ],
  [
    'review/options/choice.tsx',
    'focusFor(Option.getOrElse',
    'focusPoint, for each of its callers below',
  ],
  ['review/options/context.tsx', 'focusFor(button', 'focusVariant, for the auditions'],
  ['review/options/context.tsx', 'focusVariant(next', "Choices' review.audition-*, from ⌘K"],
  [
    'review/options/section.tsx',
    'focusPoint(point',
    'a page opened on a point; Back and Forward, by a key and by none',
  ],
  ['review/options/section.tsx', 'focusPoint(point', "goToPoint: Choices' go.choice.*"],
  [
    'review/options/section.tsx',
    'goToPoint(point',
    "a kind's tab, clicked, pressed, and clicked with a key down",
  ],
  [
    'review/production.tsx',
    'focusFor(field',
    "a Production's Move forward, its form opened: its first field",
  ],
  [
    'sketch/surface.tsx',
    'focusFor(el',
    "the Board's text tool: a text placed on the panel, its field",
  ],
  ['studio/section.tsx', 'focusFor(r', 'a studio control the keyboard pressed away'],
  [
    'studio/section.tsx',
    'focusFor(r',
    'a kept take’s reload, by the keyboard and the pointer; a reload after a click',
  ],
  [
    'studio/section.tsx',
    'focusFor(r',
    'a studio button, and the prompter, pressed after the keyboard',
  ],
  ['studio/section.tsx', 'focusFor(r', 'Keep pressed, disabled under the focus'],
  [
    'sheet.tsx',
    'initialFocus={() => Match.value',
    "the lab sheet's popup: the sheet itself for a caller's `true`, else the element its caller hands it (the two rows below)",
  ],
  [
    'review/inspector.tsx',
    'initialFocus={() => Option.getOrElse',
    "an inspector opened by its row's Inspect (the sheet: sheet-focus.dom.test.ts), or by its comment count (its comment field, a text field)",
  ],
  [
    'review/options/findings.tsx',
    'initialFocus={() => true',
    "Findings opened from ⌘K or the page's menu (the sheet: sheet-focus.dom.test.ts)",
  ],
];

/** A call that moves the focus: `.focus(`, or the lab's helper or one of its wrappers, with its first argument. */
const FOCUS_CALL = /(\.focus|\b(?:focusFor|focusPoint|focusVariant|goToPoint))\s*\(\s*([\w.]*)/g;

/**
 * A kit popup's own focus move, with the first word its function answers; `() => false`
 * moves nothing and is left out.
 */
const POPUP_FOCUS = /\b(initialFocus|finalFocus)=\{\s*\(\)\s*=>(?!\s*false\s*\})\s*\(?\s*([\w.]*)/g;

/** The file that owns the lab's focus moves: it moves the focus for every site. */
const HELPER = 'focus.ts';

/** Every place in the lab's sources (tests and fixtures aside) that moves the focus, as `file call`. */
const focusSites = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = import.meta.dir;
  const sources = (yield* fs.readDirectory(root, { recursive: true })).filter(
    (f) => /\.tsx?$/.test(f) && f !== HELPER && !/(^|\/)fixtures\/|\.test\.tsx?$/.test(f),
  );
  const sites = yield* Effect.forEach(sources, (file) =>
    Effect.map(fs.readFileString(path.join(root, file)), (source) => [
      ...[...source.matchAll(FOCUS_CALL)].map(([, callee, first]) => `${file} ${callee}(${first}`),
      ...[...source.matchAll(POPUP_FOCUS)].map(
        ([, attr, first]) => `${file} ${attr}={() => ${first}`,
      ),
    ]),
  );
  return sites.flat().toSorted();
});

it.effect.layer(BunServices.layer)(
  'every place in the lab that moves the focus is a named site, with its paths',
  () =>
    Effect.map(focusSites, (sites) =>
      expect(sites).toEqual(FOCUS_SITES.map(([file, call]) => `${file} ${call}`).toSorted()),
    ),
);
