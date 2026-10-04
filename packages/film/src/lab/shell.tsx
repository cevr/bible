// The lab's shell as compound components: `<Lab.Root>` holds what every panel
// shares (the staged film and its player, the lab API's base, the view kept
// through a reload, the frame shown, and the lab's place: the pick and the
// note the URL holds, `lab/place.ts`), and the pieces place themselves: layers
// pinned over the film canvas (`<Lab.Overlay>`, `<Lab.Layer>`), the slot under
// the player's timeline (`<Lab.Strip>`), and the side panel (`<Lab.Panel>`,
// `<Lab.Header>`, `<Lab.Section>`). Each panel's own state lives in its own
// provider; the shell knows none of it.

import { RegistryProvider, useAtomValue } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import { Portal, Show } from '@solidjs/web';
import { Effect, Equal, Fiber, Layer, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  useContext,
} from 'solid-js';
import type { Film } from '../canvas/film.ts';
import { type BrowserServices, type Host, addressOn, hostLayer } from '../browser/host.ts';
import type { Player } from '../player/main.ts';
import { TabStore } from '../browser/storage-browser.ts';
import { type ViewStore, viewStore } from './view-state.ts';
import { type LabApi, LabClient, type NotesApi, labApiLayer } from './api.ts';
import { goToCommands } from '../command/go.ts';
import type { Hub } from '../command/hub.ts';
import type { LabSelection } from '../command/selection.ts';
import { CommandMenu } from './command/command-menu.tsx';
import { KeysSheet } from './command/keys-sheet.tsx';
import { Receipts } from './command/receipts.tsx';
import { TargetMenu } from './command/context-menu.tsx';
import { labHref, labPlaceOf } from './place.ts';
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
  /** What a reload held by the owner's unsaved work waits for (`ReloadGate`); empty while none waits. */
  readonly reloadWaiting: Accessor<string>;
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
  readonly name: string;
  readonly player: Player;
  readonly host: Host;
  readonly hub: Hub;
}

const Root = (props: RootProps) => {
  const { player } = props;
  const [T, setT] = createSignal(player.now(), fromDraw);
  const [drawn, setDrawn] = createSignal(0, fromDraw);
  onCleanup(
    player.onDraw((t) => {
      setT(t);
      setDrawn((n) => n + 1);
    }),
  );

  // Layers kept exactly over the film canvas, placed again as it resizes.
  const pinned = new Set<HTMLElement | SVGElement>();
  const place = () => {
    const r = player.canvas.getBoundingClientRect();
    for (const layer of pinned)
      Object.assign(layer.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
  };
  const watch = new ResizeObserver(place);
  watch.observe(player.canvas);
  window.addEventListener('resize', place);
  onCleanup(() => {
    watch.disconnect();
    window.removeEventListener('resize', place);
  });

  const view = viewStore(props.name, player.film.duration, TabStore);
  // Whether it was playing: kept as the page goes (a write reloads it), and played again on load.
  const keepPlaying = () => view.patch({ playing: player.playing() });
  window.addEventListener('pagehide', keepPlaying);
  onCleanup(() => window.removeEventListener('pagehide', keepPlaying));
  onSettled(() => {
    if (view.get().playing) player.play();
  });

  document.body.classList.add('lab');
  onCleanup(() => document.body.classList.remove('lab'));

  const [revision, setRevision] = createSignal(0, fromDraw);
  // Every reload (a write's, a kept take's, the rebuild's) waits while a panel holds unsaved work.
  const [reloadWaiting, setReloadWaiting] = createSignal('', { ownedWrite: true });
  const reloads = makeReloadGate(reloadHere(player, props.host), setReloadWaiting);
  const stage = makeStage(player, () => setRevision((n) => n + 1), reloads.request);
  const clientLayer = LabClient.layer;
  // The server rebuilt the pages (a source changed): reload onto the new code at this frame.
  const rebuilt = Effect.runFork(
    reloadOnRebuild(props.name, stage.reload).pipe(Effect.provide(clientLayer)),
  );
  onCleanup(() => Effect.runFork(Fiber.interrupt(rebuilt)));
  const runtime = Atom.runtime(
    Layer.mergeAll(stageLayer(stage), labApiLayer(props.name), hostLayer(props.host)).pipe(
      Layer.provide(clientLayer),
    ),
  );

  const scene = createMemo(() => player.film.sceneAt(T()).spec.id);
  // Every scene is a place ⌘K goes to by its name, shown from its start.
  onCleanup(
    props.hub.commands.register(
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
  const address = addressOn(props.host);
  const picked = (pick: Partial<ReturnType<typeof pickOf>>) =>
    labHref(props.name, player.film.placed, { ...pickOf(address.href()), ...pick }, player.now());

  const Inner = (inner: ParentProps) => {
    const href = useAtomValue(() => UrlAtom.href);
    const here = createMemo(() => pickOf(href()), { equals: Equal.equals });
    const value: LabContextValue = {
      state: {
        T,
        scene,
        drawn,
        revision,
        selection: () => here().selection,
        note: () => here().note,
        reloadWaiting,
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
      },
      meta: {
        name: props.name,
        film: player.film,
        player,
        view,
        stage,
        reloads,
        runtime,
        clientLayer,
        host: props.host,
        hub: props.hub,
      },
    };
    return <LabContext value={value}>{inner.children}</LabContext>;
  };

  // The registry's URL atoms read and write through the host's own `UrlState`,
  // so they and the time the player writes share one address bar.
  return (
    <RegistryProvider initialValues={[[UrlAtom.services, props.host]]}>
      <Inner>
        <TargetMenu hub={props.hub}>
          {props.children}
          <CommandMenu hub={props.hub} />
          <KeysSheet hub={props.hub} />
          <Receipts hub={props.hub} tab={TabStore} scope={`lab:${props.name}`} />
        </TargetMenu>
      </Inner>
    </RegistryProvider>
  );
};

/** What the lab has picked, as the URL at `href` holds it. */
const pickOf = (href: string) => {
  const { selection, note } = labPlaceOf(href);
  return { selection, note };
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
    <svg
      class="lab-overlay"
      viewBox={`0 0 ${meta.film.width} ${meta.film.height}`}
      preserveAspectRatio="none"
      ref={pin}
    >
      {props.children}
    </svg>
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

/**
 * The side panel: the header, then each tool's section; above them, while a
 * reload waits on the owner's unsaved work, what it waits for.
 */
const Panel = (props: ParentProps) => {
  const { state } = useLab();
  return (
    <aside class="lab-panel">
      <Show when={state.reloadWaiting()}>
        {(waiting) => (
          <p class="lab-reload-waiting" role="status">
            {waiting()}
          </p>
        )}
      </Show>
      {props.children}
    </aside>
  );
};

/**
 * The panel's header: its name and the header's tools. The film's other
 * parts are the studio shell's page bar (`page-shell.tsx`), not links here.
 * How to note a frame is in the `?` sheet (Note this frame's touch path) and
 * the notes' empty list (UR-80).
 */
const Header = (props: ParentProps) => (
  <header>
    <strong>Lab</strong>
    {props.children}
  </header>
);

interface SectionProps extends ParentProps {
  /** The section's class: the tool it holds (`lab-edit`, `lab-motion`, …). */
  readonly class: string;
}

/** One tool's section of the panel. */
const Section = (props: SectionProps) => <section class={props.class}>{props.children}</section>;

/** The lab's shell: `<Lab.Root>` and the pieces it places. */
export const Lab = { Root, Overlay, Layer: PinnedLayer, Strip, Panel, Header, Section };
