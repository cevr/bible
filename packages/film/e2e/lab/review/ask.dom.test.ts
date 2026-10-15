// An agent's ask (`/asks/<id>`) on a phone, one page, over the toy's ask (a
// choice of three takes; the slow one asks why): the choice of the slow one
// brings its why section onto the same page, whose free text keeps every
// keystroke, and one Send sends both sections, the end showing every
// answer; the free text, optional (its flag, not its label, says so), sends
// with nothing in it and the end says it was skipped; an answer the lab
// refuses (the laptop answered first) reads the ask again, where it now is,
// and says why; a Send with a question open sends nothing, goes to it, marks
// it and says what it needs. A guided review shows each section's material
// in place (the draft's script, named, with its takes and its marks, Stress
// written into the draft; the Board's panels; a real 1280×720 cut in the
// review's player, the page no wider for it; the take; the set's notes),
// headed `n of N · Title` and indexed, the recommended option first and
// marked, the send counting what is answered, the kit's primary Send, one
// focus ring on an option, and fits a phone. A film's script under review is
// its Script reader too: Stress writes `script.ts`, which is read again. A
// long document is held at its clamp with Read all, which opens it whole; a
// Board still opens full size (`?still=`), and Escape or a tap closes it.

import { Boolean as Bool, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { AskRefused } from '../../../src/core/refusals.ts';
import {
  type Asked,
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
/** A real H.264 take at 1280×720: the size of a render's. */
const HD_720 = new URL('../../../src/tools/fixtures/hd-720.mp4', import.meta.url).pathname;
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
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        yield* textHas(page, '.ak-outcome [data-answer="take"]', 'Slow');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([sections({ why: words })]);
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
        yield* textHas(
          page,
          '.ak-field[data-answer="take"] .ak-unanswered',
          'Which take? needs a choice',
        );
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
        const said = (say: string) => ({
          film: STUDIO_FILM,
          beats: [{ id: '1', say, cite: ['Gen 2:7'] }],
        });
        let reads = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            reads += 1;
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
        yield* evaluates(
          page,
          `document.querySelector('.lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]').dataset.stress`,
          'true',
        );
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            spoken: 'The first thing God gave was breath.',
            marks: [
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
        expect(reads).toBeGreaterThan(1);
        yield* fitsPhone(page);
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
            spoken: 'The first thing God gave was breath.',
            marks: [
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
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
        for (const step of ['script', 'board', 'cut'])
          yield* page.click(`.ak-step[data-step="${step}"] .ak-option[data-value="keep"]`);
        yield* textHas(page, '.ak-send [data-role="answered"]', '3 of 3 answered');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-outcome');
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
    'a long document is clamped near its question, and Read all opens it whole',
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
        yield* page.click(`${doc} [data-act="read-all"]`);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* countIs(page, `${doc} [data-act="read-all"]`, 0);
        yield* evaluates(
          page,
          `((c) => c.scrollHeight <= c.clientHeight + 1)(document.querySelector('${doc} .ak-clamp'))`,
          true,
        );
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
});
