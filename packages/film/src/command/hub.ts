// A page's commands, wired: its registry (`command.ts`), its keymap
// (`keymap.ts`) with the viewer's overrides kept in the browser (a
// `StoreRuntime`, the viewer's local store live: `film-keymap`, as JSON), the
// context its commands read (`context.ts`: the page's URL and what is
// selected there, refined by whatever on the page knows more, such as
// whether the film plays), the one key listener on the page (`listen`,
// through `Keys`; every press heard, bound or not, `presses`), and the receipts every command answers with, and those a
// page's writes announce as they land (`announce`: a drag's, a field's, a
// say's), handed to whoever shows them, each in its slot (the command's id,
// or the writer's name: a slot's next receipt replaces its last, so
// `undoing…` becomes what was undone). Built once at each page's root (`mountPlay`,
// `mountLab`, `mountReview`) and handed to everything on the page, as the
// host is. A command runs only where its `when` holds, whether its key, a
// menu, ⌘K or a button asked for it. Framework-free.

import { Effect, Option } from 'effect';
import type { Clipboard } from '../browser/clipboard.ts';
import { type KeyPress, Keys } from '../browser/keys.ts';
import { type StoreRuntime, keptJson } from '../browser/storage.ts';
import type { PageName } from '../core/api.ts';
import {
  type Command,
  type CommandId,
  type Commands,
  type Invocation,
  type Receipt,
  makeCommands,
} from './command.ts';
import { type Context, type Focus, contextAt, focusOf, withFocused } from './context.ts';
import {
  KeymapOverrides,
  Resolved,
  bindingsOf,
  chordLabel,
  keysOf,
  resolve,
  titleWith,
} from './keymap.ts';
import { linkCommands } from './link.ts';
import { selectionOf } from './selection.ts';
import { targetAt } from './target.ts';

/** A page's commands, its keymap, its context and its receipts. */
export interface Hub {
  readonly commands: Commands;
  /** Whether chords read as a Mac's (⌘) or a PC's (Ctrl): the page's keyboard. */
  readonly mac: boolean;
  /** The page's context now, with focus `focus` (the page's, when a menu or a button asks). */
  readonly context: (focus?: Focus) => Context;
  /** Refine every context with `part` (what the page knows that its URL does not), until the returned stop. */
  readonly refine: (part: (ctx: Context) => Context) => () => void;
  /** Run `command` in `ctx` (the page's context now) if it is available there. */
  readonly invoke: (command: Command, how: Invocation, ctx?: Context) => void;
  /** Run the command registered as `id` (a receipt's Undo), if it is registered and available. */
  readonly invokeId: (id: CommandId, how: Invocation) => void;
  /** Hand every receipt to `sink`, with its slot, until the returned stop. */
  readonly receipts: (sink: (receipt: Receipt, slot: string) => void) => () => void;
  /** Tell `listener` of every key pressed on the page, whatever the keymap does with it, until the returned stop. */
  readonly presses: (listener: () => void) => () => void;
  /** Say `receipt` in `slot`: what a write no command ran said as it landed, or while it is out. */
  readonly announce: (receipt: Receipt, slot: string) => void;
  /** The viewer's keymap overrides, as kept. */
  readonly overrides: () => KeymapOverrides;
  /** Keep `next` as the viewer's overrides: a reload keeps them too. */
  readonly setOverrides: (next: KeymapOverrides) => void;
  /** The keys bound to `id` now. */
  readonly keysOf: (id: CommandId) => ReadonlyArray<string>;
  /** Call `changed` each time a command comes or goes or a key is rebound, until the returned stop. */
  readonly subscribe: (changed: () => void) => () => void;
  /** Hear the page's presses through `Keys`, until interrupted: the page's one key listener. */
  readonly listen: Effect.Effect<never, never, Keys>;
}

