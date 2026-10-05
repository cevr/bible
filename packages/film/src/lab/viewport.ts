// The page's window as Solid reads it: whether it matches a CSS media query,
// followed as the window changes. The window is the browser's: a server
// render answers as a phone (`Viewport.served`), the client's hydration of
// that markup shows the same, and the window's own answer follows once the
// page is hydrated. A page rendered in the browser alone reads the window
// from the start.

import { Effect, Stream } from 'effect';
import type { Context } from 'effect';
import { type Accessor, createMemo, createSignal, onSettled } from 'solid-js';
import { Viewport } from '../browser/viewport.ts';

/** Whether the window `host` sees matches `query`, for as long as the calling owner lives. */
export const useMatches = (host: Context.Context<Viewport>, query: string): Accessor<boolean> => {
  const [now, setNow] = createSignal(
    Effect.runSyncWith(host)(Viewport.use((v) => v.matches(query))),
    { ownedWrite: true },
  );
  onSettled(() => {
    const fiber = Effect.runForkWith(host)(
      Viewport.use((v) =>
        Stream.runForEach(v.changes(query), (matches) => Effect.sync(() => setNow(matches))),
      ),
    );
    return () => fiber.interruptUnsafe();
  });
  return createMemo(now, { ssrSource: 'client', loadingValue: Viewport.served(query) });
};
