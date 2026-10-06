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

/** A phone's widest window, in CSS px: the studio's one breakpoint. */
const PHONE_WIDEST = 899;

/**
 * A phone's width, the studio's one: under it the shell is a phone's
 * (`page-shell-style.ts`), a sheet rises from the bottom, Scenes' tape lays
 * six stills a line and the review plays the 720p copy. The styles say it
 * through `PHONE` and `WIDE`; a stylesheet that cannot (`player.css`,
 * `tokens.css`) is held to it by `viewport.test.ts`.
 */
export const PHONE = `(max-width: ${PHONE_WIDEST}px)`;

/** Wider than a phone: a laptop's window, `PHONE`'s other side. */
export const WIDE = `(min-width: ${PHONE_WIDEST + 1}px)`;

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
