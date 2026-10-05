// A viewer's own value (a kept setting, the browser's): an atom with a
// server value, read and set by one component, as a page's control is.
import type * as Atom from 'effect/reactivity/Atom';

import { useAtomSet, useAtomValue } from '../../src/hooks.ts';

export const Own = (props: { readonly own: Atom.Writable<string, string> }) => {
  const value = useAtomValue(() => props.own);
  const set = useAtomSet(() => props.own);
  return (
    <p id="own" onClick={() => set('clicked')}>
      {value()}
    </p>
  );
};
