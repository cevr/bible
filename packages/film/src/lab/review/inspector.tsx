// The review's inspector: one sheet for the selected thing (a variant, a
// set's version, an act, the film) holding what is rare on its row: its
// Info (every line of what it is), its approval and its unapproval, what was
// said of it, and the one comment box. Each thing's row registers it
// (`useThing`, `things.ts`) and renders its inspector in place
// (`<Inspector>`), so the sheet reads the row's own providers; one thing's
// inspector is open at a time, opened by tapping the thing's name
// (`<InspectName>`), its comment count beside it, Inspect (`i`) or
// Comment on (`m`), from its context menu or ⌘K; a Project scene's row opens
// it on a tap anywhere off its controls (`useInspect`). It stands in the
// one sheet (`Sheet`, Scenes' scene sheet's too), not over the page (it
// stays live, a tap outside keeps it open): beside it on a laptop, swiped
// away to the right; on a phone a bottom sheet standing on the tab bar and
// the dock (design language §7), swiped down, whose grip lowers it to a peek
// and raises it again. Escape closes it; its footer prints the keys of the
// commands about the thing while the pointer or the focus is in it (`Hint`).
// A page keeps which one is open in its URL
// (`useInspectorPlace`: the Project's `?point=`, Choices' and a Set's
// `?inspect=`): the URL then owns it, so a link, Back and Forward open and
// close it, and its dismissal adds no entry to history.

