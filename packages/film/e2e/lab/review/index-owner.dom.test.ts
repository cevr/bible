// The review's index owner (`useIndexOwner`, `review/index-owner.ts`) over a
// first read of folders `a` and `b`: a walk of the roots (a Refresh, a say on
// Project) and then a Set's say on `b` are asked; the walk's answer (`a`
// moved) and the say's (`b` moved) land in one task. The index shows both:
// the say's folder goes into the walk's answer, not into the index last shown.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import {
  asset,
  openTab,
  respond,
  scriptOf,
  servePaths,
} from '../../../src/lab/fixtures/browsers.ts';
import { bundled } from '../../../src/lab/fixtures/bundles.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

describe("the review's index owner", () => {
  it.live(
    "a walk's answer and a Set say's answer landing in one task both show: the say's folder goes into the walk's answer",
    () =>
      Effect.gen(function* () {
        const script = asset(
          'index-owner.js',
          respond(yield* bundled('index-owner-page.ts'), 'text/javascript'),
        );
        const html = `<!doctype html><html><head></head><body>${scriptOf(script)}</body></html>`;
        const tab = yield* openTab({
          width: 390,
          height: 844,
          microphone: false,
          init: [],
          assets: [script],
          serve: servePaths({ '/': respond(html, 'text/html') }),
        });
        yield* tab.goto('/');
        yield* evaluates(tab, 'window.shown', 'a:1 b:1');
        yield* tab.evaluate('(window.refresh(), window.say(), window.landTogether(), 0)');
        yield* evaluates(tab, 'window.shown', 'a:2 b:3');
      }).pipe(Effect.scoped),
    30_000,
  );
});
