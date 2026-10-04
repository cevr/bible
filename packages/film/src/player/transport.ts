// The player's transport as commands (`command/command.ts`): play and
// pause, a frame back or on, a scene back or on, and the captions. Their
// keys are the transport's usual ones: Space plays, ← and → step one frame
// (with Shift, ten: the coarse step, as an editor's nudge; with Alt, one),
// [ and ] go by scenes, C toggles the captions. Each answers quietly: the
// picture, the time line and the bar show what changed. The preview
// registers them with its page's hub for as long as it lives, so the lab's
// keys, ⌘K and the `?` sheet read them as they read the lab's own.

import { Effect } from 'effect';
import { type Command, type Invocation, quiet } from '../command/command.ts';

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
