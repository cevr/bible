// The player's transport as commands (`command/command.ts`): play and
// pause, a frame back or on, a scene back or on, and the captions. Their
// keys are the transport's usual ones: Space plays, ← and → step one frame
// (with Shift, ten: the coarse step, as an editor's nudge; with Alt, one),
// [ and ] go by scenes, C toggles the captions; and the bar's legend, hidden
// at rest (`legendCommand`). Each answers quietly: the
// picture, the time line and the bar show what changed. The preview
// registers them with its page's hub for as long as it lives, so the lab's
// keys, ⌘K and the `?` sheet read them as they read the lab's own.

import { Effect, Option } from 'effect';
import { type Command, type Invocation, quiet } from '../command/command.ts';
import type { PageName } from '../core/api.ts';

/** The frames a step moves by: one, ten with the coarse modifier, one with the fine one. */
const FRAMES_BY_STEP: Readonly<Record<Invocation['step'], number>> = {
  normal: 1,
  coarse: 10,
  fine: 1,
};

/** What the transport drives: the preview's own moves. */
interface Transport {
  readonly toggle: () => void;
  /** Show the frame `frames` on from the one shown (back when negative), and settle there. */
  readonly stepFrames: (frames: number) => void;
  /** Go to the next scene's start. */
  readonly nextScene: () => void;
  /** Go to this scene's start, or the one before's from within its first half second. */
  readonly previousScene: () => void;
  readonly toggleCaptions: () => void;
}

const always = () => true;

/** What play says, by whether the film plays. */
const PLAY_LABEL: Readonly<Record<'true' | 'false', string>> = { true: 'Pause', false: 'Play' };

/** Run `move` and answer quietly. */
const doing = (move: () => void) => () =>
  Effect.sync(() => {
    move();
    return quiet;
  });

/** The transport's commands over `transport`. */
export const transportCommands = (transport: Transport): ReadonlyArray<Command> => [
  {
    id: 'play.toggle',
    label: 'Play or pause',
    labelIn: (ctx) => PLAY_LABEL[`${ctx.playing}`],
    group: 'Transport',
    keys: ['space'],
    touch: 'tap the film',
    when: always,
    run: doing(transport.toggle),
  },
  {
    id: 'play.frame-next',
    label: 'Next frame',
    group: 'Transport',
    keys: ['arrowright'],
    stepped: true,
    touch: 'drag the time line',
    when: always,
    run: (_ctx, how) => doing(() => transport.stepFrames(FRAMES_BY_STEP[how.step]))(),
  },
  {
    id: 'play.frame-previous',
    label: 'Previous frame',
    group: 'Transport',
    keys: ['arrowleft'],
    stepped: true,
    touch: 'drag the time line',
    when: always,
    run: (_ctx, how) => doing(() => transport.stepFrames(-FRAMES_BY_STEP[how.step]))(),
  },
  {
    id: 'play.scene-next',
    label: 'Next scene',
    group: 'Transport',
    keys: [']'],
    touch: 'drag the time line to it',
    when: always,
    run: doing(transport.nextScene),
  },
  {
    id: 'play.scene-previous',
    label: 'Scene start, or the scene before',
    group: 'Transport',
    keys: ['['],
    touch: 'drag the time line to it',
    when: always,
    run: doing(transport.previousScene),
  },
  {
    id: 'view.captions',
    label: 'Captions on or off',
    group: 'View',
    keys: ['c'],
    touch: 'the CC button',
    when: always,
    run: doing(transport.toggleCaptions),
  },
];

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
 * A transport's rates as commands (UR-25, UR-94: the one rate chip opens
 * them): Play at each rate but the one it plays at, K back to 1×, and J and
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
    run: doing(() => Option.map(step(by), rates.choose)),
  });
  return [
    ...rates.all.map((rate): Command => ({
      id: rateId(rate),
      label: `Play at ${rateText(rate)}`,
      group: 'Transport',
      keys: ['k'].filter(() => rate === 1),
      touch: 'the rate chip',
      when: () => rates.now() !== rate,
      run: doing(() => rates.choose(rate)),
    })),
    stepCommand('play.slower', 'Slower', 'j', -1),
    stepCommand('play.faster', 'Faster', 'l', 1),
  ];
};

/** What the legend's command says, by whether the legend shows. */
const LEGEND_LABEL: Readonly<Record<'true' | 'false', string>> = {
  true: 'Hide the keys and the legend',
  false: 'Show the keys and the legend',
};

/** Where a phone shows the legend, by page. */
const TOUCH_LEGEND: Readonly<Record<PageName, string>> = {
  player: 'the bar’s ? button',
  lab: 'hold the page, or the command menu',
  review: 'the command menu',
};

/** The bar's legend: whether it shows, and the toggle. */
interface Legend {
  readonly shown: () => boolean;
  readonly toggle: () => void;
}

/**
 * The bar's legend (the transport's keys, what the stripes and the ticks
 * mean), hidden at rest (UR-114). It has no key: on every page in the
 * studio's shell `?` opens the keys sheet. On the play page the bar's ?
 * button shows it; in the lab ⌘K and the page's long-press menu do.
 */
export const legendCommand = (page: PageName, legend: Legend): Command => ({
  id: 'view.legend',
  label: 'Show or hide the legend',
  labelIn: () => LEGEND_LABEL[`${legend.shown()}`],
  group: 'View',
  keys: [],
  about: ['Page'],
  touch: TOUCH_LEGEND[page],
  when: always,
  run: doing(legend.toggle),
});
