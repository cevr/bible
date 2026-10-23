/**
 * The player's buttons for a hymn, as the player stands, as data: what each
 * button is (its kind), what a screen reader and the follow checker press
 * it by (its label) and what it asks the player (its command). Play when
 * the player holds another hymn or none, Pause while it plays or buffers
 * (and Retry before it once a wait online runs long), Play while paused or
 * stopped (from the reader's place), Play again once ended, Retry once
 * failed, and Loading, which asks nothing, while it loads. Retry and Play
 * from a place are Resume.
 *
 * The full player's text buttons (`Toggle`) and the bar's marks
 * (`PlayerBar`) both draw these.
 */

import { Array as Arr, Option } from 'effect';

import { playerFor } from './bar';
import { Command, Player, type Track } from './player';

export type Kind = 'play' | 'pause' | 'again' | 'retry' | 'loading';

/** A bar button's mark (`BarMark`): a pressable kind's, or the Sound switch's. */
export type Mark = Exclude<Kind, 'loading'> | 'sound-on' | 'sound-off';

export interface Button {
  readonly kind: Kind;
  readonly label: string;
  /** What a press asks the player; none while it loads. */
  readonly command: Option.Option<Command>;
}

const button = (kind: Kind, label: string, command: Command): Button => ({
  kind,
  label,
  command: Option.some(command),
});

const loading = (n: number): Button => ({
  kind: 'loading',
  label: `Loading hymn ${n}`,
  command: Option.none(),
});

/** `track`'s buttons in the order drawn, as the player's `state` stands. */
export const buttonsOf = (state: Player, track: Track): ReadonlyArray<Button> => {
  const n = track.number;
  const play = (command: Command) => button('play', `Play hymn ${n}`, command);
  const pause = button('pause', `Pause hymn ${n}`, Command.Pause());
  const retry = button('retry', `Retry hymn ${n}`, Command.Resume());
  return Player.$match(playerFor(state, track), {
    Idle: () => [play(Command.Start({ track }))],
    Loading: () => [loading(n)],
    Playing: () => [pause],
    Buffering: ({ retry: offered }) => [...Arr.filter([retry], () => offered), pause],
    Paused: () => [play(Command.Resume())],
    Ended: () => [button('again', `Play hymn ${n} again`, Command.Resume())],
    Stopped: () => [play(Command.Resume())],
    Failed: () => [retry],
  });
};
