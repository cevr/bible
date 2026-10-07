// The player's transport as commands (`command/command.ts`): play and
// pause, a frame back or on, a scene back or on, and the captions. Their
// keys are the transport's usual ones: Space plays, ← and → step one frame
// (with Shift, ten: the coarse step, as an editor's nudge; with Alt, one),
// [ and ] go by scenes, C toggles the captions; the lab's legend, hidden at
// rest (`legendCommand`); and Play's ticks (`ticksCommand`). The frame and
// scene steps are the page's (a
// long press or a right-click on the film lists them, the frames' also ×10:
// a finger's Shift, `menu.ts`). Each answers quietly: the
// picture, the time line and the bar show what changed. The preview
// registers them with its page's hub for as long as it lives, so the lab's
// keys, ⌘K and the `?` sheet read them as they read the lab's own.

import { Option } from 'effect';
import { type Command, type Invocation, quietly } from '../command/command.ts';
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

/** How a phone plays and pauses, by page: on Play a tap while it plays shows the HUD (`hud.ts`). */
const TOUCH_PLAY: Readonly<Record<PageName, string>> = {
  player: 'tap the film; while it plays, the bar’s ❚❚',
  lab: 'tap the film',
  review: 'tap the film',
};

/** Where a phone turns the captions, by page: the lab's bar has no CC (UR2-12). */
const TOUCH_CAPTIONS: Readonly<Record<PageName, string>> = {
  player: 'the CC button',
  lab: 'the view menu (⋯), then Captions on or off',
  review: 'the CC button',
};

/** The transport's commands over `transport`, on `page`. */
export const transportCommands = (page: PageName, transport: Transport): ReadonlyArray<Command> => [
  {
    id: 'play.toggle',
    label: 'Play or pause',
    labelIn: (ctx) => PLAY_LABEL[`${ctx.playing}`],
    group: 'Transport',
    keys: ['space'],
    touch: TOUCH_PLAY[page],
    when: always,
    run: quietly(() => transport.toggle()),
  },
  {
    id: 'play.frame-next',
    label: 'Next frame',
    group: 'Transport',
    keys: ['arrowright'],
    about: ['Page'],
    stepped: true,
    touch: 'long-press the film, then Next frame (or ×10)',
    when: always,
    run: quietly((_ctx, how) => transport.stepFrames(FRAMES_BY_STEP[how.step])),
  },
  {
    id: 'play.frame-previous',
    label: 'Previous frame',
    group: 'Transport',
    keys: ['arrowleft'],
    about: ['Page'],
    stepped: true,
    touch: 'long-press the film, then Previous frame (or ×10)',
    when: always,
    run: quietly((_ctx, how) => transport.stepFrames(-FRAMES_BY_STEP[how.step])),
  },
  {
    id: 'play.scene-next',
    label: 'Next scene',
    group: 'Transport',
    keys: [']'],
    about: ['Page'],
    touch: 'long-press the film, then Next scene',
    when: always,
    run: quietly(() => transport.nextScene()),
  },
  {
    id: 'play.scene-previous',
    label: 'Scene start, or the scene before',
    group: 'Transport',
    keys: ['['],
    about: ['Page'],
    touch: 'long-press the film, then Scene start',
    when: always,
    run: quietly(() => transport.previousScene()),
  },
  {
    id: 'view.captions',
    label: 'Captions on or off',
    group: 'View',
    keys: ['c'],
    touch: TOUCH_CAPTIONS[page],
    when: always,
    run: quietly(() => transport.toggleCaptions()),
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
 * The rate chip's title, each step named with its key as `titled` reads it
 * bound now (a hub's), so a rebound key reads as rebound.
 */
export const rateTitle = (titled: (title: string, id: string) => string): string =>
  `The speed: play ${titled('slower', 'play.slower')}, ${titled('faster', 'play.faster')}, or ${titled('at 1×', rateId(1))}`;

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

/** What the ticks' command says, by whether they show. */
const TICKS_LABEL: Readonly<Record<'true' | 'false', string>> = {
  true: 'Hide the ticks',
  false: 'Show the ticks',
};

/** Play's ticks: whether they show, the toggle, and whether the page is Play. */
interface Ticks {
  readonly shown: () => boolean;
  readonly toggle: () => void;
  readonly here: () => boolean;
}

/**
 * Play's ticks on the track (marks, cues, sounds, music acts), off at rest
 * (UR2-1): the viewer turns them on from the view menu (⋯), and this
 * browser keeps the choice. The Lab and the Scenes always show theirs.
 */
export const ticksCommand = (ticks: Ticks): Command => ({
  id: 'view.ticks',
  label: 'Show or hide the ticks',
  labelIn: () => TICKS_LABEL[`${ticks.shown()}`],
  group: 'View',
  keys: [],
  touch: 'the view menu (⋯), then Show the ticks',
  when: () => ticks.here(),
  run: quietly(() => ticks.toggle()),
});

/** What the legend's command says, by whether the legend shows. */
const LEGEND_LABEL: Readonly<Record<'true' | 'false', string>> = {
  true: 'Hide the legend',
  false: 'Show the legend',
};

/** The lab bar's legend: whether it shows, and the toggle. */
interface Legend {
  readonly shown: () => boolean;
  readonly toggle: () => void;
}

/**
 * What the bar's stripes and ticks mean, written once: the bar's legend
 * (`legendHtml`) and the `?` sheet's on a film's page (`keys-sheet.tsx`).
 * Each tick's swatch is its kind's (`.keys .k-<kind>`, `player.css`).
 */
export const BAR_LEGEND = {
  striped: 'striped = narration estimated, not recorded',
  ticks: [
    { kind: 'mark', name: 'mark' },
    { kind: 'cue', name: 'cue' },
    { kind: 'effect', name: 'sound' },
    { kind: 'act', name: 'music act' },
  ],
  names: '(hover or long-press for the name)',
} as const;

/** The bar's legend as markup: the stripes, then each tick's swatch before its name. */
export const legendHtml = (): string =>
  `${BAR_LEGEND.striped} · ticks: ${BAR_LEGEND.ticks.map((t) => `<i class="k-${t.kind}"></i>${t.name}`).join(' ')} ${BAR_LEGEND.names}`;

/**
 * The lab bar's legend (what the stripes and the ticks mean), hidden at
 * rest (UR-114). It has no key: on every page in the studio's shell `?`
 * opens the keys sheet, the one place the keys are listed (UR2-11), and on
 * a film's page the sheet ends on this legend too. ⌘K and the page's
 * long-press menu show it. Play has none: its ticks' legend shows with its
 * ticks (`ticksCommand`).
 */
export const legendCommand = (legend: Legend): Command => ({
  id: 'view.legend',
  label: 'Show or hide the legend',
  labelIn: () => LEGEND_LABEL[`${legend.shown()}`],
  group: 'View',
  keys: [],
  about: ['Page'],
  touch: 'hold the page, or the command menu',
  when: always,
  run: quietly(() => legend.toggle()),
});
