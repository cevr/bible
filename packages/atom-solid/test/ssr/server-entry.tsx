// The server half of the SSR proof: one registry per render, its `Location`
// the request's URL, which never carries a hash.
import { layerServer } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { generateHydrationScript, renderToStream, renderToString } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { OBSERVE } from 'solid-js';

import { RegistryProvider } from '../../src/registry-context.ts';
import { ANSWER_KEY, Answer, AnswerResult } from './Answer.tsx';
import { App } from './App.tsx';

/**
 * The codes Solid's development build reports on its diagnostics channel
 * while `render` runs (a pure server render reports none); `None` when the
 * build has no channel, so a test cannot pass by not listening.
 */
export const findings = (render: () => string) => {
  const codes: Array<string> = [];
  const stop = Option.map(Option.fromNullishOr(OBSERVE), (observe) =>
    observe.diagnostics.subscribe((event) => codes.push(event.code)),
  );
  const html = render();
  Option.map(stop, (unsubscribe) => unsubscribe());
  return { html, codes: Option.as(stop, codes) };
};

/** The App's markup for a request to `href`. */
export const render = (href: string): string =>
  renderToString(() => (
    <RegistryProvider initialValues={[[UrlAtom.layer, layerServer(href)]]}>
      <App />
    </RegistryProvider>
  ));

/** The App rendered with no `RegistryProvider`: a mistake on the server. */
export const renderWithoutProvider = (): string => renderToString(() => <App />);

/**
 * The adoption proof's whole page: its markup streamed to the end (the
 * render waits for the answer `read` gives), the hydration script with the
 * values the render serialized, and its client entry.
 */
export const answerPage = (read: () => Promise<string>): Promise<string> => {
  const answer = Atom.make(Effect.promise(read)).pipe(
    Atom.serializable({ key: ANSWER_KEY, schema: AnswerResult }),
  );
  const parts: Array<string> = [];
  return Effect.runPromise(
    Effect.callback<string>((resume) => {
      renderToStream(() => (
        <RegistryProvider>
          <Answer answer={answer} />
        </RegistryProvider>
      )).pipe({
        write: (html) => {
          parts.push(html);
        },
        end: () =>
          resume(
            Effect.succeed(
              [
                '<!doctype html><html><head><meta charset="utf-8">',
                generateHydrationScript(),
                '<script type="module" src="/answer-client.js"></script></head>',
                `<body><div id="root">${parts.join('')}</div></body></html>`,
              ].join(''),
            ),
          ),
      });
    }),
  );
};

/** The whole page: the App's markup, the hydration script, the client entry. */
export const page = (href: string): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    generateHydrationScript(),
    '<script type="module" src="/client.js"></script></head>',
    `<body><div id="root">${render(href)}</div></body></html>`,
  ].join('');
