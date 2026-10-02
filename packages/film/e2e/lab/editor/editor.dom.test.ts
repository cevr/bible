// The cue strip and the inspector in a browser, over the probe film with the
// lab API faked: a cue's body dragged writes its offset once, on release, and
// selects it in the URL; a write the server refuses shows the server's own
// text; a cue whose dragged field is computed says so and writes nothing; the
// inspector's fields and eases write the selected cue; Undo asks the server
// to undo; and the findings of the film's check show under the inspector.

import { Effect, Option, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import { SourceRefused } from '../../../src/core/refusals.ts';
import {
  type Asked,
  hold,
  json,
  openLab,
  refused,
  route,
  sourceOne,
} from '../../../src/lab/fixtures/harness.ts';
import {
  attributeIs,
  attributesAre,
  evaluates,
  textHas,
  textIs,
} from '../../../src/lab/fixtures/settled.ts';

const posted = (asked: ReadonlyArray<Asked>) =>
  asked.filter((a) => a.method === 'POST').map((a) => ({ path: a.path, body: a.body }));

/** Wait until the status line reads something containing `part`. */
const statusSays = (page: Tab, part: string) => textHas(page, '.lab-edit-status', part);

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
const runClock = (page: Tab, ms: number) => page.clock.runFor(ms);

/**
 * Wait until cue `rise` is on the strip and its scene's source has come: the
 * cues draw from the film, and a drag before the source is in says "cannot
 * edit: no source for this scene" and writes nothing.
 */
const editable = (page: Tab) =>
  Effect.gen(function* () {
    yield* page.waitFor('.lab-cue[data-cue="rise"]');
    yield* textHas(page, '.lab-strip-head', 'scenes/one.ts');
  });

/** Drag the bar of cue `name` by `dx` pixels from `at` across it (0 left edge, 0.5 middle, 1 right edge). */
const dragBar = (page: Tab, name: string, at: number, dx: number) =>
  Effect.gen(function* () {
    const b = yield* page.box(`.lab-cue[data-cue="${name}"]`);
    const x = b.x + Math.min(b.width - 2, Math.max(2, b.width * at));
    const y = b.y + b.height / 2;
    yield* page.mouse.move(x, y);
    yield* page.mouse.down;
    for (const step of [1, 2, 3, 4]) yield* page.mouse.move(x + (dx * step) / 4, y);
    yield* page.mouse.up;
  });

describe('the cue strip', () => {
  it.live('shows the scene under the playhead: its cues, by name', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { hash: '#1' });
      yield* page.waitFor('.lab-cue[data-cue="fall"]');
      yield* attributesAre(page, '.lab-cue', 'data-cue', ['rise', 'fall']);
      yield* textHas(page, '.lab-strip-head', 'scenes/one.ts');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a drag of a cue body writes its offset once, on release, and selects it', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#1' });
      yield* editable(page);
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* statusSays(page, 'wrote scenes/one.ts');
      const writes = posted(asked);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.path).toBe('/scenes/one/cues/rise');
      expect(Option.getOrThrow(Option.fromUndefinedOr(writes[0])).body).toMatchObject(
        Option.some({ offset: expect.any(Number) }),
      );
      yield* evaluates(page, "location.search.includes('sel=cue%3Aone%3Arise')", true);
      yield* attributeIs(page, '.lab-cue[data-cue="rise"]', 'class', /\bselected\b/);
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
      const { page } = yield* openLab(
        [route('POST', /^\/scenes\/\w+\/cues\//, () => refused(failure))],
        {
          hash: '#1',
        },
      );
      yield* editable(page);
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* textIs(page, '.lab-edit-status', refusal);
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
      yield* editable(page);
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
      const bar = '.lab-cue[data-cue="rise"]';
      yield* editable(page);
      const box = yield* page.box(bar);
      const y = box.y + box.height / 2;
      const x = box.x + box.width / 2;
      yield* page.mouse.move(x, y);
      yield* page.mouse.down;
      yield* page.mouse.move(x + 60, y, 4);
      yield* page.press('Escape');
      yield* page.mouse.up;
      yield* runClock(page, 200);
      expect(posted(asked)).toEqual([]);
      const after = yield* page.box(bar);
      expect(Math.round(after.x)).toBe(Math.round(box.x));
    }).pipe(Effect.scoped),
  );

  it.live(
    'a drag the browser ends (a page pan) puts the cue back, and a later move and lift write nothing',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab([], { hash: '#1' });
        const bar = '.lab-cue[data-cue="rise"]';
        yield* editable(page);
        const box = yield* page.box(bar);
        const y = box.y + box.height / 2;
        const x = box.x + box.width / 2;
        yield* page.mouse.move(x, y);
        yield* page.mouse.down;
        yield* page.mouse.move(x + 60, y, 4);
        yield* page.evaluate(
          `document.querySelector('${bar}').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })); true`,
        );
        yield* page.mouse.move(x + 90, y, 4);
        yield* page.mouse.up;
        yield* runClock(page, 200);
        expect(posted(asked)).toEqual([]);
        const after = yield* page.box(bar);
        expect(Math.round(after.x)).toBe(Math.round(box.x));
      }).pipe(Effect.scoped),
  );

  for (const lifted of ['after', 'before'] as const)
    it.live(
      `a second pointer pressing a knob does not take the held cue: lifted ${lifted} the first is cancelled, it lands nothing, and the cancel puts the cue back`,
      () =>
        Effect.gen(function* () {
          const { page, asked, errors } = yield* openLab([], { hash: '#1' });
          const rise = '.lab-cue[data-cue="rise"]';
          const spot = '.lab-handle[data-knob="spot"]';
          yield* editable(page);
          yield* page.waitFor(spot);
          const box = yield* page.box(rise);
          const handle = yield* page.box(spot);
          const y = box.y + box.height / 2;
          const x = box.x + box.width / 2;
          // Pointer 1 (the mouse) grabs rise and moves it.
          yield* page.mouse.move(x, y);
          yield* page.mouse.down;
          yield* page.mouse.move(x + 60, y, 4);
          // Pointer 2 presses the spot knob's handle while rise is held, and
          // lifts before or after the browser takes pointer 1 (a page pan).
          // Each is its own task, as a browser sends them.
          const second = `{ bubbles: true, pointerId: 2, isPrimary: false, pointerType: 'touch', button: 0, clientX: ${Math.round(handle.x + handle.width / 2)}, clientY: ${Math.round(handle.y + handle.height / 2)} }`;
          const step = (script: string) =>
            Effect.andThen(page.evaluate(`${script}; true`), runClock(page, 50));
          const liftSecond = step(
            `document.querySelector('${spot}').dispatchEvent(new PointerEvent('pointerup', ${second}))`,
          );
          yield* step(
            `document.querySelector('${spot}').dispatchEvent(new PointerEvent('pointerdown', ${second}))`,
          );
          if (lifted === 'before') yield* liftSecond;
          yield* step(
            `document.querySelector('${rise}').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))`,
          );
          if (lifted === 'after') yield* liftSecond;
          yield* page.mouse.up;
          yield* runClock(page, 200);
          expect(posted(asked)).toEqual([]);
          const after = yield* page.box(rise);
          expect(Math.round(after.x)).toBe(Math.round(box.x));
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
    );

  it.live('a drag while a write is out is not taken', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab(
        [route('POST', /^\/scenes\/\w+\/cues\//, () => hold)],
        {
          hash: '#1',
        },
      );
      yield* editable(page);
      yield* dragBar(page, 'rise', 0.5, 60);
      yield* postedReach(asked, 1);
      yield* statusSays(page, 'writing…');
      yield* dragBar(page, 'fall', 0.5, 40);
      yield* runClock(page, 200);
      expect(posted(asked).map((p) => p.path)).toEqual(['/scenes/one/cues/rise']);
    }).pipe(Effect.scoped),
  );
});

