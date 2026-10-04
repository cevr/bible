// The Compare section in a browser, over the probe film with the lab API
// faked: a wipe shows HEAD's frame left of a divider the pointer drags, and
// says which file it read; a blink flips HEAD's frame in and out; a scene
// HEAD cannot give says the server's reason, and HEAD's timeline that does
// not resolve on today's narration says why; turned off and on, it reads
// HEAD again; a reload keeps the mode. A diff lays HEAD over the frame in
// the difference blend; the mode rides in the link (`?view=`), each pick an
// entry Back walks, and a link that names one opens in it; in a blink a press held
// on the frame holds HEAD until it lifts (PA-9).

import { Effect, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HeadUnavailable } from '../../../src/core/refusals.ts';
import { json, labAt, openLab, refused, route } from '../../../src/lab/fixtures/harness.ts';
import { evaluates, textHas } from '../../../src/lab/fixtures/settled.ts';
import { type Tab, jsonOf } from '../../../src/lab/fixtures/tab.ts';
import { BLINK_MS } from '../../../src/lab/compare/machine.ts';

const compareSays = (page: Tab, part: string) => textHas(page, '.lab-compare-status', part);

const click = (page: Tab, selector: string) => page.click(selector);

/** Wait until HEAD's layer is clipped to `want`: the layer is painted on the next animation frame. */
const clipIs = (page: Tab, want: string) =>
  page.until(`document.querySelector('canvas.lab-compare')?.style.clipPath === ${jsonOf(want)}`);

