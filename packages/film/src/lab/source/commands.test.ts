// The Source view's commands: one key shows the code and hides it, Code mode
// enters and leaves to following, a cue's menu holds the view on the line
// that writes it (the frame, until the file is read), and every one has a
// touch path.

import { Array as Arr, Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../../command/command.ts';
import { contextAt, withSelection } from '../../command/context.ts';
import { cueOf, knobOf } from '../../command/selection.ts';
import { sourceCommands } from './commands.ts';
import { codeText } from './open.ts';

/** The ids of the Source view's commands, as the palette and the keymap name them. */
const SOURCE = 'lab.source';
const SOURCE_LIVE = 'lab.source.live';
const SOURCE_CUE = 'lab.source.cue';

const here = contextAt('lab', '/films/f/lab/robe#t=1');

/** How the view the commands drive stands: open or shut, and in Code mode or not. */
type Standing = 'shut' | 'open' | 'live';

/** The commands over a view standing `as`, writing every show and hide to `log`. */
const over = (as: Standing, lines: Record<string, number>, log: Array<string>) => {
  const commands = sourceCommands({
    open: () => as !== 'shut',
    live: () => as === 'live',
    show: (to) => log.push(`show ${codeText(Option.some(to))}`),
    hide: () => log.push('hide'),
    lineOfCue: (scene, name) => Option.fromUndefinedOr(lines[`${scene}/${name}`]),
  });
  const command = (id: string) => Option.getOrThrow(Arr.findFirst(commands, (c) => c.id === id));
  return {
    command,
    run: (id: string, ctx = here) =>
      Effect.runSync(command(id).run(ctx, { ...BY_BUTTON, input: 'pointer' })),
  };
};

describe('the Source view’s commands', () => {
  test('one key shows the code, and hides it while it is open', () => {
    const shut: Array<string> = [];
    over('shut', {}, shut).run(SOURCE);
    expect(shut).toEqual(['show follow']);
    const open: Array<string> = [];
    const view = over('open', {}, open);
    view.run(SOURCE);
    expect(open).toEqual(['hide']);
    expect(view.command(SOURCE).labelIn?.(here)).toBe('Hide the code');
    expect(over('shut', {}, []).command(SOURCE).labelIn?.(here)).toBe('Show the code');
    expect(view.command(SOURCE).keys).toEqual(['shift+c']);
    // In Code mode the key still hides the view whole.
    const live: Array<string> = [];
    over('live', {}, live).run(SOURCE);
    expect(live).toEqual(['hide']);
  });

  test('Code mode enters from shut or following, and leaves to following', () => {
    const log: Array<string> = [];
    over('shut', {}, log).run(SOURCE_LIVE);
    over('open', {}, log).run(SOURCE_LIVE);
    over('live', {}, log).run(SOURCE_LIVE);
    expect(log).toEqual(['show live', 'show live', 'show follow']);
    expect(over('open', {}, []).command(SOURCE_LIVE).labelIn?.(here)).toBe('Code mode');
    expect(over('live', {}, []).command(SOURCE_LIVE).labelIn?.(here)).toBe('Leave code mode');
    // ⌘K's alone: no key of its own, and on no context menu.
    expect(over('shut', {}, []).command(SOURCE_LIVE).keys).toBeUndefined();
    expect(over('shut', {}, []).command(SOURCE_LIVE).about).toBeUndefined();
  });

  test('a cue’s menu holds the view on its line, the frame until the file is read', () => {
    const log: Array<string> = [];
    const view = over('shut', { 'robe/lift': 41 }, log);
    const cue = view.command(SOURCE_CUE);
    expect(cue.when(here)).toBe(false);
    expect(cue.when(withSelection(here, [knobOf('robe', 'lift')]))).toBe(false);
    view.run(SOURCE_CUE, withSelection(here, [cueOf('robe', 'lift')]));
    view.run(SOURCE_CUE, withSelection(here, [cueOf('robe', 'fall')]));
    expect(log).toEqual(['show 41', 'show follow']);
  });

  test('every command says how a phone reaches it', () => {
    const all = sourceCommands({
      open: () => false,
      live: () => false,
      show: () => {},
      hide: () => {},
      lineOfCue: () => Option.none(),
    });
    expect(all.map((c) => c.id)).toEqual([SOURCE, SOURCE_LIVE, SOURCE_CUE]);
    for (const c of all) expect(c.touch).not.toBe('');
  });
});
