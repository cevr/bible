// Every target stands where the UI face puts it, within 1 px, while the
// face's file has not landed, on both devices: each page is served as the lab
// renders it with that file held, measured, then measured again once it
// lands; the fallback (`--font`, `tokens.css`) is matched to its advance and
// height.

import { Deferred, Effect, Exit } from 'effect';
import { describe, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { type FakeRoute, type Viewport, openServed } from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import { studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { targetBoxes } from '../../src/lab/fixtures/touch-targets.ts';
import { SLOW, DEVICES, PROJECT, PROJECT_READY, STILL } from './studio-states.ts';

/**
 * How far, in CSS px, the face-fallback check lets a target's edge or size move as the face
 * lands: half a pixel, the most an edge moves without its painted edge
 * jumping a whole pixel, the sub-pixel drift a metric-matched fallback
 * leaves (0.25 px at most across the four pages, on both devices).
 */
const SHIFT_PX = 0.5;

/**
 * How far, in CSS px, a 60-character line in `--font` may change: 1 px over
 * 60 characters, so a label of 30 or fewer drifts under `SHIFT_PX` (0.73 px
 * at most measured, at the largest sizes).
 */
const LINE_PX = 1;

/** The UI face's files in the page's fonts: the head's, and those its script registers. */
const UI_FACES = `[...document.fonts].filter((f) => f.family.replaceAll('"', '') === 'JetBrains Mono')`;

/**
 * The page as it is laid out now, as a script reads it: how many of the UI
 * face's files are on the page and how many have loaded, each target's box
 * (`targetBoxes`), the width of a line named in the UI face alone (another
 * face's while its file has not landed), and each of the chrome's sizes and
 * weights' 60-character line in `--font`: a line as long as a page's longest
 * label, so a fallback a hair off the UI face's advance or height shows where
 * a short label hides it.
 */
const LAID_OUT = `(() => {
  const ui = ${UI_FACES};
  const tokens = getComputedStyle(document.documentElement);
  const sizes = ['--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5'];
  const weights = ['--w-1', '--w-2', '--w-3'];
  const measured = (font) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:pre;line-height:normal;font:' + font;
    probe.textContent = 'Record the frame 00:00:12:04 · Compare with last commit ⌘K';
    document.body.append(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return [r.width, r.height];
  };
  const lines = () =>
    Object.fromEntries(
      sizes.flatMap((size) =>
        weights.map((weight) => [
          size + ' ' + weight,
          measured(tokens.getPropertyValue(weight) + ' ' + tokens.getPropertyValue(size) + ' ' + tokens.getPropertyValue('--font')),
        ]),
      ),
    );
  return {
    faces: ui.length,
    loaded: ui.filter((f) => f.status === 'loaded').length,
    boxes: ${targetBoxes('exact')},
    lines: lines(),
    alone: measured('12px "JetBrains Mono", serif')[0],
  };
})()`;

/** The page laid out while the UI face's files are held (`LAID_OUT`), kept on the page; what it says of them. */
const HELD = `(() => { window.__held = ${LAID_OUT}; return [window.__held.faces > 0, window.__held.loaded]; })()`;

/** The UI face landed: the page's fonts settled and its latin file (the chrome's) loaded. */
const LANDED = `document.fonts.status === 'loaded' && ${UI_FACES}.some((f) => f.status === 'loaded')`;

/**
 * The page laid out once the UI face has landed, against how it stood
 * held (`HELD`): whether the line named in the face alone changed (so the
 * page was laid out without it, then with it), each target whose edge or
 * size moved more than `SHIFT_PX`, as `target: held → landed`, and each
 * line in `--font` more than `LINE_PX` longer or taller. Every box is
 * compared as the layout has it (`targetBoxes('exact')`), rounded only to
 * be read in a failure.
 */
const SWAPPED = `(() => {
  const held = window.__held;
  const landed = ${LAID_OUT};
  const keys = [...new Set([...Object.keys(held.boxes), ...Object.keys(landed.boxes)])];
  const moved = keys.filter((key) => {
    const a = held.boxes[key] ?? [];
    const b = landed.boxes[key] ?? [];
    return a.length !== 4 || b.length !== 4 || a.some((v, i) => Math.abs(v - b[i]) > ${SHIFT_PX});
  });
  const off = Object.keys(held.lines).filter((key) =>
    held.lines[key].some((v, i) => Math.abs(v - landed.lines[key][i]) > ${LINE_PX}),
  );
  const box = (r) => (r ?? []).map((v) => v.toFixed(2)).join(',') || 'none';
  return [
    'laid out without it ' + (held.alone !== landed.alone),
    ...moved.map((key) => key + ': ' + box(held.boxes[key]) + ' → ' + box(landed.boxes[key])),
    ...off.map((key) => 'a line at ' + key + ': ' + box(held.lines[key]) + ' → ' + box(landed.lines[key])),
  ];
})()`;

/**
 * A page as the lab serves it, rendered on the server with the UI face's
 * file in its head, that file held until `faceHeld` is done; once each of
 * `ready` shows.
 */
const servedHeld =
  (
    name: 'lab' | 'player' | 'review',
    routes: ReadonlyArray<FakeRoute>,
    href: string,
    ...ready: ReadonlyArray<string>
  ) =>
  (viewport: Viewport, faceHeld: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      // The page's load waits for the head's face: the open waits for it to mount.
      const { page } = yield* openServed(name, routes, {
        href,
        viewport,
        mountedOnly: true,
        faceHeld,
      });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

for (const device of DEVICES) {
  describe(`the UI face's fallback on ${device.name} (G10)`, () => {
    const PAGES = [
      // At rest once the scene's source is read: its knob fields writable, their titles their own.
      [
        'Lab',
        servedHeld(
          'lab',
          [],
          pageHref.lab(PROBE),
          '.lab-panel[data-staged="true"]',
          '.lab-knob input[data-field="x"]:not([disabled])',
        ),
      ],
      ['Play', servedHeld('player', [], pageHref.play(PROBE), '.bar [data-act="play"]')],
      ['Scenes', servedHeld('player', [], pageHref.scenes(PROBE), STILL)],
      ['Project', servedHeld('review', studioRoutes, PROJECT, ...PROJECT_READY)],
    ] as const;
    for (const [name, open] of PAGES) {
      it.live(
        `${name}: every target stands where it does once the face lands, within 1 px, laid out while its file is held`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const page = yield* open(device.viewport, faceHeld);
            // Held: the face is on the page, none of its files loaded; every target measured.
            yield* evaluates(page, HELD, [true, 0]);
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, LANDED);
            yield* evaluates(page, SWAPPED, ['laid out without it true']);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}
