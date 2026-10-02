// The page the SSR proof renders: path, query and hash read from one place
// atom through `useAtomValue`. The hash shows in a different element at its
// default than off it, so a client whose hydration pass read the real hash
// would not match the server's markup.
import { Codec, Field, Place } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { Show } from '@solidjs/web';
import { Option, Schema } from 'effect';

import { useAtomValue } from '../../src/hooks.ts';

const start: Codec.MediaTime = { _tag: 'Point', at: 0 };

export const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({ cue: Field.key(Codec.Text, { default: '', history: 'push' }) }),
  hash: Field.struct({ t: Field.key(Codec.MediaTime, { default: start }) }),
});

const lab = UrlAtom.place(Lab);

/** The playhead as the URL writes it. */
const timeOf = Schema.encodeSync(Codec.MediaTime);

export const App = () => {
  const place = useAtomValue(
    () => lab,
    (value) => Option.getOrThrow(value),
  );
  return (
    <main>
      <p id="film">{place().path.film}</p>
      <p id="cue">{place().query.cue}</p>
      <Show
        when={timeOf(place().hash.t) !== timeOf(start)}
        fallback={<i id="t">{timeOf(place().hash.t)}</i>}
      >
        <b id="t">{timeOf(place().hash.t)}</b>
      </Show>
    </main>
  );
};
