// The client half of the adoption proof: the same page hydrated over the
// server's markup, its answer read by a request of the browser's own, which
// it never needs to make: the server's answer is adopted.
import { hydrate } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { RegistryProvider } from '../../src/registry-context.ts';
import { ANSWER_KEY, Answer, AnswerResult } from './Answer.tsx';

const answer = Atom.make(
  Effect.promise(() =>
    // oxlint-disable-next-line effect/noGlobals -- the browser's own request, the one the proof counts: the page's adapter
    fetch('/api/answer').then((response) => response.text()),
  ),
).pipe(Atom.serializable({ key: ANSWER_KEY, schema: AnswerResult }));

Option.map(Option.fromNullishOr(document.getElementById('root')), (root) =>
  hydrate(
    () => (
      <RegistryProvider>
        <Answer answer={answer} />
      </RegistryProvider>
    ),
    root,
  ),
);
