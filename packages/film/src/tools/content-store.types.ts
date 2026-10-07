// Compile-time checks of the store's lock, run by the package typecheck. A
// decision made while holding a manifest's lock is made from the manifest as
// read under it: `holding` hands its change that read, as `transact` does,
// and takes no path and bare effect, a shape in which the holder read for
// itself and could carry in a read from before the lock. Each line marked
// below fails the typecheck if that shape comes back.

import { Effect } from 'effect';
import type { ContentStore, Manifest } from './content-store.ts';

declare const store: ContentStore['Service'];
declare const manifest: Manifest<ReadonlyArray<string>>;

// @ts-expect-error a path and a bare effect: the holder would read for itself
export const bare = store.holding(manifest.file, Effect.void);

// @ts-expect-error the change is handed the manifest as read under the lock, of the manifest's type
export const mistyped = store.holding(manifest, (current: number) => Effect.succeed(current));

/** The change decides from the manifest as read under the lock. */
export const decided = store.holding(manifest, (current) =>
  Effect.succeed(current.includes('three')),
);
