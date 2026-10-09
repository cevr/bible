// The studio's one sheet (design language §7) and the one rule a sheet a URL
// keeps open is dismissed by. Every sheet stands in `Sheet`: an inspector, the
// Scenes' scene sheet, the Lab's selection sheet and Findings.

import { useAtomValue } from '@bible/atom-solid';
import { Drawer } from '@bible/ui/drawer';
import { Location } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, Show } from '@solidjs/web';
import { Boolean as Bool, type Context, Effect, Match, Option } from 'effect';
import { createEffect, createSignal, untrack } from 'solid-js';
import { type Host, addressOn } from '../browser/host.ts';
import type { Viewport } from '../browser/viewport.ts';
import type { Hub } from '../command/hub.ts';
import type { Selection } from '../command/selection.ts';
import { targetAttr } from '../command/target.ts';
import { Hint } from './command/inspector.tsx';
import { pressed } from './pressed.ts';
import { PHONE, useMatches } from './viewport.ts';

/** A sheet's dismissal (`useSheetDismissal`): told of each opening, it closes the sheet by one rule. */
interface SheetDismissal {
  /** A tap is about to name `thing` while the sheet is shut: its step is the opening's. */
  readonly opening: (thing: string) => void;
  /**
   * Close the sheet: Back over the entry the opening's tap pushed when that
   * entry is on screen and the entry before it is exactly where the Close
   * would write (`cleared()`: the same path, query and hash); else the URL
   * follows to `cleared()`, when it names one (none: the URL names no sheet,
   * and nothing is written).
   */
  readonly dismiss: (cleared: () => Option.Option<string>) => void;
}

/**
 * The one rule a sheet a URL keeps open is dismissed by (Close, Escape, a
 * swipe), for every inspector (`useInspectorPlace`), Scenes' scene sheet and
 * the Lab's selection sheet: a tap that opens it on a shut sheet is a step of
 * its own, and dismissing it adds none. The entry that tap pushed is gone Back
 * over, so a Back after the Close leaves the entry before it, not the sheet
 * again, when that entry is where the Close would write: time moved while the
 * sheet was open lives in the entry it is on, and Back would rewind it. Any
 * other entry (a link's, a reload's, a tap's on a sheet already open, one a
 * Forward landed on after a Close, one whose time moved) is rewritten to name
 * none (`addressOn(host).follow`). `names` says whether an href names
 * `thing`'s sheet open.
 */
export const useSheetDismissal = (
  host: Host,
  names: (href: string, thing: string) => boolean,
): SheetDismissal => {
  const entry = useAtomValue(() => UrlAtom.entry);
  // The thing a tap named on a shut sheet and the entry it was named on, until the next
  // entry lands; then, when that entry is a new one naming it, the entry's key. A new entry is
  // known by its key, not by how the entry on screen last arrived: the push may be replaced
  // in the same tick (the player keeping its time), and a replace keeps the key.
  let opening = Option.none<{
    readonly thing: string;
    readonly from: string;
    readonly before: string;
  }>();
  // The pushed entry's key, and the href of the entry the tap left, which Back would land on.
  let openedBy = Option.none<{ readonly key: string; readonly before: string }>();
  createEffect(entry, (e) => {
    const pushed =
      e.navigation !== 'traverse' &&
      Option.exists(opening, (o) => o.from !== e.key && untrack(() => names(e.href, o.thing)));
    if (pushed) openedBy = Option.map(opening, (o) => ({ key: e.key, before: o.before }));
    opening = Option.none();
  });
  const here = () => Effect.runSyncWith(host)(Location.use((bar) => bar.current));
  return {
    opening: (thing) => {
      const at = here();
      opening = Option.some({ thing, from: at.key, before: at.href });
    },
    dismiss: (cleared) => {
      const target = cleared();
      // Back lands on the entry before the tap, so it is the right move only when that
      // entry is exactly where the Close would write: a time moved since the tap is kept.
      const ours = Option.exists(
        openedBy,
        (o) =>
          o.key === here().key &&
          Option.match(target, { onNone: () => true, onSome: (to) => samePlace(o.before, to) }),
      );
      openedBy = Option.none();
      if (ours) return Effect.runSyncWith(host)(Location.use((bar) => bar.back));
      Option.map(target, addressOn(host).follow);
    },
  };
};

/** Whether two hrefs are one place: the same path, query (in any order) and hash. */
const samePlace = (a: string, b: string): boolean => {
  const [x, y] = [new URL(a, 'http://place'), new URL(b, 'http://place')];
  x.searchParams.sort();
  y.searchParams.sort();
  return x.pathname === y.pathname && x.search === y.search && x.hash === y.hash;
};

