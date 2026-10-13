// The Transcript view's commands: one key shows a talk's words and hides
// them, offered on a talk (a film that reads footage) or while the view is
// open, and on no drawn film; and its verbs on its words, about the word a
// menu opened on (the words selected when it lies in them) or, from the
// view's buttons, the words selected: Select to here (a phone's range: no
// Shift), Cut, Restore, Mark here, none offered while a write is out.

import { Array as Arr, Effect, Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { BY_BUTTON, type Command } from '../../command/command.ts';
import { type Context, contextAt, withSelection } from '../../command/context.ts';
import { contextRows } from '../../command/menu.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import { extendedTo, transcriptCommands } from './commands.ts';
import type { Row } from './lit.ts';

const here = contextAt('lab', '/films/talk/lab/ask#t=1');

const words = (scene: string, from: number, to: number): WordsSelection =>
  Selection.cases.Words.make({ scene, from, to });
/** The menu opened on word `index` of `scene`. */
const onWord = (scene: string, index: number): Context =>
  withSelection(here, [words(scene, index, index)]);

/** Each section's words 0–9, word 5 struck. */
const ROWS: ReadonlyArray<Row> = Arr.makeBy(10, (index) => ({
  index,
  text: `w${index}`,
  struck: index === 5,
  from: index * 3,
  start: Option.none(),
}));

/** The commands over a film that is a `talk` or not, a view `open` or not, `selection` selected, every verb written to `log`. */
const over = (
  log: Array<string>,
  options: {
    readonly talk?: boolean;
    readonly open?: boolean;
    readonly selection?: Option.Option<WordsSelection>;
    readonly writing?: boolean;
  } = {},
) => {
  const said = (verb: string) => (w: WordsSelection) =>
    log.push(`${verb} ${w.scene} ${w.from}-${w.to}`);
  const commands = transcriptCommands({
    talk: () => options.talk ?? true,
    open: () => options.open ?? true,
    show: () => log.push('show'),
    hide: () => log.push('hide'),
    selection: () => options.selection ?? Option.none(),
    rows: (w) => ROWS.filter((r) => r.index >= w.from && r.index <= w.to),
    writing: () => options.writing ?? false,
    select: said('select'),
    cut: said('cut'),
    restore: said('restore'),
    mark: said('mark'),
  });
  const command = (id: string): Command =>
    Option.getOrThrow(Arr.findFirst(commands, (c) => c.id === id));
  return {
    command,
    commands,
    /** Run command `id` in `ctx` when it is offered there; whether it was. */
    run: (id: string, ctx: Context = here) => {
      const offered = command(id).when(ctx);
      if (offered) Effect.runSync(command(id).run(ctx, BY_BUTTON));
      return offered;
    },
  };
};

describe('the Transcript view’s command', () => {
  test('one key shows the words on a talk, and hides them while they show', () => {
    const log: Array<string> = [];
    over(log, { open: false }).run('lab.transcript');
    over(log, { open: true }).run('lab.transcript');
    expect(log).toEqual(['show', 'hide']);
    expect(over([], { open: false }).command('lab.transcript').keys).toEqual(['shift+t']);
    expect(over([], { open: false }).command('lab.transcript').labelIn?.(here)).toBe(
      'Show the transcript',
    );
    expect(over([], { open: true }).command('lab.transcript').labelIn?.(here)).toBe(
      'Hide the transcript',
    );
  });

  test('is offered on a talk, or while the view is open, and on no drawn film', () => {
    const when = (talk: boolean, open: boolean) =>
      over([], { talk, open }).command('lab.transcript').when(here);
    expect(when(true, false)).toBe(true);
    expect(when(false, true)).toBe(true);
    expect(when(false, false)).toBe(false);
  });
});

describe('the words a verb acts on', () => {
  const selection = Option.some(words('ask', 3, 6));

  /** What Cut, run where `ctx` says with `selected` selected, cut: none when it is not offered there. */
  const cutAt = (ctx: Context, selected: Option.Option<WordsSelection>) => {
    const log: Array<string> = [];
    over(log, { selection: selected }).run('transcript.cut', ctx);
    return log;
  };

  test('a word inside the words selected is about them all; any other word about itself', () => {
    expect(cutAt(onWord('ask', 4), selection)).toEqual(['cut ask 3-6']);
    expect(cutAt(onWord('ask', 8), selection)).toEqual(['cut ask 8-8']);
    expect(cutAt(onWord('answer', 4), selection)).toEqual(['cut answer 4-4']);
    expect(cutAt(onWord('ask', 8), Option.none())).toEqual(['cut ask 8-8']);
  });

  test("opened on no one word (the view's buttons, a section), the words selected, unless the menu is about another section", () => {
    expect(cutAt(here, selection)).toEqual(['cut ask 3-6']);
    expect(cutAt(withSelection(here, [words('ask', 0, 9)]), selection)).toEqual(['cut ask 3-6']);
    expect(cutAt(withSelection(here, [words('answer', 0, 9)]), selection)).toEqual([]);
    expect(cutAt(here, Option.none())).toEqual([]);
  });

  test('a selection extended to a word runs from its first word to that one, whichever comes first; another section’s word is alone', () => {
    expect(extendedTo(selection, 'ask', 9)).toEqual(words('ask', 3, 9));
    expect(extendedTo(selection, 'ask', 1)).toEqual(words('ask', 1, 3));
    expect(extendedTo(selection, 'ask', 4)).toEqual(words('ask', 3, 4));
    expect(extendedTo(selection, 'answer', 4)).toEqual(words('answer', 4, 4));
    expect(extendedTo(Option.none(), 'ask', 2)).toEqual(words('ask', 2, 2));
  });
});

describe('the view’s verbs', () => {
  test('Select to here, on a word held, extends the words selected in its section to it: a range with no Shift', () => {
    const log: Array<string> = [];
    const verbs = over(log, { selection: Option.some(words('ask', 3, 3)) });
    expect(verbs.run('transcript.select-to', onWord('ask', 4))).toBe(true);
    expect(log).toEqual(['select ask 3-4']);
  });

  test('Select to here is not offered with nothing selected in the word’s section, on the word selected alone, or on no one word', () => {
    const select = (selection: Option.Option<WordsSelection>, ctx: Context) =>
      over([], { selection }).command('transcript.select-to').when(ctx);
    expect(select(Option.none(), onWord('ask', 4))).toBe(false);
    expect(select(Option.some(words('answer', 1, 1)), onWord('ask', 4))).toBe(false);
    expect(select(Option.some(words('ask', 4, 4)), onWord('ask', 4))).toBe(false);
    expect(select(Option.some(words('ask', 3, 3)), here)).toBe(false);
  });

  test("Cut, Restore and Mark here act on the words the menu opened on, or the view's buttons on the words selected", () => {
    const log: Array<string> = [];
    const verbs = over(log, { selection: Option.some(words('ask', 3, 6)) });
    verbs.run('transcript.cut', onWord('ask', 4));
    verbs.run('transcript.cut', onWord('ask', 8));
    verbs.run('transcript.restore', here);
    verbs.run('transcript.mark', here);
    expect(log).toEqual(['cut ask 3-6', 'cut ask 8-8', 'restore ask 3-6', 'mark ask 3-6']);
  });

  test('Cut and Mark here need a word the cut plays, Restore one it strikes', () => {
    const offered = (id: string, ctx: Context) => over([]).command(id).when(ctx);
    expect(offered('transcript.cut', onWord('ask', 5))).toBe(false);
    expect(offered('transcript.mark', onWord('ask', 5))).toBe(false);
    expect(offered('transcript.restore', onWord('ask', 5))).toBe(true);
    expect(offered('transcript.restore', onWord('ask', 4))).toBe(false);
    expect(offered('transcript.cut', onWord('ask', 4))).toBe(true);
  });

  test('none of the writes is offered while a write is out, or with the view shut', () => {
    // Each on a word it is offered on otherwise: a played word for Cut and Mark here, a struck one for Restore.
    for (const [id, word] of [
      ['transcript.cut', 4],
      ['transcript.mark', 4],
      ['transcript.restore', 5],
    ] as const) {
      expect(over([]).command(id).when(onWord('ask', word))).toBe(true);
      expect(over([], { writing: true }).command(id).when(onWord('ask', word))).toBe(false);
      expect(over([], { open: false }).command(id).when(onWord('ask', word))).toBe(false);
    }
  });

  test("a word's menu lists the view's verbs that fit it, each reachable by touch", () => {
    const verbs = over([], { selection: Option.some(words('ask', 3, 3)) });
    const ctx = onWord('ask', 4);
    const listed = contextRows(
      verbs.commands.filter((c) => c.when(ctx)),
      ctx,
    ).flatMap(([, rows]) => rows.map((row) => row.command.id));
    expect(listed).toEqual(['transcript.select-to', 'transcript.cut', 'transcript.mark']);
    for (const c of verbs.commands) expect(c.touch).not.toBe('');
  });
});
