// The render fixture's server entry (`page-render.test.ts`): a page that
// names the URL it was asked at and its module's instance (drawn once per
// import, so a fresh worker draws anew), and shows a read of the lab's API
// once it is answered, streamed in after the shell.

import { Loading } from '@solidjs/web';
import { Effect, Random } from 'effect';
import { createMemo } from 'solid-js';
import type { PageRequest } from '../../../core/page-render.ts';
import { pageRender } from '../../../lab/page-server.tsx';

/** This import of the module. */
const INSTANCE = Effect.runSync(Random.nextIntBetween(0, 36 ** 6)).toString(36);

const Fixture = (props: { readonly request: PageRequest }) => {
  const read = createMemo(() =>
    props.request
      .fetch(new URL('/api/fixture?x=1', props.request.url))
      .then((response) => response.text()),
  );
  return (
    <main>
      <p id="url">{props.request.url}</p>
      <p id="instance">{INSTANCE}</p>
      <Loading fallback={<p id="read">reading</p>}>
        <p id="read">{read()}</p>
      </Loading>
    </main>
  );
};

export default pageRender({
  bodyClass: 'fixture',
  rootClass: 'fixture-root',
  style: '.fixture-root { display: block; }',
  app: (request) => <Fixture request={request} />,
});
