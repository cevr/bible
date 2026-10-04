// Every studio page on a phone (390 × 844, a coarse pointer): each shown
// control a finger can operate (`TARGETS`: buttons, links, summaries,
// fields, sliders, anything focusable) has a hit area of 44 × 44 px at least
// (`HIT`, the design language's `--hit` on the phone: "every touch target
// on the phone ≥ 44 px through padding"). The area is what a tap reaches
// (`undersizedTargets`, `fixtures/touch-targets.ts`): padding and a
// pseudo-element hit-slop count, a covered part does not. A failure names
// each target under it, with the width and height a finger meets.
//
// The exceptions are principles, the same on every page:
// - an element out of the accessibility tree and the tab order (a number
//   field's hidden form input) is not a target; its visible field is;
// - Inline (WCAG 2.5.8): a link in a sentence takes the line's size;
// - Spacing (WCAG 2.5.8, at 44 px): a target 24 px each way or more whose
//   44 px circle touches no other target cannot be missed for a neighbour.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { type Viewport, openLab, openPlayer, openReview } from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { HIT, undersizedTargets } from '../../src/lab/fixtures/touch-targets.ts';

const SLOW = 30_000;

/** A phone held upright, its pointer a finger. */
const PHONE: Viewport = { width: 390, height: 844, coarse: true };

/** Every shown target on the page is a finger's size, or kept by a principle; else each one under it is named. */
const fingerSized = (page: Tab) =>
  page.until(`${undersizedTargets}.length === 0`, {
    now: undersizedTargets,
    say: (now) => `targets under ${HIT} × ${HIT} px on a phone (what a finger meets): ${now}`,
  });

/** A review page at `href` on the phone, once `ready` shows. */
const review = (href: string, ready: string) =>
  Effect.gen(function* () {
    const { page } = yield* openReview(studioRoutes, { href, viewport: PHONE });
    yield* waitFor(page, ready);
    yield* fingerSized(page);
  }).pipe(Effect.scoped);

describe('touch targets on a phone', () => {
  it.live('Films', () => review(pageHref.home(), '.rv-main a[href]'), SLOW);

  it.live(
    'Choices',
    () => review(pageHref.choices(STUDIO_FILM), '.rv-knob input[type="range"]'),
    SLOW,
  );

  it.live('Project', () => review(pageHref.project(STUDIO_FILM), '[data-compare]'), SLOW);

  it.live('a Set', () => review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video'), SLOW);

  it.live(
    'Lab',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { viewport: PHONE });
        yield* fingerSized(page);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Scenes',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: PHONE },
          '.lookbook-sheet canvas',
        );
        yield* fingerSized(page);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Play',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: PHONE },
          '.bar .tc',
        );
        yield* fingerSized(page);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
