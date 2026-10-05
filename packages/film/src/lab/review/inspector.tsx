// The review's inspector: one sheet for the selected thing (a variant, a
// set's version, an act, the film) holding what is rare on its row: its
// Info (every line of what it is), its approval and its unapproval, what was
// said of it, and the one comment box. Each thing's row registers it
// (`useThing`, `things.ts`) and renders its inspector in place
// (`<Inspector>`), so the sheet reads the row's own providers; one thing's
// inspector is open at a time, opened by tapping the thing's name
// (`<InspectName>`), its comment count beside it, Inspect (`i`) or
// Comment on (`m`), from its context menu or ⌘K; a Project scene's row opens
// it on a tap anywhere off its controls (`useInspect`). Hosted in @bible/ui's
// Drawer, not over the page (it stays live, a tap outside keeps it open):
// beside it on a laptop, swiped away to the right; on a phone a bottom sheet
// standing on the tab bar and the dock (design language §7), swiped down,
// whose grip lowers it to a peek and raises it again. Escape closes it; its
// footer prints the keys of the commands about the thing while the pointer or
// the focus is in it (`Hint`). A page may keep which one is open in its URL
// (`useInspectorPlace`, the Project's `?point=`): the URL then owns it, so a
// link, Back and Forward open and close it.

import { Drawer } from '@bible/ui/drawer';
import { type JSX, Show } from '@solidjs/web';
import { Boolean as Bool, Option } from 'effect';
import {
  type Accessor,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import type { Hub } from '../../command/hub.ts';
import type { Selection } from '../../command/selection.ts';
import { targetAttr } from '../../command/target.ts';
import { Hint } from '../command/inspector.tsx';
import { pressed } from './format.ts';
import { type OpenAt, type Thing, type Things, thingCommands } from './things.ts';

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
  // The page's URL, while a page keeps the open inspector there; else the inspector's own.
  const [place, setPlace] = createSignal(Option.none<InspectorPlace>(), { ownedWrite: true });
  const [own, setOwn] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  // Where the last opening opened (its info, or its comment box): no part of a URL.
  const [how, setHow] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  const opened = createMemo(() =>
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
    }),
  );
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
  const value: InspectingValue = {
    hub: props.hub,
    opened,
    open,
    close,
    bind: (p) => {
      setOwn(Option.none());
      setPlace(Option.some(p));
      return () => setPlace((now) => Option.filter(now, (q) => q !== p));
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

/** Keep the open inspector in the calling page's URL (`InspectorPlace`) for as long as the page lives. */
export const useInspectorPlace = (place: InspectorPlace): void => {
  const inspecting = useInspecting();
  onCleanup(inspecting.bind(place));
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
 * A thing's inspector, rendered in its row so it reads the row's providers;
 * shown while it is the one open. `children` gets its comment box's handle:
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
  const phone = usePhone();
  return (
    <Show when={Option.getOrUndefined(at())}>
      {(opened) => {
        // Each opening starts whole; on a phone its grip lowers it to a peek and raises it again.
        const [peek, setPeek] = createSignal(false, { ownedWrite: true });
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
              if (!next) inspecting.close(key());
            }}
          >
            <Drawer.Portal>
              <Drawer.Viewport class="lab-inspector-viewport">
                <Drawer.Popup
                  class="lab-inspector-sheet lab-inspector"
                  data-role="inspector"
                  data-target={key()}
                  data-peek={String(peek())}
                  initialFocus={() =>
                    Option.getOrElse(
                      Option.filter(comment, () => opened() === 'comment'),
                      () => true,
                    )
                  }
                >
                  <header class="lab-inspector-head">
                    <SheetGrip peek={peek()} toggle={() => setPeek(!peek())} />
                    <Drawer.Title class="lab-sheet-title">{props.title}</Drawer.Title>
                    <Drawer.Close class="lab-inspector-close" data-act="close-inspector">
                      Close
                    </Drawer.Close>
                  </header>
                  <Drawer.Content class="lab-inspector-body">{props.children(box)}</Drawer.Content>
                  <Hint hub={inspecting.hub} selection={props.of} gestures={[]} />
                </Drawer.Popup>
              </Drawer.Viewport>
            </Drawer.Portal>
          </Drawer.Root>
        );
      }}
    </Show>
  );
};

/** The phone's width, as the shell's (`page-shell-style.ts`): the inspector is a bottom sheet under it. */
const PHONE = '(max-width: 899px)';

/** Whether the page is a phone's width now, followed as the window changes. */
const usePhone = (): Accessor<boolean> => {
  const query = matchMedia(PHONE);
  const [phone, setPhone] = createSignal(query.matches, { ownedWrite: true });
  const changed = () => setPhone(query.matches);
  query.addEventListener('change', changed);
  onCleanup(() => query.removeEventListener('change', changed));
  return phone;
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
