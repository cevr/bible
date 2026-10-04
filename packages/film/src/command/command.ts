// The pages' commands: every verb a page offers, declared once as data, so
// its buttons, its context menus, ⌘K, the `?` sheet and its keys all read
// one registry. A command has an id, a label, a group (its section in a menu
// or ⌘K), its default keys, the kinds of selection it acts on (`about`: what
// puts it in that thing's context menu), a typed `when` over the page's
// `Context` (VS Code's `when` and Blender's `poll`, as a plain predicate: a
// command not available is not shown in menus, and is not run by its key),
// and a `run` that answers with a `Receipt`: what it did, and the command
// that undoes it, for the toast. A page's registry lives as long as the
// page; a component registers its commands for as long as it is mounted
// (`register` answers the unregister). A later registration of an id
// replaces the earlier one until it is unregistered. Framework-free, outside
// the lab (`src/command/`), so the player, which never imports the lab,
// declares its transport here too.

import { Array as Arr, Data, Option } from 'effect';
import type { Effect } from 'effect';
import type { Context, Focus } from './context.ts';
import type { Target } from './target.ts';

/** A command's id: `group.verb` by convention (`edit.undo`, `play.toggle`). */
export type CommandId = string;

/** How a command ended, for the toast: quietly, or with words and the command that undoes it. */
export type Receipt = Data.TaggedEnum<{
  /** Nothing to say: the page shows what changed (a pick, a seek). */
  Quiet: {};
  /** What it did (or why it did not), and the command that undoes it, if any. */
  Said: {
    readonly said: string;
    readonly undo: Option.Option<CommandId>;
    readonly tone: Tone;
  };
}>;
export const Receipt = Data.taggedEnum<Receipt>();

/**
 * A receipt's tone: done, refused (in the refusal's words), or busy (a
 * write on its way, said until its own receipt replaces it).
 */
type Tone = 'done' | 'refused' | 'busy';

/** A receipt that says nothing. */
export const quiet: Receipt = Receipt.Quiet();

/** A receipt that says what was done, with the command that undoes it. */
export const said = (text: string, undo: Option.Option<CommandId> = Option.none()): Receipt =>
  Receipt.Said({ said: text, undo, tone: 'done' });

/** A receipt that says why nothing was done. */
export const refused = (text: string): Receipt =>
  Receipt.Said({ said: text, undo: Option.none(), tone: 'refused' });

/** A receipt that says what is on its way (`undoing…`): its slot's next receipt replaces it. */
export const busy = (text: string): Receipt =>
  Receipt.Said({ said: text, undo: Option.none(), tone: 'busy' });

/** What moved, from before to after: `cue slam start 0.42 → 0.38 s`. */
export const moved = (what: string, before: string, after: string, unit = ''): string =>
  [what, before, '→', after, ...[unit].filter((u) => u !== '')].join(' ');

/** How a command was asked for: the step a key's modifiers pick, and where it came from. */
export interface Invocation {
  /** `coarse` with the keymap's coarse modifier (Shift: ×10), `fine` with its fine one. */
  readonly step: 'normal' | 'coarse' | 'fine';
  readonly via: 'key' | 'menu' | 'palette' | 'button';
}

/** A command asked for by a button: the normal step. */
export const BY_BUTTON: Invocation = { step: 'normal', via: 'button' };

/** One verb of a page. */
export interface Command {
  readonly id: CommandId;
  /** What menus and ⌘K print. */
  readonly label: string;
  /** The label read with the context it is shown in, when it depends on it (`Loop` or `Stop loop`). */
  readonly labelIn?: (ctx: Context) => string;
  /** Its section in a menu and in ⌘K: commands of one group sit together. */
  readonly group: string;
  /** Its default keys (`keymap.ts` chords: `mod+z`, `shift+arrowleft`, `g s`, `?`). */
  readonly keys?: ReadonlyArray<string>;
  /** The targets whose context menu shows it (a kind of thing, or `Page`: `target.ts`); none: ⌘K and keys only. */
  readonly about?: ReadonlyArray<Target>;
  /**
   * Where focus may be for its keys to run it (`Focus`): the page by
   * default; Escape also in a field; the studio's own keys only there.
   */
  readonly keysIn?: ReadonlyArray<Focus>;
  /** Whether Shift (coarse) and Alt (fine) on its keys pick its step instead of another command. */
  readonly stepped?: boolean;
  /** How a phone reaches it, for the `?` sheet (`long-press a cue`). */
  readonly touch?: string;
  /**
   * Found only by typing (a Go to entry, one per thing on the page): ⌘K
   * lists it once a word is typed; the `?` sheet never, and a context menu
   * only when it is `about` the thing (a point's marks on its card).
   */
  readonly typed?: true;
  /** Whether it is available in `ctx`: shown in menus, run by its keys. */
  readonly when: (ctx: Context) => boolean;
  readonly run: (ctx: Context, how: Invocation) => Effect.Effect<Receipt>;
}

/** A command's label in `ctx`. */
export const labelOf = (command: Command, ctx: Context): string =>
  Option.match(Option.fromUndefinedOr(command.labelIn), {
    onNone: () => command.label,
    onSome: (read) => read(ctx),
  });

/** A page's commands. */
export interface Commands {
  /** Add `commands` until the returned function is called; a later id replaces an earlier one. */
  readonly register: (...commands: ReadonlyArray<Command>) => () => void;
  /** Every command registered, each id once (its latest registration), in registration order. */
  readonly all: () => ReadonlyArray<Command>;
  /** The commands available in `ctx`. */
  readonly available: (ctx: Context) => ReadonlyArray<Command>;
  /** The command registered as `id`, if one is. */
  readonly byId: (id: CommandId) => Option.Option<Command>;
  /** Call `changed` each time a registration comes or goes, until the returned stop. */
  readonly subscribe: (changed: () => void) => () => void;
}

/** An empty registry, for one page. */
export const makeCommands = (): Commands => {
  // Every live registration in order; an id's last one wins.
  let entries: ReadonlyArray<{ readonly token: symbol; readonly command: Command }> = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const all = (): ReadonlyArray<Command> => {
    const latest = new Map<CommandId, Command>();
    for (const entry of entries) latest.set(entry.command.id, entry.command);
    // Ordered by each id's first registration, so a replacement keeps its place.
    return Arr.dedupe(entries.map((e) => e.command.id)).flatMap((id) =>
      Option.toArray(Option.fromUndefinedOr(latest.get(id))),
    );
  };
  return {
    register: (...commands) => {
      const added = commands.map((command) => ({ token: Symbol(command.id), command }));
      entries = [...entries, ...added];
      changed();
      return () => {
        const tokens = new Set(added.map((a) => a.token));
        entries = entries.filter((e) => !tokens.has(e.token));
        changed();
      };
    },
    all,
    available: (ctx) => all().filter((command) => command.when(ctx)),
    byId: (id) => Option.fromUndefinedOr(all().find((command) => command.id === id)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * Run `command` in `ctx` if it is available there: its receipt, or none
 * when it is not available (a key that names it does nothing then).
 */
export const runIfAvailable = (
  command: Command,
  ctx: Context,
  how: Invocation,
): Option.Option<Effect.Effect<Receipt>> =>
  Option.map(
    Option.liftPredicate(command, (c) => c.when(ctx)),
    (c) => c.run(ctx, how),
  );
