// The Compare section in a browser, over the probe film with the lab API
// faked: a wipe shows HEAD's frame left of a divider the pointer drags, and
// says which file it read; a blink flips HEAD's frame in and out; a scene
// HEAD cannot give says the server's reason, and HEAD's timeline that does
// not resolve on today's narration says why; a reload keeps the mode.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HeadUnavailable } from '../../core/refusals.ts';
import { json, openLab, refused, route } from '../fixtures/harness.ts';
import { evaluates, textHas } from '../fixtures/settled.ts';
import { type Tab, jsonOf } from '../fixtures/tab.ts';

const compareSays = (page: Tab, part: string) => textHas(page, '.lab-compare-status', part);

const click = (page: Tab, selector: string) => page.click(selector);

/** Wait until HEAD's layer is clipped to `want`: the layer is painted on the next animation frame. */
const clipIs = (page: Tab, want: string) =>
  page.until(`document.querySelector('canvas.lab-compare')?.style.clipPath === ${jsonOf(want)}`);

describe('compare with HEAD', () => {
  it.live('a wipe shows HEAD left of a divider the pointer drags', () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], { hash: '#1' });
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

  it.live("a blink flips HEAD's frame in and out", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1' });
      yield* page.waitFor('.lab-compare-tools [data-mode="blink"]');
      yield* click(page, '.lab-compare-tools [data-mode="blink"]');
      yield* page.waitFor('canvas.lab-compare:not([hidden])');
      yield* page.attached('canvas.lab-compare[hidden]');
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
        { hash: '#1' },
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
        { hash: '#1' },
      );
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, "one: HEAD's timeline does not resolve now: ");
      yield* compareSays(page, '{soar}');
      yield* evaluates(page, "document.querySelector('canvas.lab-compare')?.hidden", true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a reload keeps the mode', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1' });
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"]');
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'at HEAD');
      yield* page.reload;
      yield* page.waitFor('.lab-compare-tools [data-mode="wipe"].on');
      yield* compareSays(page, 'at HEAD');
    }).pipe(Effect.scoped),
  );
});
