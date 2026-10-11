// The mode a link's citation shows, on the Lab as the lab serves it (the
// server renders each document, the browser hydrates it), over the probe
// film: a pasted link that cites a cue or a knob lands in Edit, whatever
// mode the viewer kept (Note, Compare, Record), as a cited note lands in
// Note and a cited beat in Record; Motion on a laptop already shows a cue's
// lane, so a link that cites one leaves it there; a mode picked after the
// link landed is the viewer's. The kept mode is the viewer's, in their
// browser: the server renders the panel without it, so each landing here is
// a served one, where the kept mode reaches the page only as it hydrates.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import {
  DESK,
  PHONE,
  type Viewport,
  labAt,
  openServed,
} from '../../../src/lab/fixtures/harness.ts';
import { attributeIs } from '../../../src/lab/fixtures/settled.ts';
import type { LabMode } from '../../../src/lab/mode.ts';

/** Long enough to bundle the server entry once, render, open, hydrate and stage the film. */
const SLOW = 60_000;

const rise = { _tag: 'Cue', scene: 'one', name: 'rise' } as const;
const spot = { _tag: 'Knob', scene: 'one', name: 'spot' } as const;

const panelIs = (page: Parameters<typeof attributeIs>[0], mode: string) =>
  attributeIs(page, '.lab-panel', 'data-mode', mode);

/** The served Lab in `viewport`, with `kept` picked on the mode tray, as the viewer kept it. */
const keeping = (kept: LabMode, viewport: Viewport = DESK) =>
  Effect.gen(function* () {
    const served = yield* openServed('lab', [], { href: labAt(1), viewport });
    yield* served.page.waitFor('.lab-panel[data-staged="true"]');
    yield* served.page.click(`.lab-modes [data-mode-pick="${kept}"]`);
    yield* panelIs(served.page, kept);
    return served;
  });

/** Land on `href` (a pasted link: a new document), the film staged in it. */
const landed = (served: Effect.Success<ReturnType<typeof keeping>>, href: string) =>
  Effect.andThen(served.land(href), served.page.waitFor('.lab-panel[data-staged="true"]'));

describe('a link that cites a cue or a knob, served', () => {
  for (const kept of ['note', 'compare', 'record'] as const)
    for (const [where, viewport] of [
      ['a desk', DESK],
      ['a phone', PHONE],
    ] as const)
      it.live(
        `lands in Edit on ${where} from a viewer who kept ${kept}`,
        () =>
          Effect.gen(function* () {
            const served = yield* keeping(kept, viewport);
            yield* landed(served, labAt(1, { selection: rise }));
            yield* panelIs(served.page, 'edit');
            // Back is the page the viewer kept their mode on, in it.
            yield* served.page.back;
            yield* panelIs(served.page, kept);
            yield* landed(served, labAt(1, { selection: spot }));
            yield* panelIs(served.page, 'edit');
            // The link was not the viewer's pick: a plain link shows the mode they kept.
            yield* landed(served, labAt(1));
            yield* panelIs(served.page, kept);
          }).pipe(Effect.scoped),
        SLOW,
      );

  it.live(
    'leaves Motion on a laptop, which shows the cue’s lane, and takes a phone to Edit',
    () =>
      Effect.gen(function* () {
        const desk = yield* keeping('motion');
        yield* landed(desk, labAt(1, { selection: rise }));
        yield* panelIs(desk.page, 'motion');
        const phone = yield* keeping('motion', PHONE);
        yield* landed(phone, labAt(1, { selection: rise }));
        yield* panelIs(phone.page, 'edit');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a mode picked after the link landed stays picked, and is the one a plain link lands in',
    () =>
      Effect.gen(function* () {
        const served = yield* keeping('record');
        yield* landed(served, labAt(1, { selection: rise }));
        yield* panelIs(served.page, 'edit');
        yield* served.page.click('.lab-modes [data-mode-pick="note"]');
        yield* panelIs(served.page, 'note');
        yield* landed(served, labAt(1));
        yield* panelIs(served.page, 'note');
      }).pipe(Effect.scoped),
    SLOW,
  );
});