import { useAtomValue } from '@bible/atom-solid';
import { Drawer } from '@bible/ui/drawer';
import { Location, Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, Show, isServer } from '@solidjs/web';
import { Boolean as Bool, type Context, Effect, Option } from 'effect';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import type { Viewport } from '../../browser/viewport.ts';
import type { Hub } from '../../command/hub.ts';
import type { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { Hint } from '../command/inspector.tsx';
import { useMatches } from '../viewport.ts';
import { useReview } from './context.tsx';
import { pressed } from './format.ts';
import { type OpenAt, type Thing, type Things, thingCommands, withRegistered } from './things.ts';

/** A comment box's unsent text, kept per thing while the page lives (read reactively): a box that closes keeps it. */
interface Draft {
  readonly get: () => string;
  readonly set: (text: string) => void;
}

/** What an inspector hands its comment box: the ref its field takes to be focused, and its draft. */
export interface InspectorBox {
  readonly input: (el: HTMLElement) => void;
  readonly draft: Draft;
}

/** The open inspector: the thing's key (`targetAttr`) and where it opened. */
interface Opened {
  readonly key: string;
  readonly at: OpenAt;
}

/**
 * A page whose URL keeps its open inspector (the Project's `?point=`): the
 * thing its URL names now, and how to name one, or none. While a page binds
 * one (`useInspectorPlace`), its URL is the open inspector's one owner: a tap
 * names the thing (a step of its own, so Back closes it), Close, a swipe and
 * Escape name none, and a pasted link, Back and Forward open what they name.
 * A page that binds none keeps it in the inspector, for the page's life.
 */
interface InspectorPlace {
  readonly named: Accessor<Option.Option<Selection>>;
  /** Name `selection` in the URL, or none (a thing the URL has no name for stays shut). */
  readonly name: (selection: Option.Option<Selection>) => void;
}

interface InspectingValue {
  readonly hub: Hub;
  readonly opened: Accessor<Option.Option<Opened>>;
  readonly open: (selection: Selection, at: OpenAt) => void;
  /** Close the inspector of `key`, if it is the one open. */
  readonly close: (key: string) => void;
  /** Register `thing` while it is shown: until the returned stop. */
  readonly put: (thing: Thing) => () => void;
  /** The unsent comment on the thing of `key`. */
  readonly draft: (key: string) => Draft;
  /** Keep the open inspector in the page's URL (`InspectorPlace`) until the returned stop. */
  readonly bind: (place: InspectorPlace) => () => void;
}

const InspectingContext = createContext<InspectingValue>();

const useInspecting = (): InspectingValue => useContext(InspectingContext);

/** The page's things and its one inspector, around `children`, with their commands on `hub`. */
export const Inspecting = (props: { readonly hub: Hub; readonly children: JSX.Element }) => {
  const shown = new Map<string, Thing>();
  const drafts = new Map<string, string>();
  // One count for every draft: a box reads its draft through it, so a say that lands
  // after its box closed empties the box opened since.
  const [drafted, setDrafted] = createSignal(0, { ownedWrite: true });
  // The page's URL, while a page keeps the open inspector there (the newest page's
  // binding, last); else the inspector's own. A page binds its place as it renders, before
  // its sheets: held here as it is bound, so what renders after reads it at once, on the
  // server and as the page hydrates (a signal's write would land only after the render,
  // and the server's render writes none). `rebound` follows a binding made or let go
  // once the page runs.
  const places: Array<InspectorPlace> = [];
  const [rebound, setRebound] = createSignal(0, { ownedWrite: true });
  const place = (): Option.Option<InspectorPlace> => {
    rebound();
    return Option.fromUndefinedOr(places.at(-1));
  };
  const [own, setOwn] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  // Where the last opening opened (its info, or its comment box): no part of a URL.
  const [how, setHow] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  // Read as it is asked, not kept: the server's render, whose computations never run
  // again, reads the place its page bound after this was made.
  const opened = (): Option.Option<Opened> =>
    Option.match(place(), {
      onNone: () => own(),
      onSome: (p) =>
        Option.map(p.named(), (selection): Opened => {
          const key = targetAttr(selection);
          return {
            key,
            at: Option.getOrElse(
              Option.map(
                Option.filter(how(), (h) => h.key === key),
                (h) => h.at,
              ),
              (): OpenAt => 'info',
            ),
          };
        }),
    });
  const open = (selection: Selection, at: OpenAt) => {
    const now = { key: targetAttr(selection), at };
    setHow(Option.some(now));
    Option.match(untrack(place), {
      onNone: () => setOwn(Option.some(now)),
      onSome: (p) => p.name(Option.some(selection)),
    });
  };
  const close = (key: string) => {
    if (!Option.exists(untrack(opened), (o) => o.key === key)) return;
    setHow(Option.none());
    Option.match(untrack(place), {
      onNone: () => setOwn(Option.none()),
      onSome: (p) => p.name(Option.none()),
    });
  };
  const things: Things = {
    at: (selection) => Option.fromUndefinedOr(shown.get(targetAttr(selection))),
    open,
  };
  onCleanup(props.hub.commands.register(...thingCommands(things)));
  // A thing the URL names that the page has none of (an old link's) is no selection:
  // the focused card's keys act on it.
  onCleanup(props.hub.refine((ctx) => withRegistered(things, ctx)));
  const value: InspectingValue = {
    hub: props.hub,
    opened,
    open,
    close,
    bind: (p) => {
      places.push(p);
      const unbind = () => {
        places.splice(places.indexOf(p), 1);
      };
      // The server's render writes no signal, binding or letting go as it ends: what it
      // renders read the place as it was bound, and nothing runs again.
      if (isServer) return unbind;
      setRebound((n) => n + 1);
      return () => {
        unbind();
        // What the page opened of its own before a place was bound is gone with its sheets.
        setOwn(Option.none());
        setRebound((n) => n + 1);
      };
    },
    draft: (key) => ({
      get: () => {
        drafted();
        return Option.getOrElse(Option.fromUndefinedOr(drafts.get(key)), () => '');
      },
      set: (text) => {
        drafts.set(key, text);
        setDrafted((n) => n + 1);
      },
    }),
    put: (thing) => {
      const key = targetAttr(thing.selection);
      shown.set(key, thing);
      return () => {
        // A later row of the same thing may hold the key now.
        if (shown.get(key) === thing) shown.delete(key);
      };
    },
  };
  return <InspectingContext value={value}>{props.children}</InspectingContext>;
};

/**
 * Where a page's URL names its open inspector: the page's place, the thing a
 * value of it names open, that value naming `selection` open (none: the URL
 * has no name for the thing, and its inspector stays shut), and that value
 * naming none open. The key it is kept in is the page's own, `cited` (a
 * change of it is a step in history).
 */
interface InspectorQuery<A> {
  readonly place: Place.Place<A>;
  readonly named: (value: A) => Option.Option<Selection>;
  readonly naming: (value: A, selection: Selection) => Option.Option<A>;
  readonly cleared: (value: A) => A;
}

/**
 * Keep the open inspector in the calling page's URL (`InspectorQuery`) for as
 * long as the page lives: a tap names the thing, a step of its own, so Back
 * closes it; a link, Back and Forward open what they name. Dismissing it
 * (Close, Escape, a swipe) adds no entry: the entry a tap here pushed to open
 * it is gone Back over, so a Back after the Close leaves the page's entry
 * before it, not the sheet again; any other (a link's, a reload's, one a
 * Forward landed on after a Close) is replaced by one naming none.
 */
export const useInspectorPlace = <A,>(query: InspectorQuery<A>): void => {
  const inspecting = useInspecting();
  const { meta } = useReview();
  const at = useAtomValue(() => UrlAtom.place(query.place));
  const entry = useAtomValue(() => UrlAtom.entry);
  // Read once, as the entry lands: what the page holds then (its choices, its variant) names it.
  const namesOpen = (value: A, key: string) =>
    untrack(() => Option.exists(query.named(value), (s) => targetAttr(s) === key));
  // The thing a tap named on a closed sheet and the entry it was named on, until the next
  // entry lands; then, when that entry is a new one naming it, the entry's key. A new entry is
  // known by its key, not by how the entry on screen last arrived: the push may be replaced
  // in the same tick (the player keeping its time), and a replace keeps the key.
  let opening = Option.none<{ readonly thing: string; readonly from: string }>();
  let openedBy = Option.none<string>();
  createEffect(entry, (e) => {
    const pushed =
      e.navigation !== 'traverse' &&
      Option.exists(opening, (o) => o.from !== e.key) &&
      Option.exists(Place.decode(query.place, e.href), (v) =>
        Option.exists(opening, (o) => namesOpen(v, o.thing)),
      );
    if (pushed) openedBy = Option.some(e.key);
    opening = Option.none();
  });
  const name = (selection: Selection) =>
    Effect.runSyncWith(meta.host)(
      Effect.gen(function* () {
        const here = yield* (yield* Location).current;
        const now = yield* UrlState.get(query.place);
        for (const value of Option.toArray(now)) {
          for (const next of Option.toArray(query.naming(value, selection))) {
            if (Option.isNone(query.named(value)))
              opening = Option.some({ thing: targetAttr(selection), from: here.key });
            yield* UrlState.set(query.place, next);
          }
        }
      }),
    );
  const dismiss = () =>
    Effect.runSyncWith(meta.host)(
      Effect.gen(function* () {
        const location = yield* Location;
        const here = yield* location.current;
        const ours = Option.contains(openedBy, here.key);
        openedBy = Option.none();
        if (ours) return yield* location.back;
        const state = yield* UrlState.UrlState;
        const named = Option.filter(yield* UrlState.get(query.place), (v) =>
          Option.isSome(query.named(v)),
        );
        for (const value of Option.toArray(named))
          yield* state.navigate(Place.href(query.place, query.cleared(value)), {
            history: 'replace',
            throttle: Option.none(),
          });
      }),
    );
  onCleanup(
    inspecting.bind({
      named: () => Option.flatMap(at(), query.named),
      name: (selection) => Option.match(selection, { onNone: dismiss, onSome: name }),
    }),
  );
};

/** Register `thing` for as long as the calling row is shown. */
export const useThing = (thing: Thing): void => {
  const inspecting = useInspecting();
  onCleanup(inspecting.put(thing));
};

/** Whether `of`'s inspector is the one open: its card shows it selected. */
export const useInspected = (of: Selection): Accessor<boolean> => {
  const inspecting = useInspecting();
  const key = targetAttr(of);
  return () => Option.exists(inspecting.opened(), (o) => o.key === key);
};

/**
 * A thing's inspector, shown while it is the one open. A page renders it
 * where the providers it reads are, for every thing the page has, not in the
 * card that shows the thing: a filter or a view that leaves the card out
 * leaves the sheet a link names. `children` gets its comment box's handle:
 * the ref the box's field takes (focused when it opened at the box) and the
 * box's draft.
 */
export const Inspector = (props: {
  readonly of: Selection;
  readonly title: string;
  readonly children: (box: InspectorBox) => JSX.Element;
}) => {
  const inspecting = useInspecting();
  const key = () => targetAttr(props.of);
  const at = () =>
    Option.map(
      Option.filter(inspecting.opened(), (o) => o.key === key()),
      (o) => o.at,
    );
  let comment = Option.none<HTMLElement>();
  const box: InspectorBox = {
    input: (el) => {
      comment = Option.some(el);
    },
    draft: inspecting.draft(untrack(key)),
  };
  const { meta } = useReview();
  return (
    <Show when={Option.getOrUndefined(at())}>
      {(opened) => (
        <Sheet
          host={meta.host}
          hub={inspecting.hub}
          of={props.of}
          role="inspector"
          title={props.title}
          initialFocus={() =>
            Option.getOrElse(
              Option.filter(comment, () => opened() === 'comment'),
              () => true,
            )
          }
          onClose={() => inspecting.close(key())}
        >
          {props.children(box)}
        </Sheet>
      )}
    </Show>
  );
};

/**
 * The sheet of the selected thing (design language §7), the one frame an
 * inspector and Scenes' scene sheet stand in: hosted in @bible/ui's Drawer,
 * not over the page (it stays live, a tap outside keeps it open); beside the
 * page on a laptop, swiped away to the right; on a phone a bottom sheet
 * standing on the tab bar (and the dock), swiped down, whose grip lowers it
 * to a peek and raises it again. Its head holds its title and Close. Close,
 * Escape and a swipe each call `onClose`, and its page says what that is (a
 * URL's step). Its footer prints the keys of the commands about `of` while
 * the pointer or the focus is in it (`Hint`). It opens whole, or lowered on
 * a phone when `peeked`; what a lowered sheet still shows is its page's
 * styles' to say (its head alone, or Scenes' card in brief).
 */
export const Sheet = (props: {
  readonly host: Context.Context<Viewport>;
  readonly hub: Hub;
  readonly of: Selection;
  /** Its `data-role`: `inspector`, `scene`. */
  readonly role: string;
  readonly title: JSX.Element;
  /** Its page's class for it, beside the sheet's own. */
  readonly class?: string;
  readonly peeked?: boolean;
  readonly initialFocus: () => HTMLElement | boolean;
  readonly onClose: () => void;
  readonly children: JSX.Element;
}) => {
  // Whether the page is a phone's width now, followed as the window changes.
  const phone = useMatches(props.host, PHONE);
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
            data-target={targetAttr(props.of)}
            data-peek={pressed(peek())}
            initialFocus={props.initialFocus}
          >
            <header class="lab-inspector-head">
              <SheetGrip peek={peek()} toggle={() => setPeek(!peek())} />
              <Drawer.Title class="lab-sheet-title">{props.title}</Drawer.Title>
              <Drawer.Close class="lab-inspector-close" data-act="close-inspector">
                Close
              </Drawer.Close>
            </header>
            <Drawer.Content class="lab-inspector-body">{props.children}</Drawer.Content>
            <Hint hub={props.hub} selection={props.of} gestures={[]} />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

/** The phone's width, as the shell's (`page-shell-style.ts`): a sheet is a bottom sheet under it. */
const PHONE = '(max-width: 899px)';

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

/** Open `of`'s inspector, as a tap on its row does (the Project's scene rows). */
export const useInspect = (of: () => Selection): (() => void) => {
  const inspecting = useInspecting();
  return () => inspecting.open(of(), 'info');
};

/**
 * A thing's name that opens its inspector when tapped, its look the name's
 * own, and beside it the count of its `comments` (`<CommentCount>`): the two
 * held on one line, so the count never wraps under the name into its hit
 * area.
 */
export const InspectName = (props: {
  readonly of: Selection;
  readonly comments: number;
  readonly children: JSX.Element;
}) => {
  const inspecting = useInspecting();
  return (
    <span class="lab-named">
      <button
        type="button"
        class="lab-inspect"
        data-act="inspect"
        title="Inspect"
        onClick={() => inspecting.open(props.of, 'info')}
      >
        {props.children}
      </button>
      <CommentCount of={props.of} count={props.comments} />
    </span>
  );
};

/** `n` comments, said in full. */
const commentsText = (n: number) => `${n} ${['comments', 'comment'][Number(n === 1)]}`;

/**
 * How many comments a thing has, a dot that opens its inspector; nothing
 * when none. The dot sits in a box the pointer's target each way (`--hit`),
 * so it is reached beside its name without taking the name's.
 */
const CommentCount = (props: { readonly of: Selection; readonly count: number }) => {
  const inspecting = useInspecting();
  return (
    <Show when={props.count > 0}>
      <button
        type="button"
        class="lab-count-hit"
        data-comments={String(props.count)}
        title={commentsText(props.count)}
        aria-label={commentsText(props.count)}
        onClick={() => inspecting.open(props.of, 'info')}
      >
        <span class="lab-count">{props.count}</span>
      </button>
    </Show>
  );
};
