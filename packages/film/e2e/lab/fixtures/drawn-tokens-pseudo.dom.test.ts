// The drawn-token check (`fixtures/drawn-tokens.ts`) reads the pseudo-elements
// that draw a colour of their own: a field's `::placeholder`, a list item's
// `::marker` and a modal's `::backdrop`. A field with no rule of its own
// draws the tokens' placeholder colour; a rule that sets another is named.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';
import { describe, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../../../src/lab/fixtures/browsers.ts';
import { untokened } from '../../../src/lab/fixtures/drawn-tokens.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

/** What the check answers on a page under the tokens whose body is `body`, `head` after the tokens. */
const drawn = (head: string, body: string, want: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const tokens = yield* FileSystem.FileSystem.use((fs) =>
      fs.readFileString(`${import.meta.dir}/../../../src/player/tokens.css`),
    ).pipe(Effect.orDie);
    // The user agent's field, list and dialog draws are the page's to set: these are set on the tokens.
    const parts = `input, textarea { background: var(--surface-2); border: 0; padding: 0; margin: 0; outline: 0; }
      ul { margin: 0; padding: 0; } dialog { background: var(--surface-2); color: var(--text-1); border: 0; padding: 0; outline: 0; }`;
    const html = `<!doctype html><html><head><style>${tokens}${parts}</style>${head}</head><body>${body}</body></html>`;
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

describe('the drawn-token check, on pseudo-elements', () => {
  it.live("passes a field's placeholder and a list's marker under the tokens", () =>
    drawn(
      '',
      `<input placeholder="Type a command"><textarea placeholder="Reply"></textarea>
       <ul><li>one</li></ul><details><summary>more</summary>text</details>`,
      [],
    ),
  );

  it.live('names a placeholder drawn in a colour the tokens do not hold', () =>
    drawn(
      '<style>input::placeholder { color: crimson; }</style>',
      '<input placeholder="Type a command">',
      ['color rgb(220, 20, 60): input::placeholder'],
    ),
  );

  it.live('names a marker drawn in a colour the tokens do not hold', () =>
    drawn('<style>li::marker { color: crimson; }</style>', '<ul><li>one</li></ul>', [
      'color rgb(220, 20, 60): li::marker',
    ]),
  );

  it.live('names a modal backdrop drawn in a colour the tokens do not hold', () =>
    drawn(
      '<style>dialog::backdrop { background: crimson; }</style>',
      '<dialog id="d">hello</dialog><script>document.getElementById("d").showModal()</script>',
      ['background-color rgb(220, 20, 60): dialog::backdrop'],
    ),
  );
});
