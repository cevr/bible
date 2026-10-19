// The page's hub as Solid reads and writes it: a count that moves each time
// a command comes or goes, so a list of commands or keys reads it and
// follows; the keys a command is bound to, as the viewer's
// keyboard writes them; commands that follow a value (a page's Go to
// entries over what it shows), registered again as it changes; and a menu's
// run, deferred until it has closed (`deferredRun`). Each ends with the
// owner.

import { isServer } from '@solidjs/web';
import { Context as Services, Effect, Option, Scheduler } from 'effect';
import type { Accessor } from 'solid-js';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import type { Input } from '../../browser/keys.ts';
import type { Command, CommandId, Invocation } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel, titleWith } from '../../command/keymap.ts';
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
  /** Every chord bound to `id` now, as the viewer's keyboard writes them, a space between. */
  readonly text: (id: CommandId) => string;
  /** The first chord bound to `id` now, as the viewer's keyboard writes it ('' when none is). */
  readonly first: (id: CommandId) => string;
  /** `title` with `id`'s first chord after it in brackets, or alone when no key is bound. */
  readonly titled: (title: string, id: CommandId) => string;
}

/** `hub`'s keys as the viewer's keyboard writes them, each read through `follow` (what a reader tracks). */
export const keysAs = (hub: Hub, follow: () => void = () => {}): HubKeys => {
  const bound = (id: CommandId) => {
    follow();
    return hub.keysOf(id);
  };
  const label = (chord: string) => chordLabel(chord, hub.mac);
  const first = (id: CommandId) => bound(id).slice(0, 1).map(label).join('');
  return {
    bound,
    label,
    text: (id) => bound(id).map(label).join(' '),
    first,
    titled: (title, id) => titleWith(title, first(id)),
  };
};

/**
 * `hub`'s keys as the page shows them, followed as commands come and go.
 * Every viewer has the same keys, so a server render shows the keys the
 * client's hydration shows. The viewer's keyboard a server render knows from
 * the request (`PageAsked.mac`), so every label reads as that keyboard writes
 * it from the first paint (`⌘K` on a Mac), and no control changes its width
 * once the page is hydrated.
 */
export const hubKeys = (hub: Hub): HubKeys => {
  const changes = hubChanges(hub);
  return keysAs(hub, changes);
};

/**
 * A menu's run of the row chosen in it: the menu opens on a context (what
 * its rows are listed in), a row is chosen, and the row's command runs in
 * that context once the menu has closed and focus is back on the page, so
 * what the command focuses (a note's composer, a sheet) keeps focus. It runs
 * asked by the input that chose the row (Enter, or a click or a tap), read
 * as it was chosen: by the time the menu has closed, nothing on the page
 * still says how.
 */
interface DeferredRun {
  /** The context the menu opened on. */
  readonly opened: Accessor<Context>;
  /** The menu opens on `ctx`: nothing is chosen yet. */
  readonly open: (ctx: Context) => void;
  /** `row` is chosen, by the input the viewer used last (`Hub.input`): it runs once the menu has closed. */
  readonly choose: (row: MenuRow) => void;
  /** The menu has closed: the row chosen runs, once. */
  readonly closed: () => void;
}

/** Where a fiber's yield resumes in the next microtask: on no timer, so no clock holds it. */
const NEXT_MICROTASK = Services.make(Scheduler.Scheduler, new Scheduler.MixedScheduler('sync'));

/** A menu's deferred run on `hub`, asked for `via` the menu it is (`menu`, ⌘K's `palette`). */
export const deferredRun = (hub: Hub, via: Invocation['via']): DeferredRun => {
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<{ readonly row: MenuRow; readonly input: Input }>();
  return {
    opened,
    open: (ctx) => {
      chosen = Option.none();
      setOpened(ctx);
    },
    choose: (row) => {
      chosen = Option.some({ row, input: hub.input() });
    },
    closed: () => {
      const picked = chosen;
      const ctx = opened();
      chosen = Option.none();
      // The popup gives the focus back in a microtask it queues as it unmounts, before it says it
      // has closed: the row runs in the next one, so what it focuses is kept.
      Option.map(picked, ({ row, input }) =>
        Effect.runForkWith(NEXT_MICROTASK)(
          Effect.andThen(
            Effect.yieldNow,
            Effect.sync(() => hub.invoke(row.command, { step: row.step, via, input }, ctx)),
          ),
        ),
      );
    },
  };
};

/** Register `commands` as they stand, again each time they change, for as long as the owner lives. */
export const registerWhile = (hub: Hub, commands: Accessor<ReadonlyArray<Command>>): void => {
  createEffect(commands, (now) => hub.commands.register(...now));
};
