// The cue strip and the inspector in a browser, over the probe film with the
// lab API faked: a cue's body dragged writes its offset once, on release, and
// selects it in the URL; a write the server refuses shows the server's own
// text; a cue whose dragged field is computed says so and writes nothing; the
// inspector's fields and eases write the selected cue; Undo asks the server
// to undo; and the findings of the film's check show under the inspector.

import { Effect, Option, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { SourceRefused } from '../../core/refusals.ts';
import { type Asked, hold, json, openLab, refused, route, sourceOne } from '../fixtures/harness.ts';

const posted = (asked: ReadonlyArray<Asked>) =>
  asked.filter((a) => a.method === 'POST').map((a) => ({ path: a.path, body: a.body }));

const statusOf = (page: Page) =>
  Effect.promise(() => page.textContent('.lab-edit-status')).pipe(
    Effect.map((t) => Option.getOrElse(Option.fromNullishOr(t), () => '')),
  );

/** Wait until the status line reads something containing `part`. */
const statusSays = (page: Page, part: string) =>
  Effect.promise(() =>
    page.waitForFunction(
      (want) => (document.querySelector('.lab-edit-status')?.textContent ?? '').includes(want),
      part,
    ),
  );

/** Wait until the lab has posted `n` writes. */
const postedReach = (asked: ReadonlyArray<Asked>, n: number) =>
  Effect.sync(() => posted(asked).length).pipe(
    Effect.repeat({ until: (k) => k >= n, schedule: Schedule.spaced('10 millis') }),
    Effect.timeout('10 seconds'),
    Effect.orDie,
  );

/**
 * Run the page's clock on by `ms`: its timers and frames run that much,
 * however slow the machine, so what a key or a drag would start has started.
 */
const runClock = (page: Page, ms: number) => Effect.promise(() => page.clock.runFor(ms));

/** Drag the bar of cue `name` by `dx` pixels from `at` across it (0 left edge, 0.5 middle, 1 right edge). */
const dragBar = (page: Page, name: string, at: number, dx: number) =>
  Effect.gen(function* () {
    const bar = page.locator(`.lab-cue[data-cue="${name}"]`);
    const box = yield* Effect.promise(() => bar.boundingBox());
    const b = yield* Effect.fromNullishOr(box);
    const x = b.x + Math.min(b.width - 2, Math.max(2, b.width * at));
    const y = b.y + b.height / 2;
    yield* Effect.promise(() => page.mouse.move(x, y));
    yield* Effect.promise(() => page.mouse.down());
    for (const step of [1, 2, 3, 4])
      yield* Effect.promise(() => page.mouse.move(x + (dx * step) / 4, y));
    yield* Effect.promise(() => page.mouse.up());
  }).pipe(Effect.orDie);

describe('the cue strip', () => {
  it.live('shows the scene under the playhead: its cues, by name', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-cue[data-cue="fall"]'));
      const cues = yield* Effect.promise(() =>
        page.$$eval('.lab-cue', (els) => els.map((e) => e.getAttribute('data-cue'))),
      );
      expect(cues).toEqual(['rise', 'fall']);
      const head = yield* Effect.promise(() => page.textContent('.lab-strip-head'));
      expect(head).toContain('scenes/one.ts');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a drag of a cue body writes its offset once, on release, and selects it', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-cue[data-cue="rise"]'));
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* statusSays(page, 'wrote scenes/one.ts');
      const writes = posted(asked);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.path).toBe('/cues/one/rise');
      expect(Option.getOrThrow(Option.fromUndefinedOr(writes[0])).body).toMatchObject(
        Option.some({ offset: expect.any(Number) }),
      );
      const search = yield* Effect.promise(() => page.evaluate(() => location.search));
      expect(search).toContain('sel=cue%3Aone%3Arise');
      const selected = yield* Effect.promise(() =>
        page.getAttribute('.lab-cue[data-cue="rise"]', 'class'),
      );
      expect(selected).toContain('selected');
    }).pipe(Effect.scoped),
  );

  it.live('a write the server refuses shows its text', () =>
    Effect.gen(function* () {
      const failure = SourceRefused.make({
        file: 'scenes/one.ts',
        target: 'cue rise offset',
        reason: 'rise has a computed offset',
      });
      const refusal = failure.message;
      const { page } = yield* openLab([route('POST', /^\/cues\//, () => refused(failure))], {
        hash: '#1',
      });
      yield* Effect.promise(() => page.waitForSelector('.lab-cue[data-cue="rise"]'));
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* statusSays(page, refusal);
      expect(yield* statusOf(page)).toBe(refusal);
    }).pipe(Effect.scoped),
  );

  it.live('a cue whose dragged field is computed says so, and writes nothing', () =>
    Effect.gen(function* () {
      const computed = {
        ...sourceOne,
        cues: sourceOne.cues.map((c) => ({ ...c, dur: 'computed' })),
      };
      const { page, asked } = yield* openLab(
        [route('GET', /^\/scenes\/one\/source$/, () => json(computed))],
        { hash: '#1' },
      );
      yield* Effect.promise(() => page.waitForSelector('.lab-cue[data-cue="rise"]'));
      yield* Effect.promise(() =>
        page.waitForFunction(() =>
          document.querySelector('.lab-strip-head')?.textContent?.includes('scenes/one.ts'),
        ),
      );
      yield* dragBar(page, 'rise', 1, 30);
      yield* statusSays(page, 'cannot drag rise: its dur is computed in the source');
      expect(posted(asked)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('one write at a time', () => {
  it.live('Escape during a drag puts the cue back and writes nothing', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#1' });
      const bar = page.locator('.lab-cue[data-cue="rise"]');
      yield* Effect.promise(() => bar.waitFor());
      const box = yield* Effect.promise(() => bar.boundingBox()).pipe(
        Effect.flatMap(Effect.fromNullishOr),
        Effect.orDie,
      );
      const y = box.y + box.height / 2;
      const x = box.x + box.width / 2;
      yield* Effect.promise(() => page.mouse.move(x, y));
      yield* Effect.promise(() => page.mouse.down());
      yield* Effect.promise(() => page.mouse.move(x + 60, y, { steps: 4 }));
      yield* Effect.promise(() => page.keyboard.press('Escape'));
      yield* Effect.promise(() => page.mouse.up());
      yield* runClock(page, 200);
      expect(posted(asked)).toEqual([]);
      const after = yield* Effect.promise(() => bar.boundingBox()).pipe(
        Effect.flatMap(Effect.fromNullishOr),
        Effect.orDie,
      );
      expect(Math.round(after.x)).toBe(Math.round(box.x));
    }).pipe(Effect.scoped),
  );

  it.live('a drag while a write is out is not taken', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([route('POST', /^\/cues\//, () => hold)], {
        hash: '#1',
      });
      yield* Effect.promise(() => page.waitForSelector('.lab-cue[data-cue="rise"]'));
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* postedReach(asked, 1);
      yield* statusSays(page, 'writing…');
      yield* dragBar(page, 'fall', 0.5, 40);
      yield* runClock(page, 200);
      expect(posted(asked).map((p) => p.path)).toEqual(['/cues/one/rise']);
    }).pipe(Effect.scoped),
  );
});

describe('the inspector', () => {
  it.live('its offset field and its eases write the selected cue', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { query: '&sel=cue:one:rise', hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-edit-cue input[data-field="offset"]'));
      yield* Effect.promise(() => page.fill('.lab-edit-cue input[data-field="offset"]', '0.3'));
      yield* Effect.promise(() => page.press('.lab-edit-cue input[data-field="offset"]', 'Enter'));
      yield* statusSays(page, 'wrote');
      yield* Effect.promise(() => page.click('.lab-ease[data-ease="linear"]'));
      yield* postedReach(asked, 2);
      expect(posted(asked)).toEqual([
        { path: '/cues/one/rise', body: Option.some({ offset: 0.3 }) },
        { path: '/cues/one/rise', body: Option.some({ ease: 'linear' }) },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('Undo asks the server to undo, and says what it undid', () =>
    Effect.gen(function* () {
      const report = {
        findings: [{ level: 'warning', tag: 'late', message: 'rise ends after the scene' }],
        undo: { scene: 'one', file: 'scenes/one.ts', target: 'cue rise offset' },
      };
      const { page, asked } = yield* openLab(
        [
          route('GET', /^\/check$/, () => json(report)),
          route('POST', /^\/undo$/, () =>
            json({
              scene: 'one',
              file: 'scenes/one.ts',
              target: 'undo cue rise offset',
              findings: [],
            }),
          ),
        ],
        { hash: '#1' },
      );
      yield* Effect.promise(() => page.waitForSelector('.lab-finding'));
      const finding = yield* Effect.promise(() => page.textContent('.lab-finding'));
      expect(finding).toBe('late rise ends after the scene');
      yield* Effect.promise(() => page.click('.lab-edit button[data-act="undo"]:not([disabled])'));
      yield* statusSays(page, 'undid cue rise offset in scenes/one.ts');
      expect(posted(asked)).toEqual([{ path: '/undo', body: Option.some({}) }]);
    }).pipe(Effect.scoped),
  );
});
