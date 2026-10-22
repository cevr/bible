/**
 * Keeps the screen on while a hymn page is shown, when the reader has asked
 * for it in the "Aa" sheet: held from the page's first frame and let go when
 * the page leaves or the switch is turned off.
 */

import { useAtomValue } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import { useKeepAwake } from 'one';

export function KeepAwake({ on }: { readonly on: Atom.Atom<boolean> }) {
  return useAtomValue(on) && <Held />;
}

function Held() {
  useKeepAwake();
  return <></>;
}
