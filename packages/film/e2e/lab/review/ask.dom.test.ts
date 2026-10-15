// An agent's ask (`/asks/<id>`) on a phone, over the toy's ask (a choice of
// three takes; the slow one asks why): the step's choice sends its answer,
// the next step's free text keeps every keystroke and sends its words, and
// the end shows every answer; the free text, optional (its flag, not its
// label, says so), sends with nothing in it and the end says it was
// skipped; an answer the lab refuses (the laptop answered first) reads the
// ask again, where it now is, and says why.

import { Boolean as Bool, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { AskRefused } from '../../../src/core/refusals.ts';
import {
  type Asked,
  type FakeRoute,
  PHONE,
  json,
  openReview,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { textHas, waitFor } from '../../../src/lab/fixtures/settled.ts';
import { STUDIO_ASK, askRecordWith, studioRoutes } from '../../../src/lab/fixtures/studio-film.ts';
import { ASK_READY, SLOW } from '../studio-states.ts';

const ANSWER = new RegExp(`^/api/asks/${STUDIO_ASK}/answer$`);
const slow = { kind: 'choose', value: 'slow', label: 'Slow' };
const words = 'It breathes before the cut, so the turn lands.';
const pick = { step: 'pick', values: { take: 'slow' }, at: '2026-10-14T00:01:00.000Z' };
const atWhy = askRecordWith({ _tag: 'Asking', step: 'why', answers: { take: slow } }, [pick]);
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
    'a choice, then the words it asks for, each step sent; the end shows every answer',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(
              Bool.match(posted.length === 1, { onTrue: () => atWhy, onFalse: () => done }),
            );
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        yield* textHas(page, '.ak-outcome [data-answer="take"]', 'Slow');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          { step: 'pick', values: { take: 'slow' } },
          { step: 'why', values: { why: words } },
        ]);
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
            return json(
              Bool.match(posted.length === 1, { onTrue: () => atWhy, onFalse: () => skipped }),
            );
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* page.click(ASK_READY);
        yield* textHas(
          page,
          '.ak-step[data-step="why"] .ak-legend',
          'Why the slow one? (optional)',
        );
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', 'Skipped');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          { step: 'pick', values: { take: 'slow' } },
          { step: 'why', values: {} },
        ]);
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
});
