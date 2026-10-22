/**
 * Which hymn the bottom bar acts on. On a hymn page the bar is the page's
 * player: it acts on the page's hymn, unless another hymn is sounding
 * (loading, playing or buffering). Then it shows the sounding hymn with its
 * own buttons, and a compact Play for the page's hymn beside them. A held
 * hymn that is not sounding (paused, ended, stopped, failed) gives way to the
 * page's hymn. Off a hymn page the bar shows only while the player holds a
 * hymn.
 */

import { Data, Option, Predicate } from 'effect';

import { Player, type Track, trackOf } from './player';

/** The player as `track` sees it: its own state, or idle when it holds another hymn. */
export const playerFor = (state: Player, track: Track): Player =>
  trackOf(state).pipe(
    Option.filter((held) => held.number === track.number),
    Option.match({ onNone: () => Player.Idle(), onSome: () => state }),
  );

export type Bar = Data.TaggedEnum<{
  /** Nothing to show: no hymn page, and the player holds no hymn. */
  Hidden: {};
  /**
   * The bar shows `track` in `state` (the player as that hymn sees it);
   * `page` is the page's own hymn when another hymn sounds over it.
   */
  Shown: { readonly track: Track; readonly state: Player; readonly page: Option.Option<Track> };
}>;
export const Bar = Data.taggedEnum<Bar>();

/** Whether the player is making, or about to make, sound. */
export const sounding: (state: Player) => boolean = Predicate.or(
  Predicate.isTagged('Loading'),
  Predicate.or(Predicate.isTagged('Playing'), Predicate.isTagged('Buffering')),
);

/** The bar for the player's `state`, over the hymn page shown, if any. */
export const barFor = (state: Player, page: Option.Option<Track>): Bar =>
  Option.match(page, {
    onNone: () =>
      Option.match(trackOf(state), {
        onNone: () => Bar.Hidden(),
        onSome: (track) => Bar.Shown({ track, state, page: Option.none() }),
      }),
    onSome: (shown) =>
      trackOf(state).pipe(
        Option.filter((held) => held.number !== shown.number && sounding(state)),
        Option.match({
          onNone: () =>
            Bar.Shown({ track: shown, state: playerFor(state, shown), page: Option.none() }),
          onSome: (held) => Bar.Shown({ track: held, state, page: Option.some(shown) }),
        }),
      ),
  });
