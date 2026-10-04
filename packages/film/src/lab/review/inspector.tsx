// The review's inspector: one sheet for the selected thing (a variant, a
// set's version, an act, the film) holding what is rare on its row: its
// Info (every line of what it is), its approval and its unapproval, what was
// said of it, and the one comment box. Each thing's row registers it
// (`useThing`, `things.ts`) and renders its inspector in place
// (`<Inspector>`), so the sheet reads the row's own providers; one thing's
// inspector is open at a time, opened by tapping the thing's name
// (`<InspectName>`), its comment count beside it, Inspect (`i`) or
// Comment on (`m`), from its context menu or ⌘K. Hosted in @bible/ui's
// Drawer, beside the page (not over it: the page stays live, a tap outside
// keeps it open), swiped away to the right or closed with Escape; its footer
// prints the keys of the commands about the thing while the pointer or the
// focus is in it (`Hint`).

import { Drawer } from '@bible/ui/drawer';
import { type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
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
import { Hint } from '../command/inspector.tsx';
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
  const [opened, setOpened] = createSignal(Option.none<Opened>(), { ownedWrite: true });
  const open = (selection: Selection, at: OpenAt) =>
    setOpened(Option.some({ key: targetAttr(selection), at }));
  const things: Things = {
    at: (selection) => Option.fromUndefinedOr(shown.get(targetAttr(selection))),
    open,
  };
  onCleanup(props.hub.commands.register(...thingCommands(things)));
  const value: InspectingValue = {
    hub: props.hub,
    opened,
    open,
    close: (key) => setOpened((now) => Option.filter(now, (o) => o.key !== key)),
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

/** Register `thing` for as long as the calling row is shown. */
export const useThing = (thing: Thing): void => {
  const inspecting = useInspecting();
  onCleanup(inspecting.put(thing));
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
  return (
    <Show when={Option.getOrUndefined(at())}>
      {(opened) => (
        <Drawer.Root
          open
          modal={false}
          disablePointerDismissal
          swipeDirection="right"
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
                initialFocus={() =>
                  Option.getOrElse(
                    Option.filter(comment, () => opened() === 'comment'),
                    () => true,
                  )
                }
              >
                <header class="lab-inspector-head">
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
      )}
    </Show>
  );
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
