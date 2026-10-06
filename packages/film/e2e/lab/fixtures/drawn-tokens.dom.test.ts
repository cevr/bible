// The drawn-token check (`fixtures/drawn-tokens.ts`, G9) over a synthetic
// page under the studio's tokens: a literal colour, a user agent's heading
// size and bold, a padding off the scale and a radius of its own are each
// named; a token, a token negated, a part's own token, a scene's hue, a
// native range's colour and a named geometry pass.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { describe, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { UNTOKENED } from '../../../src/lab/fixtures/drawn-tokens.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** What the check answers on a page under the tokens whose body is `body`. */
const drawn = (body: string, want: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const tokens = yield* FileSystem.FileSystem.use((fs) =>
      fs.readFileString(`${import.meta.dir}/../../../src/player/tokens.css`),
    ).pipe(Effect.orDie);
    const html = `<!doctype html><html><head><style>${tokens}
      .names { --names: calc(2 * var(--s-8) + var(--s-2)); padding-left: var(--names); }
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
    yield* evaluates(tab, UNTOKENED, want);
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the drawn-token check', () => {
  it.live('passes tokens, a negated token, a part token, a scene hue, a range and geometry', () =>
    drawn(
      `<div style="padding: var(--s-2); margin-left: calc(-1 * var(--gutter)); border-radius: var(--r-2); background: var(--surface-2)">token</div>
       <div class="names">named</div>
       <span style="display:block;background:hsl(140 var(--scene-sat) var(--scene-light))">hue</span>
       <input type="range" style="display:block">
       <div style="margin-left:-3.5px;gap:1px;display:flex"><i>mark</i></div>`,
      [],
    ),
  );

  it.live('names a literal colour, a heading, a padding off the scale and a radius', () =>
    drawn(
      `<p style="margin:0;color:#123456">ink</p>
       <h1 style="margin:0">title</h1>
       <div style="padding:5px">off</div>
       <div style="border-radius:3px">round</div>`,
      [
        'border-radius 3px: div',
        'color rgb(18, 52, 86): p',
        'font-size 26px: h1',
        'font-weight 700: h1',
        'paddingBottom 5px: div',
        'paddingLeft 5px: div',
        'paddingRight 5px: div',
        'paddingTop 5px: div',
      ],
    ),
  );
});
