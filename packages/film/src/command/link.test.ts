import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import { Clipboard, ClipboardRefused } from '../browser/clipboard.ts';
import { hostOf } from '../browser/host.ts';
import { beatSelection, pageHref } from '../core/api.ts';
import { BY_BUTTON, type Command, Receipt } from './command.ts';
import { contextAt, withSelection } from './context.ts';
import { linkCommands, linkOf } from './link.ts';
import { Selection } from './selection.ts';
import { EVERYWHERE, targetAt, targetAttr } from './target.ts';
import { contextRows } from './menu.ts';

const ORIGIN = 'https://lab.slow.test';

/** Copy link over a clipboard in memory, and what was written to it. */
const copier = () => {
  const written: Array<string> = [];
  const [command] = linkCommands(hostOf(Clipboard.memory(written, ORIGIN)));
  return { command: Option.getOrThrow(Option.fromUndefinedOr(command)), written };
};

const run = (command: Command, ctx: ReturnType<typeof contextAt>) =>
  Effect.runSync(command.run(ctx, { ...BY_BUTTON, input: 'pointer' }));

describe('Copy link', () => {
  const here = pageHref.studio('f', { sel: beatSelection('one') }, Option.some(1.5));
  const one = Selection.cases.Scene.make({ film: 'f', scene: 'one' });
  const page = { ...contextAt('player', here), selection: [one] };

  test("copies the page's own URL, whole, for the thing the URL cites or for nothing", () => {
    const { command, written } = copier();
    expect(run(command, page)).toEqual(
      Receipt.Said({
        said: 'Copied the link to scene one',
        undo: Option.none(),
        bound: Option.none(),
        tone: 'done',
      }),
    );
    run(command, withSelection(page, []));
    expect(written).toEqual([`${ORIGIN}${here}`, `${ORIGIN}${here}`]);
  });

  test("copies the page's URL whole for the version whose sheet the URL opens", () => {
    const set = '/sets/r/cold?view=wipe&other=b&inspect=b#t=12';
    const version = Selection.cases.Version.make({ folder: 'r', point: 'cold', version: 'b' });
    expect(linkOf({ ...contextAt('review', set), selection: [version] })).toBe(set);
  });

  test('copies the citation of another thing a context menu opened on', () => {
    const two = withSelection(page, [Selection.cases.Beat.make({ beat: 'two' })]);
    expect(linkOf(two)).toBe(pageHref.studio('f', { sel: beatSelection('two') }, Option.some(1.5)));
    const version = Selection.cases.Version.make({ folder: 'r', point: 'cold', version: 'b' });
    // A version's link opens its set with its sheet open.
    expect(linkOf(withSelection(page, [version]))).toBe(pageHref.set('r', 'cold', 'b'));
  });

  test('says why when the browser keeps the link off the clipboard', () => {
    const refusing = Layer.succeed(
      Clipboard,
      Clipboard.of({
        copyLink: () => Effect.fail(new ClipboardRefused({ reason: 'NotAllowedError' })),
      }),
    );
    const [command] = linkCommands(hostOf(refusing));
    expect(
      Option.map(Option.fromUndefinedOr(command), (c) => run(c, withSelection(page, []))),
    ).toEqual(
      Option.some(
        Receipt.Said({
          said: 'The browser kept the link off the clipboard: NotAllowedError',
          undo: Option.none(),
          bound: Option.none(),
          tone: 'refused',
        }),
      ),
    );
  });
});

describe('a context menu', () => {
  const ctx = contextAt('player', pageHref.studio('f'));
  const about = (id: string, targets: Command['about']): Command => ({
    id,
    label: id,
    group: 'g',
    about: targets,
    touch: 'a test command',
    when: () => true,
    run: () => Effect.succeed(Receipt.Quiet()),
  });
  const commands = [
    about('anywhere', EVERYWHERE),
    about('beat.split', ['Beat']),
    about('page.only', ['Page']),
    about('both', ['Beat', 'Page']),
  ];
  const ids = (c: typeof ctx) =>
    contextRows(commands, c).flatMap(([, rows]) => rows.map((r) => r.command.id));

  test('lists the commands about the thing it opened on, or about the page, its own first', () => {
    expect(ids(withSelection(ctx, [Selection.cases.Beat.make({ beat: 'one' })]))).toEqual([
      'beat.split',
      'both',
      'anywhere',
    ]);
    expect(ids(ctx)).toEqual(['page.only', 'both', 'anywhere']);
  });

  test('reads the thing from the nearest marked element under the press', () => {
    const rise = Selection.cases.Beat.make({ beat: 'one' });
    const attr = targetAttr(rise);
    const marked = { getAttribute: (name: string) => new Map([['data-target', attr]]).get(name) };
    const press = Object.assign(new EventTarget(), {
      closest: (selector: string) => new Map([['[data-target]', marked]]).get(selector),
    });
    expect(targetAt(Option.some(press))).toEqual(Option.some(rise));
    const bare = Object.assign(new EventTarget(), {
      closest: () => Option.getOrNull(Option.none()),
    });
    expect(targetAt(Option.some(bare))).toEqual(Option.none());
    expect(targetAt(Option.some(new EventTarget()))).toEqual(Option.none());
  });
});
