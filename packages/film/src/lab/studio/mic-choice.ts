// The microphone the viewer picked, remembered in this browser (one choice
// for every film: it is the viewer's desk, not the film's). Storage that is
// missing or throws (a private window, a full quota) remembers nothing: the
// browser's default microphone is used, and the choice lasts while the page
// does.

import { Option, Result } from 'effect';
import type { StorageLike } from '../../player/view-state.ts';

const KEY = 'film-lab-mic';

export interface MicChoice {
  /** The device picked, or none for the browser's default. */
  readonly get: () => Option.Option<string>;
  readonly set: (device: Option.Option<string>) => void;
}

/** `run`'s value, or none when it throws. */
const attempt = <A>(run: () => A): Option.Option<A> => Result.getSuccess(Result.try(run));

/** The browser's local storage, when the page may use it. */
export const localStore = (): Option.Option<StorageLike> => attempt(() => window.localStorage);

/** The viewer's microphone choice, kept in `storage`. */
export const micChoice = (storage: Option.Option<StorageLike>): MicChoice => {
  let chosen = Option.flatMap(
    Option.flatMap(storage, (s) => attempt(() => s.getItem(KEY))),
    (raw) => Option.filter(Option.fromNullishOr(raw), (id) => id !== ''),
  );
  return {
    get: () => chosen,
    set: (device) => {
      chosen = device;
      Option.map(storage, (s) =>
        attempt(() =>
          s.setItem(
            KEY,
            Option.getOrElse(device, () => ''),
          ),
        ),
      );
    },
  };
};
