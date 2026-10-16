// An agent's ask (`/asks/<id>`) on a phone, one page, over the toy's ask (a
// choice of three takes; the slow one asks why): the choice of the slow one
// brings its why section onto the same page, whose free text keeps every
// keystroke, and one Send sends both sections, the end showing every
// answer; the free text, optional (its flag, not its label, says so), sends
// with nothing in it and the end says it was skipped; an answer the lab
// refuses (the laptop answered first) reads the ask again, where it now is,
// and says why; a Send with a question open sends nothing, goes to it, marks
// it and says what it needs (by the field; the dock names it). At the page's
// end its last section's head holds the top, with a film or none. Answers not sent come back after a reload, and a send that
// lands leaves none to bring back. A guided review shows each section's material
// in place (the draft's script, named, with its takes and its marks, Stress
// written into the draft; the Board's panels; a real 1280×720 cut in the
// review's player, its play quiet at the hit, the page no wider for it; the
// take; the set's notes),
// headed `n of N · Title` and indexed, the recommended option first and
// marked, the send counting what is answered, the kit's primary Send, one
// focus ring on an option, and fits a phone. A film's script under review is
// its Script reader too: Stress writes `script.ts`, which is read again, and
// a second mark before the lab's line has caught up stands on the first,
// while a line put back elsewhere as it was before the page's write shows as
// put back. On a laptop the dock's words and Send keep to the column. A long
// document is held at its clamp with Read all, which opens it whole; a Board
// still opens full size (`?still=`), its caption inside the phone's screen or
// clear of the laptop's dock, and Escape or a tap closes it.

