// A wipe's divider by the keyboard (the lab's Compare and a Set's wipe): its
// grip is a slider, moved as one is, through the page's keymap. While the
// grip has focus (`Focus` `slider`) ←/→ and ↓/↑ nudge it a hundredth of the
// frame, ten with ⇧ and a thousandth with ⌥; Home and End put it at the
// frame's edges. Off the grip those keys are the page's again.

import { type Command, type Invocation, quietly } from '../command/command.ts';

/** A nudge's size by its step, as a fraction of the frame. */
const STEP = { normal: 0.01, coarse: 0.1, fine: 0.001 } as const satisfies Record<
  Invocation['step'],
  number
>;

/** Where a divider at `split` (0 to 1) goes nudged `by` steps of `step`, kept in the frame. */
export const nudged = (split: number, by: number, step: Invocation['step']): number =>
  Math.min(1, Math.max(0, Math.round((split + by * STEP[step]) * 1000) / 1000));

/**
 * The grip's title: how to move `scope`'s wipe, naming the keys `first`
 * reads as bound now (a hub's `first`), so a rebound key reads as rebound.
 */
export const wipeTitle = (scope: string, first: (id: string) => string): string =>
  `Drag the wipe, or move it with ${first(`${scope}.wipe-left`)}/${first(`${scope}.wipe-right`)} (⇧ ten), ${first(`${scope}.wipe-start`)} and ${first(`${scope}.wipe-end`)}`;

/**
 * The commands that move a wipe's divider from its focused grip, `scope`
 * naming whose (`compare`, `review`): each reads where it is (`split`) and
 * moves it (`move`).
 */
export const wipeCommands = (
  scope: string,
  split: () => number,
  move: (to: number) => void,
): ReadonlyArray<Command> => {
  const onGrip = {
    group: 'Wipe',
    keysIn: ['slider'],
    touch: "drag the wipe's grip",
    when: (ctx) => ctx.focus === 'slider',
  } as const satisfies Pick<Command, 'group' | 'keysIn' | 'touch' | 'when'>;
  const to = (where: (how: Invocation) => number) => quietly((_, how) => move(where(how)));
  return [
    {
      id: `${scope}.wipe-right`,
      label: 'Move the wipe right',
      keys: ['arrowright', 'arrowup'],
      stepped: true,
      ...onGrip,
      run: to((how) => nudged(split(), 1, how.step)),
    },
    {
      id: `${scope}.wipe-left`,
      label: 'Move the wipe left',
      keys: ['arrowleft', 'arrowdown'],
      stepped: true,
      ...onGrip,
      run: to((how) => nudged(split(), -1, how.step)),
    },
    {
      id: `${scope}.wipe-start`,
      label: 'Move the wipe to the left edge',
      keys: ['home'],
      ...onGrip,
      run: to(() => 0),
    },
    {
      id: `${scope}.wipe-end`,
      label: 'Move the wipe to the right edge',
      keys: ['end'],
      ...onGrip,
      run: to(() => 1),
    },
  ];
};
