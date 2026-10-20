// A transport's rates as commands (`command/command.ts`): the rate chip
// lists them, K plays at 1× again, and J and L step a rate slower or faster
// (an editor's shuttle keys). The review's player registers them with its
// page's hub (`lab/review/player.tsx`), so the page's keys, ⌘K and the `?`
// sheet read them as they read the page's own.

import { Option } from 'effect';
import { type Command, quietly } from '../command/command.ts';

/** The rates a transport plays at, slowest first; the one it plays at now; the choice. */
interface Rates<R extends number> {
  readonly all: ReadonlyArray<R>;
  readonly now: () => R;
  readonly choose: (rate: R) => void;
}

/** A rate as a chip says it: `¼×`, `½×`, `1×`. */
export const rateText = (rate: number): string =>
  Option.getOrElse(Option.fromUndefinedOr(RATE_NAMES.get(rate)), () => `${rate}×`);

const RATE_NAMES: ReadonlyMap<number, string> = new Map([
  [0.25, '¼×'],
  [0.5, '½×'],
]);

/** The command that plays at `rate`. */
export const rateId = (rate: number): string => `play.rate-${rate}`;

/**
 * The rate chip's title, each step named with its key as `titled` reads it
 * from the hub's keymap now (a hub's), so a key a command registered later
 * declares reads too.
 */
export const rateTitle = (titled: (title: string, id: string) => string): string =>
  `The speed: play ${titled('slower', 'play.slower')}, ${titled('faster', 'play.faster')}, or ${titled('at 1×', rateId(1))}`;

/**
 * A transport's rates as commands (the one rate chip opens them): Play at
 * each rate but the one it plays at, K back to 1×, and J and
 * L a rate slower or faster (an editor's shuttle keys, stepping the rate:
 * the player never plays backwards).
 */
export const rateCommands = <R extends number>(rates: Rates<R>): ReadonlyArray<Command> => {
  const at = () => rates.all.indexOf(rates.now());
  const step = (by: number) => Option.fromUndefinedOr(rates.all[at() + by]);
  const stepCommand = (id: string, label: string, key: string, by: number): Command => ({
    id,
    label,
    group: 'Transport',
    keys: [key],
    touch: 'the rate chip',
    when: () => Option.isSome(step(by)),
    run: quietly(() => {
      Option.map(step(by), rates.choose);
    }),
  });
  return [
    ...rates.all.map((rate): Command => ({
      id: rateId(rate),
      label: `Play at ${rateText(rate)}`,
      group: 'Transport',
      keys: ['k'].filter(() => rate === 1),
      touch: 'the rate chip',
      when: () => rates.now() !== rate,
      run: quietly(() => rates.choose(rate)),
    })),
    stepCommand('play.slower', 'Slower', 'j', -1),
    stepCommand('play.faster', 'Faster', 'l', 1),
  ];
};
