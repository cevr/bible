// The phone-fit measure (`fixtures/phone-fit.ts`, G12) over synthetic pages,
// each one way a page can fail a phone, which it must refuse, beside one
// that fits: a block wider than the window scrolls sideways, a control the
// page fixes past the window's side is outside, and a sticky header taller
// than a quarter of the window is too much chrome. `fitsPhone`, the wait the
// page tests run, passes the page that fits and fails one that does not,
// naming each way it fails.

import { Cause, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { FITS, PHONE_FIT, fitsPhone } from '../../../src/lab/fixtures/phone-fit.ts';
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

/** What the measure answers on a phone's window whose body is `body`: `fits`, and `part` of `PHONE_FIT`. */
const measured = (
  body: string,
  fits: boolean,
  part: string,
  want: number | ReadonlyArray<number | string>,
) =>
  Effect.gen(function* () {
    const tab = yield* phonePage(body);
    yield* evaluates(tab, `(({ sideways, outside, chrome }) => ${part})(${PHONE_FIT})`, want);
    yield* evaluates(tab, FITS, fits);
  }).pipe(Effect.scoped);

const SLIM = `<header style="position:sticky;top:0;height:44px"><button data-act="go">go</button></header><div class="page"></div>`;
const WIDE = `<div style="width:600px;height:10px"></div>`;
const FAR = `<button data-act="far" style="position:fixed;left:370px;top:400px">far</button>`;
const TALL = `<header style="position:sticky;top:0;height:300px"></header><div class="page"></div>`;

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

  it.live('refuses a sticky header taller than a quarter of the window', () =>
    measured(TALL, false, 'chrome', 300 / 844),
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
        const exit = yield* Effect.exit(fitsPhone(yield* phonePage(`${WIDE}${FAR}${TALL}`)));
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