describe('compare with HEAD', () => {
  it.live('a wipe shows HEAD left of a divider the pointer drags', () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], { href: labAt(1), mode: 'compare' });
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'scenes/one.ts at HEAD');
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
      yield* clipIs(page, 'inset(0px 50% 0px 0px)');
      const grip = yield* page.box('.lab-divider circle');
      const frame = yield* page.box('.lab-overlay');
      const x = grip.x + grip.width / 2;
      const y = grip.y + grip.height / 2;
      yield* page.mouse.move(x, y);
      yield* page.mouse.down;
      yield* page.mouse.move(frame.x + frame.width * 0.25, y, 4);
      yield* page.mouse.up;
      yield* clipIs(page, 'inset(0px 75% 0px 0px)');
      expect(asked.filter((a) => a.path === '/scenes/one/head')).toHaveLength(1);
      expect(asked.filter((a) => a.path === '/notes' && a.method === 'POST')).toEqual([]);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('turned off and on again, it reads HEAD again: a commit made since shows', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { href: labAt(1), mode: 'compare' });
      const headReads = () => asked.filter((a) => a.path === '/scenes/one/head').length;
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'at HEAD');
      yield* click(page, '.lab-compare-tools [data-mode="off"]');
      yield* page.attached('canvas.lab-compare[hidden]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* Effect.sync(headReads).pipe(
        Effect.repeat({ until: (n) => n >= 2, schedule: Schedule.spaced('10 millis'), times: 500 }),
      );
      expect(headReads()).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.live("a blink flips HEAD's frame in and out", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1), mode: 'compare' });
      yield* page.waitFor('.lab-compare-tools [data-mode="blink"]');
      yield* click(page, '.lab-compare-tools [data-mode="blink"]');
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
      yield* page.clock.fastForward(BLINK_MS);
      yield* page.attached('canvas.lab-compare[hidden]');
      yield* page.clock.fastForward(BLINK_MS);
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
    }).pipe(Effect.scoped),
  );

  it.live("a scene HEAD cannot give says the server's reason", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(
        [
          route('GET', /^\/scenes\/one\/head$/, () =>
            refused(HeadUnavailable.make({ file: 'scenes/one.ts', reason: 'not in git' })),
          ),
        ],
        { href: labAt(1), mode: 'compare' },
      );
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'one: scenes/one.ts: no HEAD version to compare with: not in git');
      yield* evaluates(page, "document.querySelector('canvas.lab-compare')?.hidden", true);
    }).pipe(Effect.scoped),
  );

  it.live("HEAD's timeline that does not resolve now says why and draws no layer", () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab(
        [
          // HEAD cued a mark today's narration no longer has.
          route('GET', /^\/scenes\/one\/head$/, () =>
            json({
              scene: 'one',
              file: 'scenes/one.ts',
              timeline: { rise: { mark: 'soar', dur: 0.6 } },
              knobs: {},
              codeChanged: false,
              sameData: false,
            }),
          ),
        ],
        { href: labAt(1), mode: 'compare' },
      );
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, "one: HEAD's timeline does not resolve now: ");
      yield* compareSays(page, '{soar}');
      yield* evaluates(page, "document.querySelector('canvas.lab-compare')?.hidden", true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live(
    'a diff lays HEAD over the frame in the difference blend; each mode picked is an entry, and Back walks them',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([], { href: labAt(1), mode: 'compare' });
        yield* page.waitFor('.lab-compare-tools [data-mode="diff"]');
        // The entries the page opened with: each mode the owner picks adds one.
        yield* page.until('(globalThis.openedWith = history.length) > 0');
        const view = "new URLSearchParams(location.search).get('view')";
        const blend = "document.querySelector('canvas.lab-compare')?.style.mixBlendMode";
        yield* click(page, '.lab-compare-tools [data-mode="diff"]');
        yield* compareSays(page, 'at HEAD');
        yield* page.waitFor('canvas.lab-compare:not([hidden])');
        yield* page.until(`${blend} === 'difference'`);
        // Whole, not clipped to a divider.
        yield* clipIs(page, '');
        yield* page.until(`${view} === 'diff'`);
        yield* evaluates(page, 'history.length - globalThis.openedWith', 1);
        yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
        yield* page.until(`${blend} === 'normal'`);
        yield* page.until(`${view} === 'wipe'`);
        yield* evaluates(page, 'history.length - globalThis.openedWith', 2);
        // Back walks the views: the diff, then the lab as it opened.
        yield* page.back;
        yield* page.until(`${view} === 'diff'`);
        yield* page.waitFor('.lab-compare-tools [data-mode="diff"].on');
        yield* page.until(`${blend} === 'difference'`);
        yield* page.back;
        yield* page.until(`${view} === null`);
        yield* page.waitFor('.lab-compare-tools [data-mode="off"].on');
        // A mode picked again where the link already says it adds no entry.
        yield* click(page, '.lab-compare-tools [data-mode="off"]');
        yield* evaluates(page, 'history.length - globalThis.openedWith', 2);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live('a link that names a mode opens in it', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], {
        href: labAt(1, { view: 'diff' }),
        mode: 'compare',
      });
      yield* page.waitFor('.lab-compare-tools [data-mode="diff"].on');
      yield* page.until(
        `document.querySelector('canvas.lab-compare')?.style.mixBlendMode === 'difference'`,
      );
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('in a blink, a press held on the frame holds HEAD; its lift shows now', () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], {
        href: labAt(1, { view: 'blink' }),
        mode: 'compare',
      });
      yield* page.waitFor('.lab-compare-tools [data-mode="blink"].on');
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
      const frame = yield* page.box('.lab-hold');
      yield* page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
      yield* page.mouse.down;
      // Held, the timed flip waits: HEAD stays.
      yield* page.clock.fastForward(BLINK_MS * 3);
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
      yield* page.mouse.up;
      yield* page.attached('canvas.lab-compare[hidden]');
      // The press was the blink's, never a note's.
      expect(asked.filter((a) => a.path === '/notes' && a.method === 'POST')).toEqual([]);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a reload keeps the mode', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1), mode: 'compare' });
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'at HEAD');
      yield* page.reload;
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"].on');
      yield* compareSays(page, 'at HEAD');
    }).pipe(Effect.scoped),
  );
});