describe('the inspector', () => {
  it.live('its offset field and its eases write the selected cue', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { query: '&sel=cue:one:rise', hash: '#1' });
      // Enabled once the scene's source has come.
      yield* page.waitFor('.lab-edit-cue input[data-field="offset"]:not([disabled])');
      yield* page.fill('.lab-edit-cue input[data-field="offset"]', '0.3');
      yield* page.pressIn('.lab-edit-cue input[data-field="offset"]', 'Enter');
      yield* statusSays(page, 'wrote');
      yield* page.click('.lab-ease[data-ease="linear"]');
      yield* postedReach(asked, 2);
      expect(posted(asked)).toEqual([
        { path: '/scenes/one/cues/rise', body: Option.some({ offset: 0.3 }) },
        { path: '/scenes/one/cues/rise', body: Option.some({ ease: 'linear' }) },
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
      yield* page.waitFor('.lab-finding');
      yield* textIs(page, '.lab-finding', 'late rise ends after the scene');
      yield* page.click('.lab-edit button[data-act="undo"]:not([disabled])');
      yield* statusSays(page, 'undid cue rise offset in scenes/one.ts');
      expect(posted(asked)).toEqual([{ path: '/undo', body: Option.some({}) }]);
    }).pipe(Effect.scoped),
  );
});
