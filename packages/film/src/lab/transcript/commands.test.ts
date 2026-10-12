// The Transcript view's command: one key shows a talk's words and hides
// them, offered on a talk (a film that reads footage) or while the view is
// open, and on no drawn film.

import { Array as Arr, Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON } from '../../command/command.ts';
import { contextAt } from '../../command/context.ts';
import { transcriptCommands } from './commands.ts';

const here = contextAt('lab', '/films/talk/lab/ask#t=1');

/** The command over a film that is a `talk` or not, and a view `open` or not, writing every show and hide to `log`. */
const over = (talk: boolean, open: boolean, log: Array<string>) => {
  const command = Option.getOrThrow(
    Arr.findFirst(
      transcriptCommands({
        talk: () => talk,
        open: () => open,
        show: () => log.push('show'),
        hide: () => log.push('hide'),
      }),
      (c) => c.id === 'lab.transcript',
    ),
  );
  return {
    command,
    run: () => Effect.runSync(command.run(here, BY_BUTTON)),
  };
};

describe('the Transcript view’s command', () => {
  test('one key shows the words on a talk, and hides them while they show', () => {
    const log: Array<string> = [];
    over(true, false, log).run();
    over(true, true, log).run();
    expect(log).toEqual(['show', 'hide']);
    expect(over(true, false, []).command.keys).toEqual(['shift+t']);
    expect(over(true, false, []).command.labelIn?.(here)).toBe('Show the transcript');
    expect(over(true, true, []).command.labelIn?.(here)).toBe('Hide the transcript');
  });

  test('is offered on a talk, or while the view is open, and on no drawn film', () => {
    expect(over(true, false, []).command.when?.(here)).toBe(true);
    expect(over(false, true, []).command.when?.(here)).toBe(true);
    expect(over(false, false, []).command.when?.(here)).toBe(false);
  });
});
