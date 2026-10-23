import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { buttonsOf } from './button';
import { Command, Player } from './player';

const hundred = { number: 100, title: 'A' };
const other = { number: 7, title: 'B' };
const length = Option.some(180);

/** Every player state, as it holds `track`. */
const statesOf = (track: typeof hundred) => ({
  Loading: Player.Loading({ track }),
  Playing: Player.Playing({ track, at: 12, length }),
  Buffering: Player.Buffering({ track, at: 12, length, retry: false }),
  'Buffering, retry': Player.Buffering({ track, at: 12, length, retry: true }),
  Paused: Player.Paused({ track, at: 12, length }),
  Ended: Player.Ended({ track, length }),
  Stopped: Player.Stopped({ track, at: Option.none() }),
  Failed: Player.Failed({ track, offline: true, at: Option.some(3) }),
});

/** The buttons as `[kind, label, command tag]`: what the full player's text buttons gave at base. */
const read = (state: Player, track: typeof hundred) =>
  buttonsOf(state, track).map((b) => [
    b.kind,
    b.label,
    Option.match(b.command, { onNone: () => 'none', onSome: (c) => c._tag }),
  ]);

describe('buttonsOf', () => {
  it('gives each state of the hymn its buttons, labels and commands (F2a)', () => {
    for (const track of [hundred, other]) {
      const n = track.number;
      const states = statesOf(track);
      const want: Record<keyof typeof states, Array<Array<string>>> = {
        Loading: [['loading', `Loading hymn ${n}`, 'none']],
        Playing: [['pause', `Pause hymn ${n}`, 'Pause']],
        Buffering: [['pause', `Pause hymn ${n}`, 'Pause']],
        'Buffering, retry': [
          ['retry', `Retry hymn ${n}`, 'Resume'],
          ['pause', `Pause hymn ${n}`, 'Pause'],
        ],
        Paused: [['play', `Play hymn ${n}`, 'Resume']],
        Ended: [['again', `Play hymn ${n} again`, 'Resume']],
        Stopped: [['play', `Play hymn ${n}`, 'Resume']],
        Failed: [['retry', `Retry hymn ${n}`, 'Resume']],
      };
      const got = Object.fromEntries(
        Object.entries(states).map(([name, state]) => [name, read(state, track)]),
      );
      expect(got).toEqual(want);
    }
  });

  it('starts the hymn from idle, or when the player holds another hymn', () => {
    const start = (state: Player) => buttonsOf(state, hundred);
    for (const state of [Player.Idle(), ...Object.values(statesOf(other))]) {
      const [only, ...rest] = start(state);
      expect(rest).toEqual([]);
      expect(only?.kind).toBe('play');
      expect(only?.label).toBe('Play hymn 100');
      expect(only?.command).toEqual(Option.some(Command.Start({ track: hundred })));
    }
  });
});