/**
 * `title` naming the first key bound to `id` now, as the viewer's keyboard
 * writes it (`Next frame (→)`), or `title` alone when none is: a control
 * outside Solid reads it again on every change of keys (`Hub.subscribe`), so
 * a rebound key reads as rebound. Solid's controls read `hubKeys`.
 */
export const titledNow = (hub: Hub, title: string, id: CommandId): string =>
  titleWith(
    title,
    hub
      .keysOf(id)
      .slice(0, 1)
      .map((k) => chordLabel(k, hub.mac))
      .join(''),
  );

/** The key the viewer's overrides are kept under. */
const KEPT_AS = 'film-keymap';

/**
 * The hub of `page`, whose URL `href` reads, keeping the viewer's overrides
 * in `store`: built with the page's `Keys` (whose keyboard says how chords
 * read) and its `Clipboard` (where Copy link, every page's command, writes).
 */
export const makeHub = (
  page: PageName,
  href: () => string,
  store: StoreRuntime,
): Effect.Effect<Hub, never, Keys | Clipboard> =>
  Effect.gen(function* () {
    const keys = yield* Keys;
    const clipboard = yield* Effect.context<Clipboard>();
    const hub = hubOf(page, href, store, keys.mac);
    // Copy link is every page's, for as long as the page lives.
    hub.commands.register(...linkCommands(clipboard));
    return hub;
  });

/** The hub of `page`, chords read as a Mac's when `mac`. */
const hubOf = (page: PageName, href: () => string, store: StoreRuntime, mac: boolean): Hub => {
  const commands = makeCommands();
  const kept = keptJson(store, KEPT_AS, KeymapOverrides, (): KeymapOverrides => []);

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  commands.subscribe(changed);

  let parts: ReadonlyArray<{ readonly part: (ctx: Context) => Context }> = [];
  const context = (focus: Focus = 'page'): Context =>
    parts.reduce<Context>((ctx, p) => p.part(ctx), {
      ...contextAt(page, href()),
      selection: Option.toArray(selectionOf(href())),
      focus,
    });

  const sinks = new Set<(receipt: Receipt, slot: string) => void>();
  const announce = (receipt: Receipt, slot: string) => {
    for (const sink of sinks) sink(receipt, slot);
  };
  const invoke = (command: Command, how: Invocation, ctx: Context = context()) => {
    if (!command.when(ctx)) return;
    Effect.runFork(
      Effect.tap(command.run(ctx, how), (receipt) =>
        Effect.sync(() => announce(receipt, command.id)),
      ),
    );
  };
  const bindings = () => bindingsOf(commands.all(), kept.get());

  const pressHeard = new Set<() => void>();
  /** One press, heard, then bound and run: whether the keymap took it (its default is then prevented). */
  const press = (pressed: KeyPress): boolean => {
    for (const heard of pressHeard) heard();
    // A press inside a marked thing (a version's card, a variant's row) is about it too.
    const ctx = withFocused(context(focusOf(pressed.target)), targetAt(pressed.target));
    return Resolved.$match(resolve(pressed, ctx, commands.all(), bindings()), {
      Run: ({ command, how }) => {
        invoke(command, how, ctx);
        return true;
      },
      Owned: () => true,
      Pass: () => false,
    });
  };

  const hub: Hub = {
    commands,
    mac,
    context,
    refine: (part) => {
      const entry = { part };
      parts = [...parts, entry];
      return () => {
        parts = parts.filter((p) => p !== entry);
      };
    },
    invoke,
    invokeId: (id, how) => {
      Option.map(commands.byId(id), (command) => invoke(command, how));
    },
    receipts: (sink) => {
      sinks.add(sink);
      return () => sinks.delete(sink);
    },
    presses: (listener) => {
      pressHeard.add(listener);
      return () => pressHeard.delete(listener);
    },
    announce,
    overrides: kept.get,
    setOverrides: (next) => {
      kept.set(next);
      changed();
    },
    keysOf: (id) => keysOf(bindings(), id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listen: Keys.use((k) => k.listen(press)),
  };
  return hub;
};
