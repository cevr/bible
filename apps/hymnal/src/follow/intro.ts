/**
 * The intro before a hymn's first sung line, as the player stands: how much
 * of it is played (`share`, from 0 to 1) and how long is left (`left`, ms).
 * Some only while the player holds this hymn as Playing, Buffering or
 * Paused, before `first` (the first sung line's start, ms, where the score
 * clock starts), and only when the hymn has an intro (`first` > 0).
 */

import { Option } from 'effect';

import { Player } from '~/player/player';

export interface Intro {
  readonly share: number;
  readonly left: number;
}

/** The intro of hymn `number`, whose first line is sung at `first` ms, while `state` stands. */
export const introOf = (number: number, first: number, state: Player): Option.Option<Intro> => {
  const at = Player.$match(state, {
    Idle: () => Option.none<number>(),
    Loading: () => Option.none<number>(),
    Playing: (held) => heldAt(held, number),
    Buffering: (held) => heldAt(held, number),
    Paused: (held) => heldAt(held, number),
    Ended: () => Option.none<number>(),
    Stopped: () => Option.none<number>(),
    Failed: () => Option.none<number>(),
  });
  return at.pipe(
    Option.filter((ms) => first > 0 && ms < first),
    Option.map((ms) => ({ share: Math.max(0, ms) / first, left: first - Math.max(0, ms) })),
  );
};

/** The place in ms of a held track, when it is hymn `number`. */
const heldAt = (
  held: { readonly track: { readonly number: number }; readonly at: number },
  number: number,
): Option.Option<number> =>
  Option.some(held.at * 1000).pipe(Option.filter(() => held.track.number === number));

/** The intro's value as a screen reader reads it: whole percent played, whole seconds left. */
export const readingOf = (intro: Intro) => ({
  now: Math.floor(intro.share * 100),
  text: `${Math.ceil(intro.left / 1000)} seconds to the first line`,
});
