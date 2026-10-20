/**
 * The player the screens use: the device's own in the app (`LivePlayer`),
 * or one a test hands in. With none provided, the player's controls draw
 * nothing.
 */

import { Option } from 'effect';
import { createContext, use } from 'react';

import type { HymnPlayer } from './player';

export const PlayerContext = createContext<Option.Option<HymnPlayer>>(Option.none());

export const usePlayer = () => use(PlayerContext);
