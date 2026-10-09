// The phone-fit measure (`fixtures/phone-fit.ts`) over synthetic pages,
// each one way a page can fail a phone, which it must refuse, beside one
// that fits: a block wider than the window scrolls sideways, a control the
// page fixes past the window's side is outside, and a sticky header taller
// than a quarter of the window is too much chrome. An open sheet is chrome
// (the sheet, not the see-through frame it stands in; lowered, its peek)
// unless named the page's layer, whose controls are still kept inside the
// width. `fitsPhone`, the wait the
// page tests run, passes the page that fits and fails one that does not,
// naming each way it fails.

import { Cause, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { fits as fitsOf, fitsPhone, phoneFit } from '../../../src/lab/fixtures/phone-fit.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** A tab on a phone's window (390 × 844) whose body is `body`. */
const phonePage = (body: string) =>
  Effect.gen(function* () {
    const html = `<!doctype html><html><head><style>
      body { margin: 0; font: 13px/16px monospace; }
      button { all: unset; display: block; box-sizing: border-box; width: 44px; height: 44px; }
      .page { height: 3000px; }
    </style></head><body>${body}</body></html>`;
    const tab = yield* openTab({
      width: 390,
      height: 844,
      microphone: false,
      init: [],
      assets: [],
      serve: servePaths({ '/': respond(html, 'text/html') }),
    });
    yield* tab.goto('/');
    return tab;
  });

/**
 * What the measure answers on a phone's window whose body is `body`, with
 * `layer` open when given: `fits`, and `part` of `phoneFit`.
 */
const measured = (
  body: string,
  fits: boolean,
  part: string,
  want: number | ReadonlyArray<number | string>,
  layer?: string,
) =>
  Effect.gen(function* () {
    const tab = yield* phonePage(body);
    yield* evaluates(tab, `(({ sideways, outside, chrome }) => ${part})(${phoneFit(layer)})`, want);
    yield* evaluates(tab, fitsOf(layer), fits);
  }).pipe(Effect.scoped);

const SLIM = `<header style="position:sticky;top:0;height:44px"><button data-act="go">go</button></header><div class="page"></div>`;
const WIDE = `<div style="width:600px;height:10px"></div>`;
const FAR = `<button data-act="far" style="position:fixed;left:370px;top:400px">far</button>`;
const TALL = `<header style="position:sticky;top:0;height:300px"></header><div class="page"></div>`;
/** A sheet in a frame over the whole window, as a dialog's viewport holds it. */
const SHEET = `<div class="page"></div><div class="frame" style="position:fixed;inset:0;pointer-events:none"><div data-role="sheet" style="position:absolute;left:0;bottom:0;width:390px;height:500px"><button data-act="close">close</button></div></div>`;
/** A sheet lowered to its one line, fixed in its see-through frame, as the Lab's selection peeks. */
const PEEK = `<div class="page"></div><div class="frame" style="position:fixed;inset:0;pointer-events:none"><div data-role="sheet" style="position:fixed;left:0;bottom:117px;width:390px;height:69px;pointer-events:auto"></div></div>`;

describe('the phone-fit measure', () => {
  it.live('passes a page within the width, its control inside it, its header slim', () =>
    measured(SLIM, true, 'chrome', 44 / 844),
  );

  it.live('refuses a block wider than the window: the page scrolls sideways', () =>
    measured(WIDE, false, 'sideways', 210),
  );

  it.live('refuses a control fixed past the window, which scrolls nothing sideways', () =>
    measured(FAR, false, 'outside.concat(sideways)', ['far 370..414', 0]),
  );

  it.live(
    'refuses a control wholly clipped by a box that clips and never scrolls, and passes one a strip scrolled away',
    () =>
      Effect.gen(function* () {
        const row = (overflow: string) =>
          `<div style="overflow:${overflow};width:200px;height:50px"><div style="width:600px"><button data-act="near">near</button><button data-act="away" style="margin-left:300px">away</button></div></div>`;
        yield* measured(row('hidden'), false, 'outside', ['away cut off']);
        yield* measured(row('clip'), false, 'outside', ['away cut off']);
        yield* measured(row('auto'), true, 'outside', []);
        yield* measured(row('scroll'), true, 'outside', []);
        // Scrolling on one axis is no way to the other: x clips, only y scrolls.
        yield* measured(row('hidden auto'), false, 'outside', ['away cut off']);
        yield* measured(row('auto hidden'), true, 'outside', []);
      }),
  );

  it.live('refuses a sticky header taller than a quarter of the window', () =>
    measured(TALL, false, 'chrome', 300 / 844),
  );

  it.live(
    'refuses an open sheet as chrome, the sheet and not the frame it stands in, and takes it for a layer once named so',
    () =>
      Effect.gen(function* () {
        yield* measured(SHEET, false, 'chrome', 500 / 844);
        yield* measured(SHEET, true, 'chrome', 0, '[data-role="sheet"]');
      }),
  );

  it.live('counts a sheet lowered to a peek as its peek, the frame round it none', () =>
    measured(PEEK, true, 'chrome', 69 / 844),
  );

  it.live("refuses a layer's control past the window, its width measured as the page's", () =>
    measured(
      `<div data-role="sheet" style="position:fixed;left:0;bottom:0;width:390px;height:500px"><button data-act="past" style="margin-left:370px">past</button></div>`,
      false,
      'outside',
      ['past 370..414'],
      '[data-role="sheet"]',
    ),
  );
});

describe('fitsPhone', () => {
  it.live('passes a page that fits', () =>
    Effect.gen(function* () {
      yield* fitsPhone(yield* phonePage(SLIM));
    }).pipe(Effect.scoped),
  );

  it.live(
    'fails a page that does not fit once its wait is out, naming each way it fails',
    () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(fitsPhone(yield* phonePage(`${WIDE}${FAR}${TALL}`), '', 0));
        const said = Exit.match(exit, {
          onSuccess: () => 'fitsPhone passed it',
          onFailure: (cause) => Cause.pretty(cause),
        });
        expect(said).toContain('the page does not fit the window (chrome at most 0.25)');
        expect(said).toContain('"sideways":210');
        expect(said).toContain('far 370..414');
        // Under the wide block's 10 px row.
        expect(said).toContain('HEADER 10..310');
      }).pipe(Effect.scoped),
    30_000,
  );
});
