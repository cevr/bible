// Every target stands where the UI faces put it, within 1 px, while their
// files have not landed, on both devices: each page is served as the lab
// renders it with those files held, measured, then measured again once they
// land; each face's fallback (`--font`'s for Geist, `--font-mono`'s for Geist
// Mono, `tokens.css`) is matched to its advance and height.

import { Deferred, Effect, Exit } from 'effect';
import { describe, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { type FakeRoute, type Viewport, openServed } from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import { studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { targetBoxes } from '../../src/lab/fixtures/touch-targets.ts';
import { CHOICES, CHOICES_READY, DEVICES, SLOW } from './studio-states.ts';

/**
 * How far, in CSS px, the face-fallback check lets a target's edge or size move as the face
 * lands: half a pixel, the most an edge moves without its painted edge
 * jumping a whole pixel. Geist Mono's fallbacks hold it (0.00 px). Geist's
 * does not: a proportional face's letters differ from its fallback's one by
 * one, which no size-adjust matches, so a label moves by a median 0.6 to
 * 1.4 px by weight, and a row of tabs sums its labels' drift (7.07 px at
 * most, measured 2026-10-16).
 */
const SHIFT_PX = 0.5;

/**
 * How far, in CSS px, a 60-character line in a face's token may change: 1 px
 * over 60 characters, so a label of 30 or fewer drifts under `SHIFT_PX`.
 * `--font-mono`'s lines hold it (0.00 px); `--font`'s change by 2.47 to
 * 6.05 px, their heights by none (measured 2026-10-16).
 */
const LINE_PX = 1;

/** The UI faces' families: Geist, which `--font` names first, and Geist Mono, which `--font-mono` does. */
const FAMILIES = ['Geist', 'Geist Mono'];

/** Face `family`'s files in the page's fonts: the head's, and those its script registers. */
const filesOf = (family: string) =>
  `[...document.fonts].filter((f) => f.family.replaceAll('"', '') === '${family}')`;

/** The UI faces' files in the page's fonts. */
const UI_FACES = `[${FAMILIES.map((family) => `...${filesOf(family)}`).join(', ')}]`;

/**
 * The page as it is laid out now, as a script reads it: how many of the UI
 * faces' files are on the page and how many have loaded, each target's box
 * (`targetBoxes`), the width of a line named in each face alone (another
 * face's while its file has not landed), and each of the chrome's sizes and
 * weights' 60-character line in each face's token: a line as long as a page's
 * longest label, so a fallback a hair off its face's advance or height shows
 * where a short label hides it. The mono face is measured at the timecode's
 * size too.
 */
const LAID_OUT = `(() => {
  const ui = ${UI_FACES};
  const tokens = getComputedStyle(document.documentElement);
  const sizes = { '--font': ['--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5'], '--font-mono': ['--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5', '--fs-tc'] };
  const weights = ['--w-1', '--w-2', '--w-clip', '--w-3'];
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
      Object.entries(sizes).flatMap(([face, faceSizes]) =>
        faceSizes.flatMap((size) =>
          weights.map((weight) => [
            face + ' ' + size + ' ' + weight,
            measured(tokens.getPropertyValue(weight) + ' ' + tokens.getPropertyValue(size) + ' ' + tokens.getPropertyValue(face)),
          ]),
        ),
      ),
    );
  return {
    faces: ui.length,
    loaded: ui.filter((f) => f.status === 'loaded').length,
    boxes: ${targetBoxes('exact')},
    lines: lines(),
    alone: [${FAMILIES.map((family) => `measured('12px "${family}", serif')[0]`).join(', ')}],
  };
})()`;

/** The page laid out while the UI faces' files are held (`LAID_OUT`), kept on the page; what it says of them. */
const HELD = `(() => { window.__held = ${LAID_OUT}; return [window.__held.faces > 0, window.__held.loaded]; })()`;

/** The UI faces landed: the page's fonts settled and a file of each face (its latin, the chrome's) loaded. */
const LANDED = `document.fonts.status === 'loaded' && ${FAMILIES.map(
  (family) => `${filesOf(family)}.some((f) => f.status === 'loaded')`,
).join(' && ')}`;

/**
 * The page laid out once the UI faces have landed, against how it stood
 * held (`HELD`): whether each line named in a face alone changed (so the
 * page was laid out without it, then with it), each target whose edge or
 * size moved more than `SHIFT_PX`, as `target: held → landed`, and each
 * line in a face's token more than `LINE_PX` longer or taller. Every box is
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
    ...held.alone.map((width, i) => 'laid out without face ' + i + ' ' + (width !== landed.alone[i])),
    ...moved.map((key) => key + ': ' + box(held.boxes[key]) + ' → ' + box(landed.boxes[key])),
    ...off.map((key) => 'a line at ' + key + ': ' + box(held.lines[key]) + ' → ' + box(landed.lines[key])),
  ];
})()`;

/**
 * A page as the lab serves it, rendered on the server with the words face's
 * file in its head, every UI face file held until `faceHeld` is done; once
 * each of `ready` shows.
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
  describe(`the UI faces' fallbacks on ${device.name} (G10)`, () => {
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
      ['Choices', servedHeld('review', studioRoutes, CHOICES, ...CHOICES_READY)],
    ] as const;
    for (const [name, open] of PAGES) {
      it.live(
        `${name}: every target stands where it does once the faces land, within 1 px, laid out while their files are held`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const page = yield* open(device.viewport, faceHeld);
            // Held: the faces are on the page, none of their files loaded; every target measured.
            yield* evaluates(page, HELD, [true, 0]);
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, LANDED);
            yield* evaluates(
              page,
              SWAPPED,
              FAMILIES.map((_, i) => `laid out without face ${i} true`),
            );
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}
