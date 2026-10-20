/**
 * The app's one player, over the device's playback (`playback.live.ts`).
 * It follows the lock screen and Control Center while the app shows it.
 */

import { useAtomMount } from '@effect/atom-react';
import { Option } from 'effect';
import type { ReactNode } from 'react';

import { PlayerContext } from './context';
import { playbackLive } from './playback.live';
import { playerOn, statusEvery } from './player';

const player = playerOn(playbackLive, statusEvery);

export function LivePlayer({ children }: { readonly children: ReactNode }) {
  // The commands run for as long as the app does, whichever screen shows.
  useAtomMount(player.send);
  useAtomMount(player.remote);
  return <PlayerContext value={Option.some(player)}>{children}</PlayerContext>;
}
