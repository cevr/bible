// The Source view's commands: one key shows the code and hides it, a cue's
// menu holds the view on the line that writes it (the frame, until the file
// is read), and every one has a touch path.

import { Array as Arr, Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../../command/command.ts';
import { contextAt, withSelection } from '../../command/context.ts';
import { cueOf, knobOf } from '../../command/selection.ts';
import { sourceCommands } from './commands.ts';

/** The ids of the Source view's commands, as the palette and the keymap name them. */
const SOURCE = 'lab.source';
const SOURCE_CUE = 'lab.source.cue';
import { codeText } from './open.ts';

const here = contextAt('lab', '/films/f/lab/robe#t=1');

/** The commands over a view that is `open` or not, writing every show and hide to `log`. */
const over = (open: boolean, lines: Record<string, number>, log: Array<string>) => {
  const commands = sourceCommands({
    open: () => open,
    show: (to) => log.push(`show ${codeText(Option.some(to))}`),
    hide: () => log.push('hide'),
    lineOfCue: (scene, name) => Option.fromUndefinedOr(lines[`${scene}/${name}`]),
  });
  const command = (id: string) => Option.getOrThrow(Arr.findFirst(commands, (c) => c.id === id));
  return {
    command,
    run: (id: string, ctx = here) => Effect.runSync(command(id).run(ctx, BY_BUTTON)),
  };
};

describe('the Source view’s commands', () => {
  test('one key shows the code, and hides it while it is open', () => {
    const shut: Array<string> = [];
    over(false, {}, shut).run(SOURCE);
    expect(shut).toEqual(['show follow']);
    const open: Array<string> = [];
    const view = over(true, {}, open);
    view.run(SOURCE);
    expect(open).toEqual(['hide']);
    expect(view.command(SOURCE).labelIn?.(here)).toBe('Hide the code');
    expect(over(false, {}, []).command(SOURCE).labelIn?.(here)).toBe('Show the code');
    expect(view.command(SOURCE).keys).toEqual(['shift+c']);
  });

  test('a cue’s menu holds the view on its line, the frame until the file is read', () => {
    const log: Array<string> = [];
    const view = over(false, { 'robe/lift': 41 }, log);
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
      show: () => {},
      hide: () => {},
      lineOfCue: () => Option.none(),
    });
    expect(all.map((c) => c.id)).toEqual([SOURCE, SOURCE_CUE]);
    for (const c of all) expect(c.touch).not.toBe('');
  });
});
