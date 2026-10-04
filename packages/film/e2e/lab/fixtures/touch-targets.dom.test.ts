// The touch-target measure (`fixtures/touch-targets.ts`) over synthetic
// pages, each one shape it must read right: the usable area is what a tap
// reaches (a target half under a neighbour fails; a target whose middle is
// covered passes on the free part beside it), spacing looks at neighbours'
// hit-slops, a backing input is left out only when nothing of it can be seen
// or pressed, only a link on a line of text is inline, and a layer is
// measured within itself, its menu items as targets.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';
import { PHONE_HIT, undersizedTargets } from '../../../src/lab/fixtures/touch-targets.ts';

/** What the measure answers on a phone-wide page whose body is `body`, within `within` when given. */
const offenders = (body: string, want: ReadonlyArray<string>, within?: string) =>
  Effect.gen(function* () {
    const html = `<!doctype html><html><head><style>
      body { margin: 0; font: 13px/16px monospace; }
      button { all: unset; display: block; box-sizing: border-box; background: #ccc; }
      .at { position: absolute; }
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
    yield* evaluates(tab, undersizedTargets(PHONE_HIT, within), want);
  }).pipe(Effect.scoped);

describe('the touch-target measure', () => {
  it.live('passes a target a finger square', () =>
    offenders(
      `<button class="at" style="left:100px;top:100px;width:44px;height:44px">A</button>`,
      [],
    ),
  );

  it.live('fails a target whose area a neighbour overlaps across a corner', () =>
    offenders(
      `<button class="at" style="left:100px;top:100px;width:44px;height:44px">A</button>
       <button class="at" style="left:122px;top:122px;width:44px;height:44px">B</button>`,
      ['button.at "A" 44×44 □22'],
    ),
  );

  it.live('passes a target whose middle is covered, on a free 78 × 44 part beside it', () =>
    offenders(
      `<button class="at" style="left:50px;top:300px;width:200px;height:44px">wide</button>
       <div class="at" style="left:128px;top:300px;width:44px;height:44px;background:#000"></div>`,
      [],
    ),
  );

  it.live("fails a spaced target when a neighbour's hit-slop reaches into its circle", () =>
    offenders(
      `<style>.slop { position: absolute; } .slop::before { content: ''; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); }</style>
       <button class="at" style="left:100px;top:500px;width:30px;height:30px">T</button>
       <button class="slop" style="left:145px;top:505px;width:20px;height:20px">N</button>`,
      ['button.at "T" 30×30 □30'],
    ),
  );

  it.live('keeps a spaced target whose circle reaches no other target', () =>
    offenders(
      `<button class="at" style="left:100px;top:500px;width:30px;height:30px">T</button>
       <button class="at" style="left:200px;top:500px;width:44px;height:44px">far</button>`,
      [],
    ),
  );

  it.live(
    'leaves out a backing input nothing of which shows, and measures a shown button out of the tree',
    () =>
      offenders(
        `<input type="number" aria-hidden="true" tabindex="-1" style="position:fixed;top:0;left:0;width:1px;height:1px;clip-path:inset(50%);border:0;padding:0;margin:0">
         <button class="at" aria-hidden="true" tabindex="-1" style="left:100px;top:600px;width:60px;height:16px">hidden</button>`,
        ['button.at "hidden" 60×16 □16'],
      ),
  );

  it.live('keeps a link in a sentence, and measures one alone on its line', () =>
    offenders(
      `<p style="position:absolute;top:100px;left:16px;margin:0">Read the <a href="#a">docs</a> before you pick.</p>
       <div style="position:absolute;top:300px;left:16px"><a href="#b">Versions</a><br>a later line of words</div>`,
      ['a "Versions" 64×16 □16'],
    ),
  );

  it.live("measures a layer's own targets, menu items among them, and not what lies under it", () =>
    offenders(
      `<button class="at" style="left:100px;top:100px;width:20px;height:20px">under</button>
       <div role="menu" class="at" style="left:0;top:60px;width:390px;height:200px;background:#fff">
         <div role="menuitem" tabindex="-1" style="height:20px">Copy link</div>
         <div role="menuitem" tabindex="-1" style="height:44px">Inspect</div>
       </div>`,
      ['div "Copy link" 390×20 □20'],
      '[role=menu]',
    ),
  );
});
