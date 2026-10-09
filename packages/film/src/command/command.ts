// The pages' commands: every verb a page offers, declared once as data, so
// its buttons, its context menus, ⌘K, the `?` sheet and its keys all read
// one registry. A command has an id, a label, a group (its section in a menu
// or ⌘K), its default keys, the kinds of selection it acts on (`about`: what
// puts it in that thing's context menu), a typed `when` over the page's
// `Context` (VS Code's `when` and Blender's `poll`, as a plain predicate: a
// command not available is not shown in menus, and is not run by its key),
// and a `run` that answers with a `Receipt`: what it did, and the command
// that undoes it, for the toast, bound to the change it made when it made
// one (`Bound`: that command then acts on that change or says why not,
// `fits`). A page's registry lives as long as the
// page; a component registers its commands for as long as it is mounted
// (`register` answers the unregister). A later registration of an id
// replaces the earlier one until it is unregistered. Framework-free, outside
// the lab (`src/command/`), so the player, which never imports the lab,
// declares its transport here too.

import { Array as Arr, Data, Effect, Option } from 'effect';
import type { Gave } from '../core/catalogue.ts';
import type { ChangeId } from '../core/schema.ts';
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
    /**
     * The command its button runs, labelled as that command is: what undoes
     * it, or for a refusal the way past it (Accept anyway).
     */
    readonly undo: Option.Option<CommandId>;
    /**
     * The one change its button acts on (`Bound`), when it names one: its
     * command then acts on that change or says why not (`Command.fits`),
     * never on whatever is newest, nor on another film's.
     */
    readonly bound: Option.Option<Bound>;
    readonly tone: Tone;
  };
}>;
export const Receipt = Data.taggedEnum<Receipt>();

/**
 * The change a receipt's button is about, each by its own identity: a change
 * in the film's history, by the id the lab gave it (`HistoryStep.change`); or
 * an approve run's approvals, by its op and the scenes it gave one to
 * (`Project.gave`). Never by a name, a time, or one id spelled as another.
 */
export type Bound = ChangeBound | GaveBound;

export interface ChangeBound {
  readonly film: string;
  readonly change: ChangeId;
}

interface GaveBound {
  readonly film: string;
  readonly gave: Pick<Gave, 'op' | 'scenes'> & {
    /** A set's approve names its version too: the point it is of, and the version approved. */
    readonly of?: { readonly point: string; readonly version: string };
  };
}

/** The history's change `bound` names; none for an approve's. */
export const boundChange = (bound: Bound): Option.Option<ChangeId> =>
  Option.map(
    Option.liftPredicate(bound, (b): b is ChangeBound => 'change' in b),
    (b) => b.change,
  );

/** The approve run `bound` names; none for a change in the history. */
export const boundGave = (bound: Bound): Option.Option<GaveBound['gave']> =>
  Option.map(
    Option.liftPredicate(bound, (b): b is GaveBound => 'gave' in b),
    (b) => b.gave,
  );

/**
 * Why a command cannot act on a receipt's change, in words to say: `Now`
 * while it may yet (the page still reading the lab's history, another film's
 * change, another change before it), so the receipt holds its button; or
 * `Never` (the lab no longer has the change: it restarted, or the change was
 * stepped already and left its history), so the receipt retires it.
 */
export type Unfit = Data.TaggedEnum<{
  Now: { readonly reason: string };
  Never: { readonly reason: string };
}>;
export const Unfit = Data.taggedEnum<Unfit>();

/**
 * A receipt's tone: done, refused (in the refusal's words), or busy (a
 * write on its way, said until its own receipt replaces it).
 */
type Tone = 'done' | 'refused' | 'busy';

/** A receipt that says nothing. */
export const quiet: Receipt = Receipt.Quiet();

/** A command's `run` that does `act` and says nothing (`quiet`): the page shows what changed. */
export const quietly =
  (act: (ctx: Context, how: Invocation) => void) =>
  (ctx: Context, how: Invocation): Effect.Effect<Receipt> =>
    Effect.sync(() => {
      act(ctx, how);
      return quiet;
    });

/**
 * A receipt's Undo: the command, and the change it acts on. There is no Undo
 * without the change: a step that names none steps whatever is newest, which
 * for a write that changed nothing (a value already so) is an earlier
 * write's change, or another film's.
 */
export interface Undoing {
  readonly command: CommandId;
  readonly bound: Bound;
}

/** A receipt that says what was done, with its Undo when it made a change (`Undoing`). */
export const said = (text: string, undo: Option.Option<Undoing> = Option.none()): Receipt =>
  Receipt.Said({
    said: text,
    undo: Option.map(undo, (u) => u.command),
    bound: Option.map(undo, (u) => u.bound),
    tone: 'done',
  });

/** A receipt that says why nothing was done, with the command that goes past it, if any. */
export const refused = (text: string, past: Option.Option<CommandId> = Option.none()): Receipt =>
  Receipt.Said({ said: text, undo: past, bound: Option.none(), tone: 'refused' });

/** A receipt that says what is on its way (`undoing…`): its slot's next receipt replaces it. */
export const busy = (text: string): Receipt =>
  Receipt.Said({ said: text, undo: Option.none(), bound: Option.none(), tone: 'busy' });

/** What moved, from before to after: `cue slam start 0.42 → 0.38 s`. */
export const moved = (what: string, before: string, after: string, unit = ''): string =>
  [what, before, '→', after, ...[unit].filter((u) => u !== '')].join(' ');

/** How a command was asked for: the step a key's modifiers pick, and where it came from. */
export interface Invocation {
  /** `coarse` with the keymap's coarse modifier (Shift: ×10), `fine` with its fine one. */
  readonly step: 'normal' | 'coarse' | 'fine';
  readonly via: 'key' | 'menu' | 'palette' | 'button';
  /** The change a receipt's button asked it to act on (`Receipt.Said.bound`); absent from a key, a menu, ⌘K. */
  readonly bound?: Bound;
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
  /**
   * How a phone reaches it, for the `?` sheet (`long-press a cue`). Every
   * command has one (G8, mobile-first): a verb only a key reaches is a gap in
   * the chrome to fill, not a command to register.
   */
  readonly touch: string;
  /**
   * Found only by typing (a Go to entry, one per thing on the page): ⌘K
   * lists it once a word is typed; the `?` sheet never, and a context menu
   * only when it is `about` the thing (a point's marks on its card).
   */
  readonly typed?: true;
  /** Whether it is available in `ctx`: shown in menus, run by its keys. */
  readonly when: (ctx: Context) => boolean;
  /**
   * Why it cannot act on the one change `bound` names (`Unfit`: for now,
   * another film's or another change before it; or never, a change the lab
   * no longer has), or none when it can: then `run` hears it as
   * `how.bound`. A command without one acts on no single change, so a
   * receipt bound to one never runs it.
   */
  readonly fits?: (bound: Bound, ctx: Context) => Option.Option<Unfit>;
  readonly run: (ctx: Context, how: Invocation) => Effect.Effect<Receipt>;
}

/** Why `command` cannot act on the change `bound` names in `ctx` (`Command.fits`); none when it can. */
export const unfit = (command: Command, bound: Bound, ctx: Context): Option.Option<Unfit> =>
  Option.match(Option.fromUndefinedOr(command.fits), {
    onNone: () => Option.some(Unfit.Never({ reason: `${command.label} acts on no single change` })),
    onSome: (fits) => fits(bound, ctx),
  });

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