import { Boolean as Bool, Deferred, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { AskRefused } from '../../../src/core/refusals.ts';
import {
  type Asked,
  DESK,
  type FakeRoute,
  type Json,
  PHONE,
  file,
  json,
  openReview,
  refused,
  route,
  text as textAnswer,
} from '../../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../../src/lab/fixtures/phone-fit.ts';
import {
  FOCUS_SHOWN,
  countIs,
  evaluates,
  textHas,
  textIs,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import {
  STUDIO_ASK,
  STUDIO_DRAFT,
  STUDIO_FILM,
  STUDIO_GUIDED,
  STUDIO_SERIES,
  askRecordWith,
  draftRecordWith,
  draftVoice,
  guidedRoutes,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { ASK_READY, SLOW } from '../studio-states.ts';

const ANSWER = new RegExp(`^/api/asks/${STUDIO_ASK}/answer$`);
const DRAFT_MARKS = new RegExp(`^/api/series/${STUDIO_SERIES}/${STUDIO_DRAFT}/marks$`);
/** A still at 1920×1080: the size of a Board's. */
const STILL_1080 = new URL('../../../src/tools/fixtures/still-1080.svg', import.meta.url).pathname;
/** A real H.264 take at 1280×720: the size of a render's. */
const HD_720 = new URL('../../../src/tools/fixtures/hd-720.mp4', import.meta.url).pathname;
/** The section whose head holds the top under the header once the page is scrolled to its end. */
const AT_THE_TOP_AT_THE_END = `(() => { scrollTo(0, document.documentElement.scrollHeight); const y = document.querySelector('.sh-header').getBoundingClientRect().bottom + 2; return document.elementFromPoint(innerWidth / 2, y)?.closest('.ak-step')?.dataset.step ?? ''; })()`;
/** An ask whose one section is the toy's own script, by its film. */
const SCRIPT_ASK = 'a0123456781';
const slow = { kind: 'choose', value: 'slow', label: 'Slow' };
const words = 'It breathes before the cut, so the turn lands.';
const pick = { step: 'pick', values: { take: 'slow' }, at: '2026-10-14T00:01:00.000Z' };
const atWhy = askRecordWith({ _tag: 'Asking', step: 'why', answers: { take: slow } }, [pick]);
const sections = (why: Record<string, string>) => ({
  sections: [
    { step: 'pick', values: { take: 'slow' } },
    { step: 'why', values: why },
  ],
});
const skipped = askRecordWith(
  { _tag: 'Answered', step: 'done', answers: { take: slow, why: { kind: 'skipped' } } },
  [pick, { step: 'why', values: {}, at: '2026-10-14T00:02:00.000Z' }],
);
const done = askRecordWith(
  {
    _tag: 'Answered',
    step: 'done',
    answers: { take: slow, why: { kind: 'free_text', text: words } },
  },
  [
    { step: 'pick', values: { take: 'slow' }, at: '2026-10-14T00:01:00.000Z' },
    { step: 'why', values: { why: words }, at: '2026-10-14T00:02:00.000Z' },
  ],
);
/** An ask of one section, the toy's own script by its film, and whether to keep it. */
const scriptAsk: Json = {
  id: SCRIPT_ASK,
  title: 'Hear the toy',
  why: 'The script goes to the Board once kept.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-15T00:00:00.000Z',
  ask: {
    start: 'script',
    steps: {
      script: {
        title: 'The script',
        blocks: [
          { kind: 'script', film: STUDIO_FILM },
          {
            kind: 'choose',
            id: 'script',
            label: 'Keep the script?',
            options: [
              { value: 'keep', label: 'Keep it', recommended: true, why: 'It is 156 wpm.' },
              { value: 'redo', label: 'Again' },
            ],
          },
        ],
        next: [{ to: 'done' }],
      },
      done: { end: true },
    },
  },
  state: { _tag: 'Asking', step: 'script', answers: {} },
  answered: [],
};
/** The toy's script as the lab reads it: one beat saying `say`. */
const said = (say: string) => ({
  film: STUDIO_FILM,
  beats: [{ id: '1', say, cite: ['Gen 2:7'] }],
});

describe("an agent's ask on a phone", () => {
  it.live(
    'a choice brings the words it asks for onto the page; one Send sends both; the end shows every answer',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(done);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* evaluates(page, `document.querySelectorAll('.ak-step').length`, 1);
        // One section, untitled: no "1 of 1" head; a second brings each its place.
        yield* countIs(page, '.ak-section-h', 0);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-section-h .ak-count')].map((c) => c.textContent.trim())`,
          ['1 of 2', '2 of 2'],
        );
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        // At the page's end its last section, short as it is, holds the top: the head before it is gone.
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'why');
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        yield* textHas(page, '.ak-outcome [data-answer="take"]', 'Slow');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([sections({ why: words })]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an ask that names no film: at its end its last section still holds the top',
    () =>
      Effect.gen(function* () {
        const { film: _film, ...noFilm } = askRecordWith() as Record<string, Json>;
        const { page, errors } = yield* openReview(
          [
            route('GET', new RegExp(`^/api/asks/${STUDIO_ASK}$`), () => json(noFilm)),
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_ASK), viewport: PHONE },
        );
        yield* waitFor(page, `.sh[data-film="false"] ${ASK_READY}`);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'why');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'answers not sent come back after a reload; a send that lands leaves the tab nothing to bring back',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, () => json(done)),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        yield* page.reload;
        yield* waitFor(page, '.ak-option[data-value="slow"][aria-pressed="true"]');
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="why"] textarea')?.value`,
          words,
        );
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        // The lab here answers the ask afresh on a read: the tab brings back no answer.
        yield* page.reload;
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 1 answered');
        yield* countIs(page, '.ak-option[aria-pressed="true"]', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the words, optional, go with nothing in them; the field says so and the end says skipped',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(skipped);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* textHas(
          page,
          '.ak-step[data-step="why"] .ak-legend',
          'Why the slow one? (optional)',
        );
        // Another choice takes the why section off the page again; the slow one brings it back.
        yield* page.click('.ak-option[data-value="warm"]');
        yield* evaluates(page, `document.querySelectorAll('.ak-step[data-step="why"]').length`, 0);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', 'Skipped');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([sections({})]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an answer refused is read again, where the ask now is, and the refusal said',
    () =>
      Effect.gen(function* () {
        let reads = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, () =>
            refused(AskRefused.make({ id: STUDIO_ASK, reason: 'step pick is answered already' })),
          ),
          route('GET', new RegExp(`^/api/asks/${STUDIO_ASK}$`), () => {
            reads += 1;
            return json(
              Bool.match(reads === 1, { onTrue: () => askRecordWith(), onFalse: () => atWhy }),
            );
          }),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="warm"]');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-step[data-step="why"]');
        yield* textHas(page, '.ak-send', 'step pick is answered already');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a Send with a question open sends nothing: it goes to the question, marks it and says what it needs',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(done);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 1 answered');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-field[data-answer="take"][data-invalid="true"]');
        // The field's line says what it needs under its own label; the dock, far from it, names it.
        yield* textIs(page, '.ak-field[data-answer="take"] .ak-unanswered', 'Needs a choice');
        yield* textHas(page, '.ak-send [data-role="answered"]', 'Which take? needs a choice');
        yield* evaluates(
          page,
          `document.querySelector('.ak-field[data-answer="take"]').contains(document.activeElement)`,
          true,
        );
        // A choice clears the mark; the count follows.
        yield* page.click('.ak-option[data-value="warm"]');
        yield* evaluates(
          page,
          `document.querySelectorAll('.ak-field[data-invalid="true"], .ak-unanswered').length`,
          0,
        );
        yield* textHas(page, '.ak-send [data-role="answered"]', '1 of 1 answered');
        expect(posted).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a film's script under review is its Script reader: named by its film, its take heard, and Stress writes script.ts",
    () =>
      Effect.gen(function* () {
        const marked: Array<Asked> = [];
        let reads = 0;
        const readAgain = Deferred.makeUnsafe<void>();
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            reads += 1;
            if (reads > 1) Deferred.doneUnsafe(readAgain, Effect.void);
            return json(
              said(
                Bool.match(reads === 1, {
                  onTrue: () => 'The first thing God {*}gave was breath.',
                  onFalse: () => 'The first thing {*}God {*}gave was breath.',
                }),
              ),
            );
          }),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => json(draftVoice)),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, (asked) => {
            marked.push(asked);
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '[data-role="script-name"]', `The script of ${STUDIO_FILM}`);
        yield* textHas(page, '.ak-rec-why', 'Recommended: It is 156 wpm.');
        yield* waitFor(page, '.lab-script-beat[data-beat="1"] [data-act="hear-beat"]');
        yield* waitFor(page, '[data-act="hear-script"]');
        yield* page.click('.lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]');
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        // Landed: the script is read again, its words and marks as script.ts has them now.
        // The page shows its own mark before the read lands, so the test waits for the read.
        yield* Deferred.await(readAgain);
        yield* evaluates(
          page,
          `document.querySelector('.lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]').dataset.stress`,
          'true',
        );
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
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
        yield* fitsPhone(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a second mark made before the line is read again stands on the first: the page carries the line as its own write left it',
    () =>
      Effect.gen(function* () {
        const marked: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          // The lab has not caught up with the write: each read still has the line as it was.
          route('GET', /^\/api\/films\/toy\/script$/, () =>
            json(said('The first thing God {*}gave was breath.')),
          ),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => json(draftVoice)),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, (asked) => {
            marked.push(asked);
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* page.click(word(3));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* page.click(word(6));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(6)}[data-stress="true"]`);
        const spoken = 'The first thing God gave was breath.';
        const stress = (w: number) => ({ _tag: 'Stress', word: w });
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
          { beat: '1', read: { spoken, marks: [stress(4)] }, marks: [stress(3), stress(4)] },
          {
            beat: '1',
            read: { spoken, marks: [stress(3), stress(4)] },
            marks: [stress(3), stress(4), stress(6)],
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a line put back elsewhere to the marks the page read before its own write shows as put back',
    () =>
      Effect.gen(function* () {
        const SAY = {
          M0: 'The first thing God {*}gave was breath.',
          M1: 'The first thing {*}God {*}gave was breath.',
        } as const;
        let line: keyof typeof SAY = 'M0';
        let back = false;
        // The script read after the write (the line as it left it), and the one after the put-back.
        const [readBack, putBack] = [Deferred.makeUnsafe<void>(), Deferred.makeUnsafe<void>()];
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            if (line === 'M1') Deferred.doneUnsafe(readBack, Effect.void);
            if (back) Deferred.doneUnsafe(putBack, Effect.void);
            return json(said(SAY[line]));
          }),
          // A take's file is keyed by its words and marks: it changes as the line does.
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => {
            const [first, ...rest] = (draftVoice as { beats: ReadonlyArray<Json> }).beats;
            const take = (first as { take: Record<string, Json> }).take;
            return json({
              ...(draftVoice as Record<string, Json>),
              beats: [{ id: '1', take: { ...take, file: `k-${line}.mp3` } }, ...rest],
            });
          }),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, () => {
            line = 'M1';
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        // The page's own write: M0 to M1, word 3 stressed too; the lab reads the line back as M1.
        yield* page.click(word(3));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* Deferred.await(readBack);
        // Another hand puts the line back as the page read it before its write: M1 to M0.
        line = 'M0';
        back = true;
        yield* Deferred.await(putBack);
        yield* countIs(page, `${word(3)}[data-stress="true"]`, 0);
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW * 2,
  );

  it.live(
    "a line changed under the reader is read again once the voice's poll sees its take change",
    () =>
      Effect.gen(function* () {
        // Someone else marks the line: the lab's next voice read has a new take for it (a take's
        // file is keyed by its words and marks), and the script, read again, the new marks.
        let polls = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            if (polls > 1) return json(said('The first thing {*}God gave was breath.'));
            return json(said('The first thing God {*}gave was breath.'));
          }),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => {
            polls += 1;
            if (polls === 1) return json(draftVoice);
            const [first, ...rest] = (draftVoice as { beats: ReadonlyArray<Json> }).beats;
            const take = (first as { take: Record<string, Json> }).take;
            return json({
              ...(draftVoice as Record<string, Json>),
              beats: [{ id: '1', take: { ...take, file: 'k1-marked.mp3' } }, ...rest],
            });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* countIs(page, `${word(4)}[data-stress="true"]`, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a guided review: each section its material in place, then its question; the recommendation first; it fits a phone',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const marked: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', new RegExp(`^/api/asks/${STUDIO_GUIDED}/answer$`), (asked) => {
            posted.push(asked);
            return json(askRecordWith({ _tag: 'Answered', step: 'done', answers: {} }));
          }),
          route('POST', DRAFT_MARKS, (asked) => {
            marked.push(asked);
            return json(draftRecordWith('The first thing {*}God {*}gave was breath.'));
          }),
          // The cut is a real 1280×720 take: its picture keeps to the phone's column.
          route('GET', /^\/api\/review\/(files|phone)\/out\/toy\/take-1\.mp4/, () => file(HD_720)),
          ...guidedRoutes,
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-section-h')].map((h) => h.textContent)`,
          ['1 of 3 · The script', '2 of 3 · The Board', '3 of 3 · The cut'],
        );
        // The index names each section; the send counts what is answered.
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-index-go')].map((b) => b.textContent)`,
          ['1 · The script', '2 · The Board', '3 · The cut'],
        );
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 3 answered');
        // The draft's script is named by its series and its title.
        yield* textHas(
          page,
          '.ak-step[data-step="script"] [data-role="script-name"]',
          'The first breath',
        );
        // The script is the Script reader: the draft's words, its ready take and its pace.
        yield* waitFor(
          page,
          '.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w',
        );
        yield* textHas(page, '.ak-step[data-step="script"] .lab-script-pace', '156 wpm');
        // A section's question reads at its head's size.
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('.ak-step[data-step="board"] legend')).fontSize === getComputedStyle(document.querySelector('.ak-step[data-step="board"] .ak-section-h')).fontSize`,
          true,
        );
        // A ready take's ▶ is the shell's line icon; the takes are said, the day's spend is the Script's.
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-hear .sh-icon') !== null`,
          true,
        );
        yield* textHas(page, '.ak-step[data-step="script"] .lab-script-spend', 'takes ready');
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-spend').textContent.includes('characters today')`,
          false,
        );
        // A word tapped opens its delivery in place: Stress writes the draft's marks.
        yield* page.click(
          '.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]',
        );
        yield* page.click(
          '.ak-step[data-step="script"] .lab-script-delivery [data-act="stress-words"]',
        );
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]').dataset.stress`,
          'true',
        );
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
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
        // While it waits its head wears no chip: the dock's count says what is left.
        yield* countIs(page, '.ak-head [data-role="status"]', 0);
        // The Board's panels as the Board shows them: the card's words, the picture's want of a try.
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.title"]', 'breath');
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.field"]', 'no try yet');
        // The cut in the review's player, the take, the set's notes.
        yield* waitFor(page, '.ak-step[data-step="cut"] [data-material="video"] video');
        yield* textHas(
          page,
          '.ak-step[data-step="cut"] [data-material="video"] figcaption',
          'From the turn.',
        );
        yield* waitFor(page, '.ak-step[data-step="cut"] [data-material="audio"] audio');
        yield* textHas(page, '.ak-step[data-step="cut"] .ak-heard', 'The first thing God gave');
        yield* textHas(
          page,
          '.ak-step[data-step="cut"] [data-material="document"]',
          'The turn lands',
        );
        // The recommendation first and marked; the kit's primary Send; one ring on a focused option.
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-step[data-step="board"] .ak-option')].map((o) => o.dataset.value)`,
          ['keep', 'redo'],
        );
        yield* textHas(
          page,
          '.ak-step[data-step="board"] .ak-option[data-value="keep"] .sh-badge',
          'recommended',
        );
        yield* evaluates(
          page,
          `document.querySelector('${ASK_READY}').hasAttribute('data-primary')`,
          true,
        );
        yield* page.focus('.ak-step[data-step="board"] .ak-option[data-value="keep"]');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        // The index jumps to a section's head, its material read from the top, under the header.
        yield* page.click('.ak-index-go[data-step="board"]');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('.ak-step[data-step="board"] .ak-section-h') && Math.round(document.querySelector('.ak-step[data-step="board"]').getBoundingClientRect().top) === Math.round(document.querySelector('.sh-header').getBoundingClientRect().bottom)`,
          true,
        );
        // A 1280×720 take, its size known, and the page no wider than the phone.
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="cut"] [data-material="video"] video').videoWidth`,
          1280,
        );
        yield* evaluates(page, 'document.documentElement.scrollWidth === innerWidth', true);
        yield* fitsPhone(page);
        // At the page's end the last section's head holds the top, not the Board's over its question.
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'cut');
        // The cut opens where the agent pointed (`at`), its row shown; the row's play is quiet, at the hit.
        const cut = '.ak-step[data-step="cut"] [data-material="video"]';
        yield* evaluates(
          page,
          `((b) => b !== null && !b.hasAttribute('data-primary') && b.getBoundingClientRect().height >= 44)(document.querySelector('${cut} .rv-big'))`,
          true,
        );
        for (const step of ['script', 'board', 'cut'])
          yield* page.click(`.ak-step[data-step="${step}"] .ak-option[data-value="keep"]`);
        yield* textHas(page, '.ak-send [data-role="answered"]', '3 of 3 answered');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-outcome');
        // Answered, its head says so.
        yield* textIs(page, '.ak-head [data-role="status"]', 'answered');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            sections: [
              { step: 'script', values: { script: 'keep' } },
              { step: 'board', values: { board: 'keep' } },
              { step: 'cut', values: { cut: 'keep' } },
            ],
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a laptop the script's words start on the column's edge with the band's, and the dock ends on the window's bottom",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview([...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: DESK,
        });
        yield* waitFor(page, ASK_READY);
        yield* waitFor(page, '.ak-step[data-step="script"] .lab-script-beat');
        // The band's words, the draft's name, a beat's line and the Board start at one x; the
        // band and the script's dividers span one width.
        const left = (selector: string) =>
          `Math.round(document.querySelector('${selector}').getBoundingClientRect().left)`;
        const textLeft = (selector: string) =>
          `((el) => Math.round(el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft)))(document.querySelector('${selector}'))`;
        yield* evaluates(
          page,
          `[${textLeft('.ak-step[data-step="script"] .ak-section-h')}, ${textLeft('.ak-step[data-step="script"] .ak-mat-name')}, ${textLeft('.ak-step[data-step="script"] .lab-script-beat')}, ${left('.ak-step[data-step="board"] .ak-board')}].every((x, _, all) => x === all[0])`,
          true,
        );
        yield* evaluates(
          page,
          `Math.round(document.querySelector('.ak-step[data-step="script"] .ak-section-h').getBoundingClientRect().width) === Math.round(document.querySelector('.ak-step[data-step="script"] .lab-script-beat').getBoundingClientRect().width)`,
          true,
        );
        yield* evaluates(
          page,
          `(scrollTo(0, document.documentElement.scrollHeight), Math.round(innerHeight - document.querySelector('.ak-send').getBoundingClientRect().bottom))`,
          0,
        );
        // The dock's words start on the column's edge too, and its Send ends on the column's other.
        const right = (selector: string) =>
          `Math.round(document.querySelector('${selector}').getBoundingClientRect().right)`;
        yield* evaluates(
          page,
          `[${left('.ak-send [data-role="answered"]')} === ${left('.ak-step[data-step="board"] .ak-board')}, ${right('.ak-send [data-act="send"]')} === ${right('.ak-step[data-step="board"] .ak-board')}]`,
          [true, true],
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a long document is clamped near its question, Read all opens it whole, and words typed leave it and the index as they are',
    () =>
      Effect.gen(function* () {
        const long = Array.from(
          { length: 60 },
          (_, i) => `Paragraph ${i + 1}: the turn lands after the breath, and the page waits.`,
        ).join('\n\n');
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/files\/out\/toy\/notes\.md/, () =>
              textAnswer(`# Notes\n\n${long}\n`, 200),
            ),
            ...guidedRoutes,
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_GUIDED), viewport: PHONE },
        );
        const doc = '.ak-step[data-step="cut"] [data-material="document"]';
        yield* textHas(page, doc, 'Paragraph 60');
        // Held at the clamp: the words run on under it, and Read all says so.
        yield* waitFor(page, `${doc} .ak-clamp[data-open="false"][data-long="true"]`);
        yield* evaluates(
          page,
          `((c) => c.scrollHeight > c.clientHeight * 2 && c.clientHeight < innerHeight)(document.querySelector('${doc} .ak-clamp'))`,
          true,
        );
        // The caption sits under the panel, the toggle inside it under the words.
        yield* textIs(page, `${doc} .ak-doc + .ak-mat-cap`, 'The notes on the cut.');
        // Only the words fade: the panel's ground runs whole to its sharp edge, under the toggle.
        yield* evaluates(
          page,
          `((d) => getComputedStyle(d).maskImage === 'none' && d.lastElementChild.matches('[data-act="read-all"]'))(document.querySelector('${doc} .ak-doc'))`,
          true,
        );
        const toggle = `${doc} [data-act="read-all"]`;
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* textIs(page, toggle, 'Show less');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('${toggle}')`,
          true,
        );
        yield* evaluates(
          page,
          `document.querySelector('${toggle}').getAttribute('aria-expanded')`,
          'true',
        );
        yield* evaluates(
          page,
          `((c) => c.scrollHeight <= c.clientHeight + 1)(document.querySelector('${doc} .ak-clamp'))`,
          true,
        );
        // Show less, from the document's end: folded back, its top in view, the focus kept.
        yield* page.evaluate(
          `document.querySelector('${toggle}').scrollIntoView({ block: 'center' })`,
        );
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="false"][data-long="true"]`);
        yield* textIs(page, toggle, 'Read all');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('${toggle}')`,
          true,
        );
        yield* evaluates(
          page,
          `((t) => t >= document.querySelector('.sh-header').getBoundingClientRect().bottom && t < innerHeight)(document.querySelector('${doc} .ak-doc').getBoundingClientRect().top)`,
          true,
        );
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        // A keystroke in the cut's words: the index's buttons are the ones drawn, the document still open.
        yield* page.evaluate(
          `(window.__indexGo = document.querySelector('.ak-index-go[data-step="cut"]'), true)`,
        );
        yield* page.fill('.ak-step[data-step="cut"] textarea', 'a');
        yield* page.fill('.ak-step[data-step="cut"] textarea', 'ab');
        yield* evaluates(
          page,
          `window.__indexGo !== null && window.__indexGo === document.querySelector('.ak-index-go[data-step="cut"]')`,
          true,
        );
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* fitsPhone(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a Board still opens full size on an ask, its place in the link, and Escape or a tap closes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview([...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: PHONE,
        });
        const thumb = '.ak-step[data-step="board"] [data-panel="open.breath"] .rv-zoom';
        yield* waitFor(page, thumb);
        for (const close of ['key', 'tap'] as const) {
          yield* page.click(thumb);
          yield* textIs(page, '.rv-lightbox .rv-lightbox-caption', 'open · breath');
          // Its caption sits under the still, inside the screen.
          yield* until(
            page,
            `(() => {
              const still = document.querySelector('.rv-lightbox img').getBoundingClientRect();
              const caption = document.querySelector('.rv-lightbox-caption').getBoundingClientRect();
              return caption.top - still.bottom <= 12 && caption.bottom <= innerHeight;
            })()`,
          );
          yield* until(page, "location.search === '?still=board-open.breath'");
          if (close === 'key') yield* page.press('Escape');
          else yield* page.click('.rv-lightbox');
          yield* until(page, "document.querySelector('.rv-lightbox') === null");
          yield* until(page, "location.search === ''");
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a laptop a Board still's caption sits clear above the dimmed dock under the scrim",
    () =>
      Effect.gen(function* () {
        // A still at a Board's own size, taller than the window can show whole.
        const tall = route('GET', /^\/api\/films\/toy\/board\/files\/open\.breath\.1\.png$/, () =>
          file(STILL_1080),
        );
        const { page, errors } = yield* openReview([tall, ...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: DESK,
        });
        const thumb = '.ak-step[data-step="board"] [data-panel="open.breath"] .rv-zoom';
        yield* waitFor(page, thumb);
        yield* page.click(thumb);
        yield* textIs(page, '.rv-lightbox .rv-lightbox-caption', 'open · breath');
        yield* until(
          page,
          `(() => {
            const still = document.querySelector('.rv-lightbox img').getBoundingClientRect();
            const caption = document.querySelector('.rv-lightbox-caption').getBoundingClientRect();
            const dock = document.querySelector('.ak-send').getBoundingClientRect();
            return still.height > 0 && caption.top - still.bottom <= 12 && dock.top - caption.bottom >= 8;
          })()`,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
