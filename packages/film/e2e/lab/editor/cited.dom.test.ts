// The mode a link's citation shows, in a browser over the probe film: a
// pasted link that cites a cue or a knob lands in Edit, whatever mode the
// viewer kept (Note, Compare, Record), as a cited note lands in Note and a
// cited beat in Record; Motion on a laptop already shows a cue's lane, so a
// link that cites one leaves it there; a mode picked after the link landed
// is the viewer's.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { PHONE, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { attributeIs } from '../../../src/lab/fixtures/settled.ts';

const rise = { _tag: 'Cue', scene: 'one', name: 'rise' } as const;
const spot = { _tag: 'Knob', scene: 'one', name: 'spot' } as const;

const panelIs = (page: Parameters<typeof attributeIs>[0], mode: string) =>
  attributeIs(page, '.lab-panel', 'data-mode', mode);

describe('a link that cites a cue or a knob', () => {
  for (const kept of ['note', 'compare', 'record'] as const)
    it.live(`lands in Edit from a viewer who kept ${kept}`, () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(1), mode: kept });
        yield* panelIs(page, kept);
        yield* page.goto(labAt(1, { selection: rise }));
        yield* page.waitFor('.lab-panel[data-staged="true"]');
        yield* panelIs(page, 'edit');
        yield* page.goto(labAt(1, { selection: spot }));
        yield* page.waitFor('.lab-panel[data-staged="true"]');
        yield* panelIs(page, 'edit');
      }).pipe(Effect.scoped),
    );

  it.live('leaves Motion on a laptop, which shows the cue’s lane, and takes a phone to Edit', () =>
    Effect.gen(function* () {
      const desk = yield* openLab([], { href: labAt(1), mode: 'motion' });
      yield* desk.page.goto(labAt(1, { selection: rise }));
      yield* desk.page.waitFor('.lab-panel[data-staged="true"]');
      yield* panelIs(desk.page, 'motion');
      const phone = yield* openLab([], { href: labAt(1), mode: 'motion', viewport: PHONE });
      yield* phone.page.goto(labAt(1, { selection: rise }));
      yield* phone.page.waitFor('.lab-panel[data-staged="true"]');
      yield* panelIs(phone.page, 'edit');
    }).pipe(Effect.scoped),
  );

  it.live('a mode picked after the link landed stays picked', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1), mode: 'record' });
      yield* page.goto(labAt(1, { selection: rise }));
      yield* page.waitFor('.lab-panel[data-staged="true"]');
      yield* panelIs(page, 'edit');
      yield* page.click('.lab-modes [data-mode-pick="note"]');
      yield* panelIs(page, 'note');
    }).pipe(Effect.scoped),
  );
});