/**
 * The sheet of the selected thing (design language §7), the one frame an
 * inspector, Scenes' scene sheet, the Lab's selection sheet and Findings
 * stand in: hosted in @bible/ui's Drawer,
 * not over the page (it stays live, a tap outside keeps it open); beside the
 * page on a laptop, swiped away to the right; on a phone a bottom sheet
 * standing on the tab bar (and the dock), swiped down, whose grip lowers it
 * to a peek and raises it again. Its head holds its title and Close. Close,
 * Escape and a swipe each call `onClose`, and its page says what that is (a
 * URL's step). Its footer prints the keys of the commands about `of` while
 * the pointer or the focus is in it (`Hint`); a sheet about no one thing
 * (the page's Findings) has none. It opens whole, or lowered on a phone
 * when `peeked`; what a lowered sheet still shows is its page's styles' to
 * say (its head alone, or Scenes' card in brief).
 */
export const Sheet = (props: {
  readonly host: Context.Context<Viewport>;
  readonly hub: Hub;
  /** The thing it is about, when it is about one. */
  readonly of?: Selection;
  /** Its `data-role`: `inspector`, `scene`, `findings`. */
  readonly role: string;
  /** What the sheet is about: its name and values, in their own case when `kind` heads them. */
  readonly title: JSX.Element;
  /** The kind of thing it is about (`cue`, `note`), the head's title in the panel title's caps. */
  readonly kind?: string;
  /** Its page's class for it, beside the sheet's own. */
  readonly class?: string;
  readonly peeked?: boolean;
  readonly initialFocus: () => HTMLElement | boolean;
  readonly onClose: () => void;
  readonly children: JSX.Element;
}) => {
  // Whether the page is a phone's width now, followed as the window changes.
  const phone = useMatches(props.host, PHONE);
  let popup = Option.none<HTMLElement>();
  const [peek, setPeek] = createSignal(
    untrack(() => props.peeked === true && phone()),
    { ownedWrite: true },
  );
  return (
    <Drawer.Root
      open
      modal={false}
      disablePointerDismissal
      swipeDirection={Bool.match(phone(), {
        onTrue: () => 'down' as const,
        onFalse: () => 'right' as const,
      })}
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      {/* In place, not moved to the body: a link's sheet is in the server's
          markup and hydrates there; it stands against the window (fixed). */}
      <Drawer.Portal inline>
        <Drawer.Viewport class="lab-inspector-viewport">
          <Drawer.Popup
            class={[
              'lab-inspector-sheet lab-inspector',
              ...Option.toArray(Option.fromUndefinedOr(props.class)),
            ].join(' ')}
            data-role={props.role}
            data-target={Option.getOrUndefined(
              Option.map(Option.fromUndefinedOr(props.of), targetAttr),
            )}
            data-peek={pressed(peek())}
            tabindex="-1"
            ref={(el: HTMLElement) => {
              popup = Option.some(el);
            }}
            initialFocus={() =>
              Match.value(props.initialFocus()).pipe(
                // The sheet itself, not its first control: that is Close, which Space would press.
                Match.when(true, () => Option.getOrElse(popup, () => true)),
                Match.orElse((asked) => asked),
              )
            }
          >
            <header class="lab-inspector-head">
              <SheetGrip peek={peek()} toggle={() => setPeek(!peek())} />
              <Drawer.Title class="lab-sheet-title">
                <Show when={props.kind} fallback={props.title}>
                  {(kind) => (
                    <>
                      <span class="lab-sheet-kind">{kind()}</span>{' '}
                      <span class="lab-sheet-subject">{props.title}</span>
                    </>
                  )}
                </Show>
              </Drawer.Title>
              <Drawer.Close class="lab-inspector-close" data-act="close-inspector">
                Close
              </Drawer.Close>
            </header>
            <Drawer.Content class="lab-inspector-body">{props.children}</Drawer.Content>
            <Show when={props.of}>
              {(of) => <Hint hub={props.hub} selection={of()} gestures={[]} />}
            </Show>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

/**
 * A phone's sheet's grip (design language §7): the sheet's whole head, a bar
 * drawn at its top; a tap lowers the sheet to a peek (its head over the dock)
 * and raises it again. The head's Close stays above it. None on a laptop,
 * where the sheet stands beside the page.
 */
const SheetGrip = (props: { readonly peek: boolean; readonly toggle: () => void }) => (
  <button
    type="button"
    class="lab-inspector-grip"
    data-act="sheet"
    aria-label={Bool.match(props.peek, { onTrue: () => 'Show more', onFalse: () => 'Show less' })}
    aria-expanded={pressed(!props.peek)}
    onClick={() => props.toggle()}
  />
);
