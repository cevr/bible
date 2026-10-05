// The staged lab as compound components: `<Lab.Root>` holds what every tool
// shares once the browser has staged the film (the film and its player, the
// lab API's base, the view kept through a reload, the frame shown), beside
// what the Lab's page holds on both sides (`panel.tsx`, `useLabPage`: the
// lab's place, the pick and the note the URL holds, `lab/place.ts`, the mode
// and a held reload, which tools read from the page itself), and the
// pieces place themselves: layers pinned over the film canvas
// (`<Lab.Overlay>`, `<Lab.Layer>`), the slot under the player's timeline
// (`<Lab.Strip>`), and each tool's controls in its section of the page's
// panel (`Fill`, `panel.tsx`). Each tool's own state lives in its own
// provider; the shell knows none of it.

import { Portal, Show } from '@solidjs/web';
import { Duration, Effect, Fiber, Layer, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import type { Film } from '../canvas/film.ts';
import { type BrowserServices, type Host, addressOn, hostLayer } from '../browser/host.ts';
import type { Player } from '../player/main.ts';
import { TabStore } from '../browser/storage-browser.ts';
import { type ViewStore, viewStore } from './view-state.ts';
import { type LabApi, type LabClient, type NotesApi, labApiLayer } from './api.ts';
import { goToCommands } from '../command/go.ts';
import type { CompareView } from '../core/api.ts';
import type { Hub } from '../command/hub.ts';
import type { LabSelection } from '../command/selection.ts';
import { labHref } from './place.ts';
import { Fill, type LabPick, pickOf, useLabPage } from './panel.tsx';
import { reloadOnRebuild } from './rebuilt.ts';
import { type ReloadGate, makeReloadGate } from './reload-gate.ts';
import { type Stage, type StageOps, makeStage, reloadHere, stageLayer } from './stage.ts';

/** What every panel reads: the film on the stage, the frame it shows, and the lab's place. */
interface LabState {
  /** Film seconds of the frame drawn last: follows every draw, a lab preview's included. */
  readonly T: Accessor<number>;
  /** The scene under the playhead (`film.sceneAt(T)`): the editor's strip and compare read it. */
  readonly scene: Accessor<string>;
  /** Counts the frames drawn: a panel that must follow each draw (not only T) reads it. */
  readonly drawn: Accessor<number>;
  /** Counts the edits previewed and put back: a panel that draws the edited timeline or knobs reads it. */
  readonly revision: Accessor<number>;
  /** The cue or knob selected: the URL's (`?cue=`, `?knob=` in the path's scene). */
  readonly selection: Accessor<Option.Option<LabSelection>>;
  /** The note selected: the URL's (`?note=`). */
  readonly note: Accessor<Option.Option<string>>;
  /** How the compare meets HEAD: the URL's (`?view=`, PA-9). */
  readonly view: Accessor<CompareView>;
}

interface LabActions {
  /** Keep `layer` exactly over the film canvas until the returned function is called. */
  readonly pin: (layer: HTMLElement | SVGElement) => () => void;
  /** Select a cue or a knob, or nothing: a new history entry, so Back undoes the pick. */
  readonly select: (selection: Option.Option<LabSelection>) => void;
  /** Select a note, or none: a new history entry, so Back undoes the pick. */
  readonly selectNote: (note: Option.Option<string>) => void;
  /** Drop the note from the URL in place (it is gone from the feed): no entry to come back to. */
  readonly forgetNote: () => void;
  /** Compare with HEAD by `view`, the owner's pick: a new history entry, so Back walks the views. */
  readonly compareBy: (view: CompareView) => void;
  /** Write the compare's mode into the link in place, where it moved on its own: no entry of its own. */
  readonly keepCompare: (view: CompareView) => void;
}

interface LabMeta {
  /** The film's name (`/films/<film>/lab`), which every lab route names. */
  readonly name: string;
  readonly film: Film;
  readonly player: Player;
  /** Speed, loop, onion, compare and play, kept through the reload a write causes. */
  readonly view: ViewStore;
  /** The preview as the machines drive it: edits shown in memory, and `#t=` held for a write. */
  readonly stage: StageOps;
  /** The page's reloads, held while a panel holds work only the page has (a take under review, a note). */
  readonly reloads: ReloadGate;
  /** What the panels' machines and atoms run with: the stage, the lab API, the notes API and the host. */
  readonly runtime: Atom.AtomRuntime<Stage | LabApi | NotesApi | BrowserServices>;
  /** This page's client layer identity, reused by the studio's separate runtime. */
  readonly clientLayer: Layer.Layer<LabClient>;
  /** The page's host (`browser/host.ts`), built once at the page's root: what a panel's effects run with. */
  readonly host: Host;
  /**
   * The page's commands (`command/hub.ts`), built once at the page's root:
   * each tool registers its verbs here for as long as it is mounted, and the
   * keymap, ⌘K, the `?` sheet and the context menus read them.
   */
  readonly hub: Hub;
}

interface LabContextValue {
  readonly state: LabState;
  readonly actions: LabActions;
  readonly meta: LabMeta;
}

const LabContext = createContext<LabContextValue>();

/** The shell's context: only inside `<Lab.Root>`. */
export const useLab = (): LabContextValue => useContext(LabContext);

/** Draw-driven signals are written from the player's frame loop, inside or outside a scope. */
const fromDraw = { ownedWrite: true, equals: false } as const;

interface RootProps extends ParentProps {
  readonly player: Player;
}

/**
 * The staged lab, in the Lab's page (`panel.tsx`): every tool's base, once
 * the preview draws its film. Until its faces have loaded (`Player.drawable`)
 * the film's bar shows where it is and no tool stands, so none draws a frame
 * or takes a still in a fallback face.
 */
const Root = (props: RootProps) => {
  const [drawable, setDrawable] = createSignal(props.player.drawable(), { ownedWrite: true });
  const heard = props.player.onDraw(() => {
    heard();
    setDrawable(true);
  });
  onCleanup(heard);
  return (
    <Show when={drawable()}>
      <Staged player={props.player}>{props.children}</Staged>
    </Show>
  );
};

/** The staged lab around its tools: the film on its stage, and every tool's base. */
const Staged = (props: RootProps) => {
  const { player } = props;
  const page = useLabPage();
  const { name, host, hub } = page;
  // The page's panel has the film's tools in it while this lives.
  onCleanup(page.staged());
  const [T, setT] = createSignal(player.now(), fromDraw);
  const [drawn, setDrawn] = createSignal(0, fromDraw);
  onCleanup(
    player.onDraw((t) => {
      setT(t);
      setDrawn((n) => n + 1);
    }),
  );

  // Layers kept exactly over the film canvas, placed again as it or its
  // frame resizes (a window's resize, a phone turned: what moves the canvas
  // in its frame resizes one of them). They live in the canvas's own frame
  // (the stage), placed from its corner: as the page scrolls (a phone's lab
  // is one long page) they move with the picture, never left where it was (LS-7).
  const frame = pictureFrame(player);
  const pinned = new Set<HTMLElement | SVGElement>();
  const place = () => {
    const r = player.canvas.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    for (const layer of pinned)
      Object.assign(layer.style, {
        left: `${r.left - f.left - frame.clientLeft}px`,
        top: `${r.top - f.top - frame.clientTop}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
  };
  const watch = new ResizeObserver(place);
  watch.observe(player.canvas);
  watch.observe(frame);
  onCleanup(() => watch.disconnect());

  const view = viewStore(name, player.film.duration, TabStore);
  // Whether it was playing: kept as the page goes (a write reloads it), and played again on load.
  const keepPlaying = () => view.patch({ playing: player.playing() });
  window.addEventListener('pagehide', keepPlaying);
  onCleanup(() => window.removeEventListener('pagehide', keepPlaying));
  onSettled(() => {
    if (view.get().playing) player.play();
  });
  // A page reloaded onto new code flashes its picture once as it lands; one opened by hand does not.
  if (view.get().landed === true) {
    view.patch({ landed: false });
    onSettled(() => flashLanded(frame, host));
  }

  document.body.classList.add('lab');
  onCleanup(() => document.body.classList.remove('lab'));

  const [revision, setRevision] = createSignal(0, fromDraw);
  // Every reload (a write's, a kept take's, the rebuild's) waits while a panel holds
  // unsaved work; the page's panel says what it waits for.
  // Each reload says it is onto new code, so the page it lands on flashes once (PA-11).
  const reloads = makeReloadGate(
    Effect.andThen(
      Effect.sync(() => view.patch({ landed: true })),
      reloadHere(player, host),
    ),
    page.setReloadWaiting,
  );
  onCleanup(() => page.setReloadWaiting(''));
  const stage = makeStage(player, () => setRevision((n) => n + 1), reloads.request);
  const clientLayer = page.client;
  // The server rebuilt the pages (a source changed): reload onto the new code at this frame.
  const rebuilt = Effect.runFork(
    reloadOnRebuild(name, stage.reload).pipe(Effect.provide(clientLayer)),
  );
  onCleanup(() => Effect.runFork(Fiber.interrupt(rebuilt)));
  const runtime = Atom.runtime(
    Layer.mergeAll(stageLayer(stage), labApiLayer(name), hostLayer(host)).pipe(
      Layer.provide(clientLayer),
    ),
  );

  const scene = createMemo(() => player.film.sceneAt(T()).spec.id);
  // Every scene is a place ⌘K goes to by its name, shown from its start.
  onCleanup(
    hub.commands.register(
      ...goToCommands(
        player.film.placed.map((p) => ({
          kind: 'scene',
          id: p.spec.id,
          name: p.spec.id,
          go: () => player.seek(p.start),
        })),
      ),
    ),
  );

  // The lab's place is the URL's: a pick pushes an entry at the frame shown,
  // and Back or Forward landing on one shows its pick again.
  const address = addressOn(host);
  const picked = (pick: Partial<LabPick>) =>
    labHref(name, player.film.placed, { ...pickOf(address.href()), ...pick }, player.now());

  const { here } = page;
  const value: LabContextValue = {
    state: {
      T,
      scene,
      drawn,
      revision,
      selection: () => here().selection,
      note: () => here().note,
      view: () => here().view,
    },
    actions: {
      pin: (layer) => {
        pinned.add(layer);
        place();
        return () => pinned.delete(layer);
      },
      select: (selection) => address.push(picked({ selection })),
      selectNote: (note) => address.push(picked({ note })),
      forgetNote: () => address.replace(picked({ note: Option.none() })),
      compareBy: (view) => {
        if (view !== untrack(() => here().view)) address.push(picked({ view }));
      },
      keepCompare: (view) => address.replace(picked({ view })),
    },
    meta: {
      name,
      film: player.film,
      player,
      view,
      stage,
      reloads,
      runtime,
      clientLayer,
      host,
      hub,
    },
  };
  // The page's registry is its own (`film-page.tsx`): its URL atoms read and
  // write through the host's own `UrlState`, so they and the time the player
  // writes share one address bar.
  return <LabContext value={value}>{props.children}</LabContext>;
};

/** How long the picture flashes when new code lands. */
const LANDED_MS = 900;

/** Flash `frame` once (`[data-landed]`, styled in `player.css`), timed on `host`'s clock: new code landed. */
const flashLanded = (frame: HTMLElement, host: Host) => {
  frame.setAttribute('data-landed', '');
  Effect.runForkWith(host)(
    Effect.sleep(Duration.millis(LANDED_MS)).pipe(
      Effect.andThen(Effect.sync(() => frame.removeAttribute('data-landed'))),
    ),
  );
};

/** The element the film canvas sits in (its stage): the pinned layers' frame. */
const pictureFrame = (player: Player): HTMLElement =>
  Option.getOrElse(Option.fromNullishOr(player.canvas.parentElement), () => document.body);

/** `children` inside the picture's frame, where they scroll with the canvas. */
const OnPicture = (props: ParentProps) => {
  const { meta } = useLab();
  return <Portal mount={pictureFrame(meta.player)}>{props.children}</Portal>;
};

/** Pin the element `ref` hands over for as long as the component lives. */
const usePinned = (): ((el: HTMLElement | SVGElement) => void) => {
  const { actions } = useLab();
  let unpin = Option.none<() => void>();
  onCleanup(() => Option.map(unpin, (f) => f()));
  return (el) => {
    unpin = Option.some(actions.pin(el));
  };
};

/**
 * The layer over the canvas, in the film's own pixels: every lab mark draws
 * here, never on the film.
 */
const Overlay = (props: ParentProps) => {
  const { meta } = useLab();
  const pin = usePinned();
  return (
    <OnPicture>
      <svg
        class="lab-overlay"
        viewBox={`0 0 ${meta.film.width} ${meta.film.height}`}
        preserveAspectRatio="none"
        ref={pin}
      >
        {props.children}
      </svg>
    </OnPicture>
  );
};

interface LayerProps {
  readonly class: string;
  readonly ref?: (el: HTMLCanvasElement) => void;
  readonly hidden?: boolean;
  /** The canvas's pixels as a fraction of the film's (the onion draws at half). Defaults to 1. */
  readonly scale?: number;
}

/** A canvas pinned over the film, under the overlay: the onion skin, the HEAD compare. */
const PinnedLayer = (props: LayerProps) => {
  const { meta } = useLab();
  const pin = usePinned();
  return (
    <OnPicture>
      <canvas
        class={props.class}
        width={Math.round(meta.film.width * (props.scale ?? 1))}
        height={Math.round(meta.film.height * (props.scale ?? 1))}
        hidden={props.hidden}
        ref={(el: HTMLCanvasElement) => {
          pin(el);
          props.ref?.(el);
        }}
      />
    </OnPicture>
  );
};

/** A slot in the player's bar, right under its timeline: the cue strip goes here. */
const Strip = (props: ParentProps) => {
  const { meta } = useLab();
  const slot = document.createElement('div');
  slot.className = 'lab-strip-slot';
  meta.player.track.after(slot);
  onCleanup(() => slot.remove());
  return <Portal mount={slot}>{props.children}</Portal>;
};

/** The staged lab's shell: `<Lab.Root>` and the pieces it places; each tool's controls go in the page's panel (`Fill`). */
export const Lab = { Root, Overlay, Layer: PinnedLayer, Strip, Fill };
