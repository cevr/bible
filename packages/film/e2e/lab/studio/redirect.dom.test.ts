// A film's Lab link, as the lab's server sends it on to the studio (a 302
// to `servedPlace`'s place, `tools/lab-page.ts`; the fake server answers as
// it does), on a laptop (1440 × 900) and a phone (390 × 844): the film's Lab
// (`/films/<film>/lab#t=`) opens the studio at the same film time; a scene's
// Lab (`/films/<film>/lab/<scene>#t=`) opens it with that scene's beat
// selected, at the beat's start (its `#t=` was time in the scene, which the
// studio cannot place before it reads its timeline), the note it had open
// kept. Every wait is on what the page shows, never on time.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { scriptOf } from '../../../src/lab/film-studio/ripple.ts';
import { DESK, PHONE, openPlayer } from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { probeTimeline } from '../../../src/lab/fixtures/probe-timeline.ts';
import { evaluates, textIs, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The studio's first clip drawn: the timeline is read and laid out. */
const READY = '.st-timeline .st-clip';

/** Where the page landed: its path, its query and its hash. */
const LANDED = 'location.pathname + location.search + location.hash';

/** Where beat two starts on the open version's clock, as the studio's timecode prints it. */
const TWO = Option.getOrElse(
  Option.map(
    Option.fromUndefinedOr(scriptOf(probeTimeline(2)).find((b) => b.beat === 'two')),
    (b) => b.start,
  ),
  () => Number.NaN,
);

const SIZES = [
  { name: 'a laptop', viewport: DESK },
  { name: 'a phone', viewport: PHONE },
] as const;

for (const size of SIZES)
  describe(`a Lab link on ${size.name}`, () => {
    it.live(
      "the film's Lab opens the studio at the same film time",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openPlayer(
            { href: `/films/${PROBE}/lab#t=6.5`, viewport: size.viewport },
            READY,
          );
          yield* evaluates(page, LANDED, `${pageHref.studio(PROBE)}#t=6.5`);
          yield* textIs(page, '.st-tc', /^0:06\.5/);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "a scene's Lab opens the studio on its beat, at the beat's start",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openPlayer(
            { href: `/films/${PROBE}/lab/two#t=1.5`, viewport: size.viewport },
            READY,
          );
          yield* evaluates(
            page,
            'location.pathname + location.search',
            pageHref.studio(PROBE, { sel: 'beat:two' }),
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          yield* textIs(page, '.st-tc', new RegExp(`^0:0${TWO.toFixed(1).replace('.', '\\.')}`));
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
