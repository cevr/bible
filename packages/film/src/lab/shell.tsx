// The lab's shell as compound components: `<Lab.Root>` holds what every panel
// shares (the staged film and its player, the lab API's base, the view kept
// through a reload, the frame shown), and the pieces place themselves: layers
// pinned over the film canvas (`<Lab.Overlay>`, `<Lab.Layer>`), the slot under
// the player's timeline (`<Lab.Strip>`), and the side panel (`<Lab.Panel>`,
// `<Lab.Header>`, `<Lab.Section>`). Each panel's own state lives in its own
// provider; the shell knows none of it.

import { RegistryProvider } from '@bible/atom-solid';
import { Portal } from '@solidjs/web';
import { Option } from 'effect';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createSignal, onCleanup, onSettled, useContext } from 'solid-js';
import type { Film } from '../canvas/film.ts';
import { labBase } from '../core/schema.ts';
import type { Player } from '../player/main.ts';
import { lookbookUrl } from '../player/pages.ts';
import { type ViewStore, sessionStore, viewStore } from '../player/view-state.ts';

/** What every panel reads: the film on the stage and the frame it shows. */
export interface LabState {
  /** Film seconds of the frame drawn last: follows every draw, a lab preview's included. */
  readonly T: Accessor<number>;
  /** Counts the frames drawn: a panel that must follow each draw (not only T) reads it. */
  readonly drawn: Accessor<number>;
}

export interface LabActions {
  /** Keep `layer` exactly over the film canvas until the returned function is called. */
  readonly pin: (layer: HTMLElement | SVGElement) => () => void;
}

export interface LabMeta {
  /** The film's name (`?film=`), which every lab route names. */
  readonly name: string;
  readonly film: Film;
  readonly player: Player;
  /** The film's lab API root (`labBase`). */
  readonly api: string;
  /** Speed, loop, onion, compare and play, kept through the reload a write causes. */
  readonly view: ViewStore;
}

export interface LabContextValue {
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

  const view = viewStore(props.name, sessionStore(), player.film.duration);
  // Whether it was playing: kept as the page goes (a write reloads it), and played again on load.
  const keepPlaying = () => view.patch({ playing: player.playing() });
  window.addEventListener('pagehide', keepPlaying);
  onCleanup(() => window.removeEventListener('pagehide', keepPlaying));
  onSettled(() => {
    if (view.get().playing) player.play();
  });

  document.body.classList.add('lab');
  onCleanup(() => document.body.classList.remove('lab'));

  const value: LabContextValue = {
    state: { T, drawn },
    actions: {
      pin: (layer) => {
        pinned.add(layer);
        place();
        return () => pinned.delete(layer);
      },
    },
    meta: { name: props.name, film: player.film, player, api: labBase(props.name), view },
  };
  return (
    <RegistryProvider>
      <LabContext value={value}>{props.children}</LabContext>
    </RegistryProvider>
  );
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

interface OverlayProps extends ParentProps {
  /** The overlay's element, for a panel not yet in Solid that draws on it. */
  readonly ref?: (el: SVGSVGElement) => void;
  /** Extra classes (`pen` while the pen draws). */
  readonly class?: Record<string, boolean>;
}

/**
 * The layer over the canvas, in the film's own pixels: every lab mark draws
 * here, never on the film.
 */
const Overlay = (props: OverlayProps) => {
  const { meta } = useLab();
  const pin = usePinned();
  return (
    <svg
      class={['lab-overlay', props.class ?? {}]}
      viewBox={`0 0 ${meta.film.width} ${meta.film.height}`}
      preserveAspectRatio="none"
      ref={(el: SVGSVGElement) => {
        pin(el);
        props.ref?.(el);
      }}
    >
      {props.children}
    </svg>
  );
};

interface LayerProps {
  readonly class: string;
  readonly ref?: (el: HTMLCanvasElement) => void;
  readonly hidden?: boolean;
}

/** A canvas pinned over the film, under the overlay: the onion skin, the HEAD compare. */
const Layer = (props: LayerProps) => {
  const { meta } = useLab();
  const pin = usePinned();
  return (
    <canvas
      class={props.class}
      width={meta.film.width}
      height={meta.film.height}
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

interface PanelProps extends ParentProps {
  /** The panel's element, for a panel not yet in Solid that mounts into it. */
  readonly ref?: (el: HTMLElement) => void;
}

/** The side panel: the header, then each tool's section. */
const Panel = (props: PanelProps) => (
  <aside class="lab-panel" ref={(el: HTMLElement) => props.ref?.(el)}>
    {props.children}
  </aside>
);

/** The panel's header: its name, the hint, the header's tools, and the look-book link. */
const Header = (props: ParentProps) => {
  const { meta } = useLab();
  return (
    <header>
      <strong>Lab</strong>
      <span class="lab-hint">
        click pin · drag box · <kbd>n</kbd> note this frame
      </span>
      {props.children}
      <a
        class="lab-lookbook"
        href={lookbookUrl(meta.name)}
        title="every scene's stills at its cue edges and 60% point, with the palette"
      >
        Look-book
      </a>
    </header>
  );
};

interface SectionProps extends ParentProps {
  /** The section's class: the tool it holds (`lab-edit`, `lab-motion`, …). */
  readonly class: string;
}

/** One tool's section of the panel. */
const Section = (props: SectionProps) => <section class={props.class}>{props.children}</section>;

/** The lab's shell: `<Lab.Root>` and the pieces it places. */
export const Lab = { Root, Overlay, Layer, Strip, Panel, Header, Section };
