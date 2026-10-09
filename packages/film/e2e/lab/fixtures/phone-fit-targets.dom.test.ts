// The phone-fit measure (`fixtures/phone-fit.ts`) counts the controls the
// touch-target check counts (`TARGETS`, `fixtures/touch-targets.ts`), not only
// those that carry a `data-act`: a mode button pushed out of its strip, a tab
// past the window's side, and a number field cut off are each named, and a
// backing input a visible control keeps beside it is none.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { phoneFit } from '../../../src/lab/fixtures/phone-fit.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** What `outside` the measure answers on a phone's window (390 × 844) whose body is `body`. */
const outside = (body: string, want: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const html = `<!doctype html><html><head><style>
      body { margin: 0; font: 13px/16px monospace; }
      button, a, input { all: unset; display: block; box-sizing: border-box; width: 44px; height: 44px; }
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
    yield* evaluates(tab, `(({ outside }) => outside)(${phoneFit()})`, want);
  }).pipe(Effect.scoped);

describe('the phone-fit measure, over every touch target', () => {
  it.live('names a button pushed out of its strip, with no data-act on it', () =>
    outside(
      `<div style="overflow:hidden;width:200px;height:50px"><button style="transform:translateX(80px);margin-left:150px">record</button></div>`,
      ['button "record" cut off'],
    ),
  );

  it.live('names the same button by its data-act when it has one', () =>
    outside(
      `<div style="overflow:hidden;width:200px;height:50px"><button data-act="record" style="transform:translateX(80px);margin-left:150px">record</button></div>`,
      ['record cut off'],
    ),
  );

  it.live('names a tab and a field past the window, by what they are', () =>
    outside(
      `<div role="tab" tabindex="0" style="position:fixed;left:370px;top:100px;width:44px;height:44px">scenes</div>
       <input type="number" style="position:fixed;left:380px;top:200px">`,
      ['div "scenes" 370..414', 'input[type=number] "" 380..424'],
    ),
  );

  it.live(
    'passes a control inside the window, and a backing input and a link with no address',
    () =>
      outside(
        `<button>ok</button><a>not a link</a>
       <span aria-hidden="true"><input type="checkbox" tabindex="-1" style="position:fixed;left:380px;top:300px;width:1px;height:1px"></span>`,
        [],
      ),
  );
});
