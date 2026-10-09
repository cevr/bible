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
// one sheet (`Sheet`, `lab/sheet.tsx`, Scenes' scene sheet's too), not over the page (it
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
import { Place, UrlState } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { type JSX, Show, isServer } from '@solidjs/web';
import { Effect, Option } from 'effect';
import {
  type Accessor,
  createContext,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import type { Hub } from '../../command/hub.ts';
import type { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { counted } from '../../core/words.ts';
import { Sheet, useSheetDismissal } from '../sheet.tsx';
import { useReview } from './context.tsx';
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
 * Every page with things binds one (Choices, a Set, the Project); on a page
 * that binds none (Films, a Folder: no things) no inspector opens.
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
  // binding, last); else none is open. A page binds its place as it renders, before
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
  // Where the last opening opened (its info, or its comment box): no part of a URL.
  const [how, setHow] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  // Read as it is asked, not kept: the server's render, whose computations never run
  // again, reads the place its page bound after this was made.
  const opened = (): Option.Option<Opened> =>
    Option.flatMap(place(), (p) =>
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
    );
  const open = (selection: Selection, at: OpenAt) => {
    setHow(Option.some({ key: targetAttr(selection), at }));
    Option.map(untrack(place), (p) => p.name(Option.some(selection)));
  };
  const close = (key: string) => {
    if (!Option.exists(untrack(opened), (o) => o.key === key)) return;
    setHow(Option.none());
    Option.map(untrack(place), (p) => p.name(Option.none()));
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
 * (Close, Escape, a swipe) adds no entry (`useSheetDismissal`).
 */
export const useInspectorPlace = <A,>(query: InspectorQuery<A>): void => {
  const inspecting = useInspecting();
  const { meta } = useReview();
  const at = useAtomValue(() => UrlAtom.place(query.place));
  // Read as the entry lands: what the page holds then (its choices, its variant) names it.
  const dismissal = useSheetDismissal(meta.host, (href, thing) =>
    Option.exists(Place.decode(query.place, href), (v) =>
      Option.exists(query.named(v), (s) => targetAttr(s) === thing),
    ),
  );
  const now = () => Effect.runSyncWith(meta.host)(UrlState.get(query.place));
  const name = (selection: Selection) => {
    for (const value of Option.toArray(now())) {
      for (const next of Option.toArray(query.naming(value, selection))) {
        if (Option.isNone(query.named(value))) dismissal.opening(targetAttr(selection));
        Effect.runSyncWith(meta.host)(UrlState.set(query.place, next));
      }
    }
  };
  const dismiss = () =>
    dismissal.dismiss(() =>
      Option.map(
        Option.filter(now(), (v) => Option.isSome(query.named(v))),
        (v) => Place.href(query.place, query.cleared(v)),
      ),
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
        title={counted(props.count, 'comment')}
        aria-label={counted(props.count, 'comment')}
        onClick={() => inspecting.open(props.of, 'info')}
      >
        <span class="lab-count">{props.count}</span>
      </button>
    </Show>
  );
};
