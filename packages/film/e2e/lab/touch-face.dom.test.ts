// What the owner sees while the UI faces load, on both devices: nothing
// he can see moves when they land. Each page is served as the lab renders
// it, every UI face file held until the case lets it go. While they are
// held the page's root paints nothing (`faceHold`, `face.ts`): its
// visibility is hidden, and the pixels of a label's box are the page's
// background. Once they land, the first frame the root paints is set in
// Geist and Geist Mono, and every target stands where that frame put it.
// Layout is read at the moment the root is shown and again once the fonts
// have settled and two frames have painted, not while the files are held:
// under `block` the browser lays held text out in a fallback and only skips
// drawing it, so a held layout is one no one sees, and what must not move is
// what the first painted frame drew. Held past the cap (`faceHold`'s `capMs`), the
// root shows in the fallbacks, and the page says so once (`[lab] fonts.late`).

import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { PAGE_ROOT } from '../../src/core/page-render.ts';
import { openServed } from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, until } from '../../src/lab/fixtures/settled.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { targetBoxes } from '../../src/lab/fixtures/touch-targets.ts';
import { faceHold } from '../../src/player/face.ts';
import { DEVICES, SLOW } from './studio-states.ts';

/**
 * How far, in CSS px, a target's edge or size may move after the first
 * painted frame: half a pixel, the most an edge moves without its painted
 * edge jumping a whole pixel.
 */
const SHIFT_PX = 0.5;

/** The hold on the page's root, as the page server writes it: the attribute it shows the root by, its cap. */
const { shown: FACES_SHOWN, capMs: FACE_CAP_MS } = faceHold(`[${PAGE_ROOT}]`);

/** The UI faces' families: Geist, which `--font` names first, and Geist Mono, which `--font-mono` does. */
const FAMILIES = ['Geist', 'Geist Mono'];

/** Face `family`'s files in the page's fonts. */
const filesOf = (family: string) =>
  `[...document.fonts].filter((f) => f.family.replaceAll('"', '') === '${family}')`;

/** The UI faces' files in the page's fonts. */
const UI_FACES = `[${FAMILIES.map((family) => `...${filesOf(family)}`).join(', ')}]`;

/** Each UI face has a file loaded: the first paint's, its latin. */
const EACH_LOADED = FAMILIES.map(
  (family) => `${filesOf(family)}.some((f) => f.status === 'loaded')`,
).join(' && ');

/** The page's root, where its components mount. */
const ROOT = `document.querySelector('[${PAGE_ROOT}]')`;

/** The width of a line named in `family` alone, `serif` while its file has not landed. */
const ALONE = `[${FAMILIES.map(
  (family) => `(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:pre;font:12px "${family}", serif';
    probe.textContent = 'Record the frame 00:00:12:04';
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  })()`,
).join(', ')}]`;

/** The label a case looks at while the faces are held: marked by `ARM`. */
const LABEL = '[data-face-label]';

/**
 * Run once the root is in the page, while the faces are held: marks the
 * first label in the root (a button or link with words, inside the viewport)
 * as `LABEL`, keeps the line set in each face alone (`__alone`), and arms
 * the record of the first painted frame: at the moment the root is shown
 * (`FACES_SHOWN` set), before the frame it shows in paints, how it was
 * shown, whether each face had loaded, and every target's box
 * (`targetBoxes`), kept as `__first`. True once armed.
 */
const ARM = `(() => {
  if (window.__armed) return true;
  const root = ${ROOT};
  if (root === null) return false;
  const label = [...root.querySelectorAll('button, a[href]')].find((el) => {
    const r = el.getBoundingClientRect();
    return el.textContent.trim() !== '' && r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  });
  if (label === undefined) return false;
  label.setAttribute('data-face-label', '');
  const html = document.documentElement;
  window.__alone = ${ALONE};
  new MutationObserver((_, observer) => {
    if (!html.hasAttribute('${FACES_SHOWN}')) return;
    observer.disconnect();
    window.__first = {
      how: html.getAttribute('${FACES_SHOWN}'),
      loaded: ${EACH_LOADED},
      boxes: ${targetBoxes('exact')},
    };
  }).observe(html, { attributes: true, attributeFilter: ['${FACES_SHOWN}'] });
  window.__armed = true;
  return true;
})()`;

/** How the root is shown (`FACES_SHOWN`), `none` while it is not. */
const SHOWN = `(document.documentElement.getAttribute('${FACES_SHOWN}') ?? 'none')`;

/**
 * The page while the faces are held: the root's computed visibility, how
 * it is shown, whether the UI faces' files are on the page, and how many
 * have loaded.
 */
