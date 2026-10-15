// A series draft in the Script reader (`/series/<series>/<draft>`) on a
// phone, over the toy's draft (three beats: the first's take ready, the
// second's voicing, the third a card): at rest only the words, their marks,
// the ready take and its pace show; a tap on a word selects it in the URL
// and opens its delivery, whose Stress writes the beat's marks (the draft's
// answer shown, the takes read again); a gap's choice writes a breath; a
// write the lab refuses says why under the words; a refresh reads the draft
// again, outranking a write's answer sent over the older read; a phone
// selects a range as the Script page's does (tap the first word, hold the
// last, Select to here) and marks it; and the
// review's home lists the series, each opening to its drafts' links.

import { Boolean as Bool, Effect, Option, Schedule } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { touch as fingerDown } from '../../../src/lab/fixtures/gestures.ts';
import { pageHref } from '../../../src/core/api.ts';
import { SourceChanged } from '../../../src/core/refusals.ts';
import {
  type Asked,
  type FakeRoute,
  PHONE,
  json,
  openReview,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { evaluates, textHas, waitFor } from '../../../src/lab/fixtures/settled.ts';
import {
  STUDIO_DRAFT,
  STUDIO_SERIES,
  draftRecordWith,
  draftVoice,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { DELIVERY_READY, DRAFT_READY, SLOW } from '../studio-states.ts';

const DRAFT = `^/api/series/${STUDIO_SERIES}/${STUDIO_DRAFT}`;
const MARKS = new RegExp(`${DRAFT}/marks$`);
const VOICE = new RegExp(`${DRAFT}/voice$`);

/** The first beat's word `index`, as its line lays it out. */
const word = (index: number) =>
  `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${index}"]`;

/** The page's path and query, as the address bar has it. */
const placed = 'location.pathname + location.search';

describe('a series draft in the Script reader, on a phone', () => {
  it.live(
    'at rest the words, their marks and a ready take; a word tapped opens its delivery, and Stress writes it',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        let voiceReads = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', MARKS, (asked) => {
            posted.push(asked);
            return json(draftRecordWith('The first thing {*}God {*}gave was breath.'));
          }),
          route('GET', VOICE, () => {
            voiceReads += 1;
            return json(draftVoice);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT),
          viewport: PHONE,
        });
        yield* waitFor(page, DRAFT_READY);
        // The marks as written: "gave" stressed, a hold of a second before "and" in beat 2.
        yield* evaluates(page, `document.querySelector('${word(4)}').dataset.stress`, 'true');
        yield* textHas(page, '.lab-script-beat[data-beat="2"] .lab-script-gap', '// 1 s');
        yield* textHas(page, '.lab-script-beat[data-beat="1"] .lab-script-pace', '156 wpm');
        yield* textHas(page, '.lab-script-beat[data-beat="2"] .lab-script-voicing', 'voicing');
        yield* textHas(
          page,
          '.lab-script-spend',
          '1 of 2 takes ready · 1 voicing · 1,240 of 20,000',
        );
        // At rest no box of choices is open.
        yield* evaluates(page, `document.querySelectorAll('.lab-script-delivery').length`, 0);

        yield* page.click(word(3));
        yield* waitFor(page, DELIVERY_READY);
        yield* evaluates(
          page,
          placed,
          `${pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '3-3')}`,
        );
        yield* textHas(page, '.lab-script-ties-what', '“God”');
        const reads = voiceReads;
        yield* page.click(DELIVERY_READY);
        yield* evaluates(page, `document.querySelector('${word(3)}').dataset.stress`, 'true');
        yield* textHas(page, '.lab-script-delivery-note', 'marked in the draft');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            read: {
              spoken: 'The first thing God gave was breath.',
              marks: [{ _tag: 'Stress', word: 4 }],
            },
            marks: [
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
        // The takes are read again at once: the beat's new marks are a new take, queued first.
        yield* Effect.sync(() => voiceReads).pipe(
          Effect.repeat({
            until: (n) => n > reads,
            schedule: Schedule.spaced('25 millis'),
            times: 200,
          }),
        );
        expect(voiceReads).toBeGreaterThan(reads);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a breath chosen before a word is written as its gap; Clear selects nothing',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', MARKS, (asked) => {
            posted.push(asked);
            return json(draftRecordWith('The first thing God {*}gave {/} was breath.'));
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '5-5'),
          viewport: PHONE,
        });
        yield* waitFor(page, DELIVERY_READY);
        yield* page.click('.lab-script-delivery button[title="A breath before these words"]');
        yield* textHas(page, '.lab-script-beat[data-beat="1"] .lab-script-gap', '/');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            read: {
              spoken: 'The first thing God gave was breath.',
              marks: [{ _tag: 'Stress', word: 4 }],
            },
            marks: [
              { _tag: 'Stress', word: 4 },
              { _tag: 'Breath', before: 5 },
            ],
          },
        ]);
        yield* page.click('[data-act="clear-draft"]');
        yield* evaluates(page, `document.querySelectorAll('.lab-script-delivery').length`, 0);
        yield* evaluates(page, placed, pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT));
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a write the lab refuses says why under the words, and the marks stand as they were',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', MARKS, () =>
            refused(
              SourceChanged.make({
                file: `series/${STUDIO_SERIES}/scripts/${STUDIO_DRAFT}.md`,
                target: 'beat 1',
              }),
            ),
          ),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '3-3'),
          viewport: PHONE,
        });
        yield* waitFor(page, DELIVERY_READY);
        yield* page.click(DELIVERY_READY);
        yield* textHas(page, '.lab-script-delivery-note', 'not marked');
        yield* evaluates(
          page,
          `document.querySelector('${word(3)}').dataset.stress ?? 'none'`,
          'none',
        );
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a refresh reads the draft again, and a mark answered over the older read never stands over it',
    () =>
      Effect.gen(function* () {
        let saved = false;
        const routes: ReadonlyArray<FakeRoute> = [
          // The write's answer is held: an editor's save and a refresh land before it does.
          route(
            'POST',
            MARKS,
            () => json(draftRecordWith('The first thing {*}God {*}gave was breath.')),
            '1500 millis',
          ),
          route('GET', new RegExp(`${DRAFT}$`), () =>
            json(
              Bool.match(saved, {
                onTrue: () => draftRecordWith('The first thing God gave was {*}breath.'),
                onFalse: () => draftRecordWith(),
              }),
            ),
          ),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '3-3'),
          viewport: PHONE,
        });
        yield* waitFor(page, DELIVERY_READY);
        yield* page.click(DELIVERY_READY);
        saved = true;
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* page.click('[data-role="view-menu"] [data-command="review.refresh"]');
        yield* evaluates(page, `document.querySelector('${word(6)}').dataset.stress`, 'true');
        // The held answer lands, and is set aside: the draft as it now reads stands.
        yield* textHas(page, '.lab-script-delivery-note', 'marked in the draft');
        yield* evaluates(page, `document.querySelector('${word(6)}').dataset.stress`, 'true');
        yield* evaluates(
          page,
          `document.querySelector('${word(3)}').dataset.stress ?? 'none'`,
          'none',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "the review's home lists the series beside the films, each draft a link into the reader",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openReview(studioRoutes, {
          href: pageHref.home(),
          viewport: PHONE,
        });
        const series = `.rv-series[data-series="${STUDIO_SERIES}"]`;
        const link = `${series} a[href="${pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT)}"]`;
        // At rest a series is its title and how many drafts it has; its head opens them.
        yield* textHas(page, `${series} summary`, 'Toy talks1 draft');
        yield* page.click(`${series} summary`);
        yield* textHas(page, link, 'The first breath');
        yield* page.click(link);
        yield* waitFor(page, DRAFT_READY);
        yield* textHas(page, '.dr-head h1', 'The first breath');
      }).pipe(Effect.scoped),
    SLOW,
  );

  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    'a word tapped and another held then Select to here selects the words between, and Stress marks them',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', MARKS, (asked) => {
            posted.push(asked);
            return json(draftRecordWith('The first {*}thing {*}God {*}gave was breath.'));
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT),
          viewport: PHONE,
        });
        yield* waitFor(page, DRAFT_READY);
        yield* page.click(word(2));
        yield* evaluates(page, placed, pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '2-2'));
        // A phone has no Shift: a touch held still on the last word opens its menu.
        yield* page.clock.hold;
        yield* fingerDown(page, word(3), 0);
        yield* page.clock.runFor(700);
        yield* page.waitFor('[data-role="context-menu"] [data-command="script.select-to"]');
        yield* page.finger.up;
        yield* page.click('[data-role="context-menu"] [data-command="script.select-to"]');
        yield* page.clock.runFor(100);
        yield* evaluates(page, placed, pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '2-3'));
        yield* textHas(page, '.lab-script-ties-what', '“thing God”');
        yield* page.click(DELIVERY_READY);
        yield* textHas(page, '.lab-script-delivery-note', 'marked in the draft');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            read: {
              spoken: 'The first thing God gave was breath.',
              marks: [{ _tag: 'Stress', word: 4 }],
            },
            marks: [
              { _tag: 'Stress', word: 2 },
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.runPromise),
  );
});
