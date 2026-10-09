// The drawn-token check (`fixtures/drawn-tokens.ts`) over a synthetic
// page under the studio's tokens: a literal colour, a user agent's heading
// size and bold, a padding off the scale, a radius of its own, a value a
// page declares in a variable of its own, and a colour in a gradient or a
// shadow are each named; a token, a token negated, a named composition, a
// scene's hue, a native range's colour, a named geometry, and a shadow and a
// gradient in tokens pass.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { describe, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { untokened } from '../../../src/lab/fixtures/drawn-tokens.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** What the check answers on a page under the tokens whose body is `body`. */
const drawn = (body: string, want: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const tokens = yield* FileSystem.FileSystem.use((fs) =>
      fs.readFileString(`${import.meta.dir}/../../../src/player/tokens.css`),
    ).pipe(Effect.orDie);
    const html = `<!doctype html><html><head><style>${tokens}
      .names { --cue-names: calc(2 * var(--s-8) + var(--s-2)); padding-left: var(--cue-names); }
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
    yield* evaluates(tab, untokened(tokens), want);
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the drawn-token check', () => {
  it.live('passes tokens, a negated token, a part token, a scene hue, a range and geometry', () =>
    drawn(
      `<div style="padding: var(--s-2); margin-left: calc(-1 * var(--gutter)); border-radius: var(--r-2); background: var(--surface-2)">token</div>
       <div class="names">named</div>
       <span data-scene="a" style="display:block;background:hsl(140 var(--scene-sat) var(--scene-light))">hue</span>
       <input type="range" style="display:block">
       <div style="margin-left:-3.5px;gap:1px;display:flex"><i>mark</i></div>`,
      [],
    ),
  );

  it.live('passes a shadow and a gradient drawn in tokens', () =>
    drawn(
      `<div style="box-shadow: var(--shadow-pop); background: repeating-linear-gradient(45deg, transparent 0 6px, var(--hatch) 6px 12px)">popped</div>`,
      [],
    ),
  );

  it.live('passes a margin set to auto, which pushes a part along and is no step', () =>
    drawn(`<div style="display:flex;width:300px"><i style="margin-left:auto">pushed</i></div>`, []),
  );

  // The engine resolves the mix to one colour (`color(srgb …)`), which no token holds.
  it.live('names a colour mixed from the current colour and a literal', () =>
    drawn(
      `<div style="color:var(--text-1);background:linear-gradient(color-mix(in srgb, currentcolor, crimson), transparent)">g</div>
       <div style="color:var(--text-1);box-shadow:0 0 4px color-mix(in srgb, currentcolor, crimson)">s</div>`,
      [
        'background-image color(srgb 0.878431 0.476471 0.537255): div',
        'box-shadow color(srgb 0.878431 0.476471 0.537255): div',
      ],
    ),
  );

  it.live('names a colour a page declares in a variable of its own', () =>
    drawn(
      `<style>.bad { --rogue: crimson; --wide: 9px; color: var(--rogue); padding-left: var(--wide); }</style>
       <p class="bad" style="margin:0">rogue</p>`,
      ['color rgb(220, 20, 60): p.bad', 'paddingLeft 9px: p.bad'],
    ),
  );

  it.live('names a colour in a gradient or a shadow, by its name or in a function', () =>
    drawn(
      `<div style="background: linear-gradient(crimson, gold)">g</div>
       <div style="box-shadow: 0 0 4px hsl(200 50% 40%)">s</div>
       <p style="margin:0;text-shadow: 1px 1px teal">t</p>`,
      [
        'background-image rgb(220, 20, 60): div',
        'background-image rgb(255, 215, 0): div',
        'box-shadow rgb(51, 119, 153): div',
        'text-shadow rgb(0, 128, 128): p',
      ],
    ),
  );

  it.live('names a literal colour, a heading, a padding off the scale and a radius', () =>
    drawn(
      `<p style="margin:0;color:#123456">ink</p>
       <h1 style="margin:0">title</h1>
       <div style="padding:9px">off</div>
       <div style="border-radius:3px">round</div>`,
      [
        'border-radius 3px: div',
        'color rgb(18, 52, 86): p',
        'font-size 26px: h1',
        'font-weight 700: h1',
        'paddingBottom 9px: div',
        'paddingLeft 9px: div',
        'paddingRight 9px: div',
        'paddingTop 9px: div',
      ],
    ),
  );
});

// Each case plants one value the older check passed: a size from another
// scale, a property it never read, a pseudo-element, a swatch's hue on
// chrome, a part far below the fold or past the window's side.
describe('the drawn-token check reads each scale, every property and the whole page', () => {
  const planted: ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> = [
    [
      'k1 a font size and leading that equal a layout token',
      `<p style="margin:0;font-size:56px;line-height:56px">k1</p>`,
      ['font-size 56px: p', 'line-height 56px: p'],
    ],
    [
      'k2 a padding that equals a layout token',
      `<div style="padding-left:320px"><p style="margin:0">k2</p></div>`,
      ['paddingLeft 320px: div'],
    ],
    [
      'k3 a focus outline in a named colour, off the scale in width and gap',
      `<p style="margin:0;outline:9px solid gold;outline-offset:7px">k3</p>`,
      ['outline-color rgb(255, 215, 0): p', 'outline-offset 7px: p', 'outline-width 9px: p'],
    ],
    [
      'k4 a pseudo-element in a named colour and a size of its own',
      `<style>.k4::after { content: 'x'; color: gold; background: crimson; font-size: 31px }</style><p class="k4" style="margin:0">k4</p>`,
      [
        'background-color rgb(220, 20, 60): p.k4::after',
        'color rgb(255, 215, 0): p.k4::after',
        'font-size 31px: p.k4::after',
      ],
    ],
    [
      'k5 tracking off the caps token, and uppercase without it',
      `<p style="margin:0;letter-spacing:3px;text-transform:uppercase">k5</p>`,
      ['letter-spacing 3px: p', 'text-transform uppercase: p'],
    ],
    [
      'k6 decoration, caret and accent colours',
      `<p style="margin:0;text-decoration:underline 3px;text-decoration-color:gold;caret-color:gold;accent-color:gold">k6</p>`,
      [
        'accent-color rgb(255, 215, 0): p',
        'caret-color rgb(255, 215, 0): p',
        'text-decoration-color rgb(255, 215, 0): p',
      ],
    ],
    [
      'k7 a hue at the scenes saturation and lightness, used as chrome',
      `<div style="background:hsl(120 30% 32%)"><p style="margin:0">k7</p></div>`,
      ['background-color rgb(57, 106, 57): div'],
    ],
    [
      'k8 a drop-shadow filter in a named colour',
      `<p style="margin:0;filter:drop-shadow(0 0 2px gold)">k8</p>`,
      ['filter rgb(255, 215, 0): p'],
    ],
    [
      'k9 a border width off the scale',
      `<div style="border:7px solid var(--line)"><p style="margin:0">k9</p></div>`,
      ['border-width 7px: div'],
    ],
    [
      'k10 far below the fold',
      `<div style="height:5000px"></div><p style="margin:0;color:orchid">k10</p>`,
      ['color rgb(218, 112, 214): p'],
    ],
    [
      'k11 an SVG gradient stop',
      `<svg width="40" height="40"><defs><linearGradient id="gr"><stop offset="0" stop-color="gold"/></linearGradient></defs><rect width="40" height="40" fill="url(#gr)"/></svg>`,
      ['stop-color rgb(255, 215, 0): stop'],
    ],
    [
      'k12 right of the window',
      `<p style="margin:0;position:absolute;left:3000px;top:0;color:tomato">k12</p>`,
      ['color rgb(255, 99, 71): p'],
    ],
    ['k13 opacity as a colour', `<p style="margin:0;opacity:0.37">k13</p>`, ['opacity 0.37: p']],
    [
      'k14 italic on a part that is not emphasis',
      `<p style="margin:0;font-style:italic">k14</p>`,
      ['font-style italic: p'],
    ],
  ];

  for (const [name, body, want] of planted) it.live(`names ${name}`, () => drawn(body, want));

  it.live(
    'passes what the scales hold: caps tracking, emphasis, a pseudo in tokens, a swatch hue',
    () =>
      drawn(
        `<style>.caps { text-transform: uppercase; letter-spacing: var(--track-caps); font-size: var(--fs-2); line-height: var(--lh-2) }
        .tip::before { content: 'x'; color: var(--accent); padding-left: var(--s-1) }
        .dim { opacity: 0.55 }</style>
       <p class="caps" style="margin:0">caps</p>
       <p style="margin:0"><em>stressed</em></p>
       <p class="tip" style="margin:0">tip</p>
       <div class="dim" style="border:var(--border);outline:1px solid var(--accent)">dim</div>
       <span data-scene="a" style="display:block;background:hsl(140 var(--scene-sat) var(--scene-light))">hue</span>`,
        [],
      ),
  );
});
