// The page's hub as Solid reads and writes it: a count that moves each time
// a command comes or goes or a key is rebound, so a list of commands or keys
// reads it and follows; the keys a command is bound to, as the viewer's
// keyboard writes them; commands that follow a value (a page's Go to
// entries over what it shows), registered again as it changes; and a menu's
// run, deferred until it has closed (`deferredRun`). Each ends with the
// owner.

import { isServer } from '@solidjs/web';
import { Boolean as Bool, Option } from 'effect';
import type { Accessor } from 'solid-js';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { Command, CommandId, Invocation } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { bindingsOf, chordLabel, keysOf } from '../../command/keymap.ts';
import type { MenuRow } from '../../command/menu.ts';

/**
 * A count of `hub`'s changes, for as long as the calling owner lives. A
 * server render is one pass that re-renders nothing, so there it counts
 * nothing: what it reads of the hub is what is registered as it reads.
 */
export const hubChanges = (hub: Hub): Accessor<number> => {
  const [changes, setChanges] = createSignal(0, { ownedWrite: true });
  if (!isServer) onCleanup(hub.subscribe(() => setChanges((n) => n + 1)));
  return changes;
};

/** The keys of `hub`'s commands as the page shows them, followed as they change. */
interface HubKeys {
  /** The chords bound to `id` now. */
  readonly bound: (id: CommandId) => ReadonlyArray<string>;
  /** `chord` as the viewer's keyboard writes it (`⌘K` on a Mac, `Ctrl+K` elsewhere). */
  readonly label: (chord: string) => string;
}

/**
 * `hub`'s keys as the page shows them. The viewer's keyboard and their
 * rebound keys are the browser's: a server render knows neither, so it shows
 * the default keys as a PC writes them, the client's hydration shows the
 * same, and the viewer's own follow once the page is hydrated.
 */
export const hubKeys = (hub: Hub): HubKeys => {
  const changes = hubChanges(hub);
  const viewers = createMemo(() => true, { ssrSource: 'client', loadingValue: false });
  return {
    bound: (id) => {
      changes();
      return Bool.match(viewers(), {
        onTrue: () => hub.keysOf(id),
        onFalse: () => keysOf(bindingsOf(hub.commands.all(), []), id),
      });
    },
    label: (chord) => chordLabel(chord, viewers() && hub.mac),
  };
};

/**
 * A menu's run of the row chosen in it: the menu opens on a context (what
 * its rows are listed in), a row is chosen, and the row's command runs in
 * that context once the menu has closed and focus is back on the page, so
 * what the command focuses (a note's composer, a sheet) keeps focus.
 */
interface DeferredRun {
  /** The context the menu opened on. */
  readonly opened: Accessor<Context>;
  /** The menu opens on `ctx`: nothing is chosen yet. */
  readonly open: (ctx: Context) => void;
  /** `row` is chosen: it runs once the menu has closed. */
  readonly choose: (row: MenuRow) => void;
  /** The menu has closed: the row chosen runs, once. */
  readonly closed: () => void;
}

/** A menu's deferred run on `hub`, asked for `via` the menu it is (`menu`, ⌘K's `palette`). */
export const deferredRun = (hub: Hub, via: Invocation['via']): DeferredRun => {
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<MenuRow>();
  return {
    opened,
    open: (ctx) => {
      chosen = Option.none();
      setOpened(ctx);
    },
    choose: (row) => {
      chosen = Option.some(row);
    },
    closed: () => {
      const row = chosen;
      chosen = Option.none();
      Option.map(row, (r) => hub.invoke(r.command, { step: r.step, via }, opened()));
    },
  };
};

/** Register `commands` as they stand, again each time they change, for as long as the owner lives. */
export const registerWhile = (hub: Hub, commands: Accessor<ReadonlyArray<Command>>): void => {
  createEffect(commands, (now) => hub.commands.register(...now));
};
