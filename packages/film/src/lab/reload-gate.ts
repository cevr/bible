// The page's reloads, held while the owner has work only this page holds: a
// recording not yet kept or discarded (the studio), a note being written
// (the notes). Every reload goes through here (`StageOps.reload`: a write's,
// a kept take's, the rebuild's), so none takes that work with it. A reload
// asked for while something holds waits, and runs the moment the last hold
// lets go; until then the page says what it waits for.

import { Effect, Option } from 'effect';

export interface ReloadGate {
  /** Reload the page now, or once nothing holds it. */
  readonly request: Effect.Effect<void>;
  /**
   * `holder` holds every reload while `why` is some (what the owner does to
   * let it go: `keep or discard the take under review`), and lets go at none.
   */
  readonly hold: (holder: string, why: Option.Option<string>) => Effect.Effect<void>;
}

/** What the page says while a reload waits on `holds`; nothing while none waits. */
export const waitingText = (pending: boolean, holds: ReadonlyArray<string>): string => {
  if (!pending || holds.length === 0) return '';
  return `the page reloads with the change once you ${holds.join(', and ')}`;
};

/**
 * The gate over `reloadNow`, telling `waiting` what the page waits for each
 * time that changes (`waitingText`).
 */
export const makeReloadGate = (
  reloadNow: () => void,
  waiting: (text: string) => void,
): ReloadGate => {
  const holds = new Map<string, string>();
  let pending = false;
  const settle = () => {
    if (pending && holds.size === 0) {
      pending = false;
      reloadNow();
    }
    waiting(waitingText(pending, [...holds.values()]));
  };
  return {
    request: Effect.sync(() => {
      pending = true;
      settle();
    }),
    hold: (holder, why) =>
      Effect.sync(() => {
        Option.match(why, {
          onNone: () => holds.delete(holder),
          onSome: (text) => holds.set(holder, text),
        });
        settle();
      }),
  };
};