const HELD = `[getComputedStyle(${ROOT}).visibility, ${SHOWN}, ${UI_FACES}.length > 0, ${UI_FACES}.filter((f) => f.status === 'loaded').length]`;

/**
 * `then` read once the fonts have settled and two frames have painted
 * since: started once, its answer kept on the page as `__settled` (true
 * once there).
 */
const settled = (then: string) => `(() => {
  window.__settling ??= document.fonts.ready
    .then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    .then(() => { window.__settled = ${then}; });
  return window.__settled !== undefined;
})()`;

/**
 * The page once the faces have landed, against its first painted frame
 * (`__first`): how the root was shown and whether each face had loaded by
 * then, whether each line named in a face alone changed since it was held
 * (so the held page truly had no face), and each target whose edge or size
 * moved more than `SHIFT_PX` since that frame, as `target: first → now`.
 */
const AGAINST_FIRST = `(() => {
  const first = window.__first;
  const now = ${targetBoxes('exact')};
  const alone = ${ALONE};
  const keys = [...new Set([...Object.keys(first.boxes), ...Object.keys(now)])];
  const box = (r) => (r ?? []).map((v) => v.toFixed(2)).join(',') || 'none';
  return [
    'shown ' + first.how,
    'each face loaded at the first paint ' + first.loaded,
    ...window.__alone.map((width, i) => 'held without face ' + i + ' ' + (width !== alone[i])),
    ...keys
      .filter((key) => {
        const a = first.boxes[key] ?? [];
        const b = now[key] ?? [];
        return a.length !== 4 || b.length !== 4 || a.some((v, i) => Math.abs(v - b[i]) > ${SHIFT_PX});
      })
      .map((key) => key + ': ' + box(first.boxes[key]) + ' → ' + box(now[key])),
  ];
})()`;

/** What `AGAINST_FIRST` answers of a page whose first painted frame was in its faces and stood still. */
const STILL = [
  'shown in',
  'each face loaded at the first paint true',
  ...FAMILIES.map((_, i) => `held without face ${i} true`),
];

/** The page's line that its root was shown in the fallbacks. */
const LATE = `[lab] fonts.late reason=cap cap_ms=${FACE_CAP_MS}`;

for (const device of DEVICES) {
  describe(`the UI faces as they load on ${device.name} (G10)`, () => {
    const PAGES = [
      ['Studio', 'player', [], pageHref.studio(PROBE), ['.st-timeline .st-clip']],
      [
        'a Set',
        'review',
        studioRoutes,
        pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        ['.rv-main video', '[data-comments]'],
      ],
    ] as const;
    for (const [name, served, routes, href, ready] of PAGES) {
      it.live(
        `${name}: the root paints nothing while the faces are held, then first paints in them, and no target moves after`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            // The page's clock stopped from its load: the cap cannot fire while the held page is read.
            const { page } = yield* openServed(served, routes, {
              href,
              viewport: device.viewport,
              mountedOnly: true,
              faceHeld,
              clockStopped: true,
            });
            yield* until(page, ARM);
            yield* evaluates(page, HELD, ['hidden', 'none', true, 0]);
            // The label's pixels are the background, and the root was still unshown after the look.
            expect(yield* page.ink(LABEL)).toBe(0);
            yield* evaluates(page, SHOWN, 'none');
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, `window.__first !== undefined && ${EACH_LOADED}`);
            yield* page.clock.release;
            yield* until(page, settled(AGAINST_FIRST));
            yield* evaluates(page, 'window.__settled', STILL);
            for (const selector of ready) yield* page.waitFor(selector);
          }).pipe(Effect.scoped),
        SLOW,
      );

      it.live(
        `${name}: held past the cap, the root shows in the fallbacks and the page says so once`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const { page } = yield* openServed(served, routes, {
              href,
              viewport: device.viewport,
              mountedOnly: true,
              faceHeld,
            });
            yield* until(
              page,
              `document.documentElement.getAttribute('${FACES_SHOWN}') === 'late'`,
            );
            yield* evaluates(
              page,
              `[getComputedStyle(${ROOT}).visibility, ${UI_FACES}.filter((f) => f.status === 'loaded').length]`,
              ['visible', 0],
            );
            for (const selector of ready) yield* page.waitFor(selector);
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, EACH_LOADED);
            // Shown once, in the fallbacks: the faces' landing does not show it again.
            yield* until(page, settled(SHOWN));
            yield* evaluates(page, 'window.__settled', 'late');
            expect(page.logged.filter((line) => line.text.includes('[lab] fonts.late'))).toEqual([
              expect.objectContaining({ text: LATE }),
            ]);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}
