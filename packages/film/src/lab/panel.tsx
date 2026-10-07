// The Lab's page as the server and the browser both render it (PA-12): the
// lab's place as the URL holds it, the mode the panel shows, and the panel
// itself, with the mode tray, each tool's section, and the film's notes
// under the pen and the Note frame button (`notes/list.tsx`).
// None of it reads the film's code, which the server never imports: the
// tools' own controls (the cue inspector, the knobs, the findings, the
// onion and the speed, the compare's modes, the recorder) need the staged
// film, so each section keeps a slot (`Slot`) that the staged lab
// (`shell.tsx`'s `Lab.Root`, each tool's provider) fills once the browser
// has staged the film (`Fill`). Until then a section holds only its head line.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Toggle } from '@bible/ui/toggle';
import { ToggleGroup } from '@bible/ui/toggle-group';
import * as UrlAtom from '@bible/url-state/atom';
import { For, Portal, Show } from '@solidjs/web';
import { Array as Arr, Equal, Layer, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import { type Host, hostLayer } from '../browser/host.ts';
import { keptText } from '../browser/storage.ts';
import { ViewerStore } from '../browser/storage-browser.ts';
import type { Hub } from '../command/hub.ts';
import { type LabClient, labApiLayer } from './api.ts';
import { LAB_MODES, type LabMode, MODE_TITLE, modeCommands, modeOf } from './mode.ts';
import { labPlaceOf } from './place.ts';
import { Frame, List, NotesFeed, Pen, type PageRuntime } from './notes/list.tsx';

/** What the lab has picked, and how it compares with HEAD, as the URL at `href` holds it. */
const pickOf = (href: string) => {
  const { selection, note, beat, view } = labPlaceOf(href);
  return { selection, note, beat, view };
};

/** The lab's place: the cue or knob picked, the note, the studio's beat a link cites, the compare's view. */
type LabPick = ReturnType<typeof pickOf>;

/** The places in the panel the staged lab fills: each tool's controls, by section. */
type SlotName = 'edit' | 'motion-head' | 'motion' | 'compare' | 'compose' | 'record';

interface LabPageValue {
  /** The film's name (`/films/<film>/lab`), which every lab route names. */
  readonly name: string;
  readonly host: Host;
  readonly hub: Hub;
  /** The page's one client of the lab's API: the staged lab's reads go through it too. */
  readonly client: Layer.Layer<LabClient>;
  /** The lab's place, as the URL holds it. */
  readonly here: Accessor<LabPick>;
  /** The tool the panel shows (`lab/mode.ts`): one at a time. */
  readonly mode: Accessor<LabMode>;
  /** Show `mode` in the panel, and keep it for this viewer. */
  readonly showMode: (mode: LabMode) => void;
  /**
   * The beats the film lists, as the studio read them (its one read): with
   * them the panel decides, once an entry, whether its `?beat=` opens Record.
   */
  readonly beatsListed: (beats: ReadonlyArray<string>) => void;
  /** What a reload held by the owner's unsaved work waits for; empty while none waits. */
  readonly reloadWaiting: Accessor<string>;
  readonly setReloadWaiting: (waiting: string) => void;
  /** Say the film is staged, its tools in the panel, until the returned function is called. */
  readonly staged: () => () => void;
  /** Where `name`'s controls go, once the page is the browser's. */
  readonly slot: (name: SlotName) => Accessor<Option.Option<HTMLElement>>;
}

const LabPageContext = createContext<LabPageValue>();

/** The Lab's page: only inside `<LabPage>`. */
export const useLabPage = (): LabPageValue => useContext(LabPageContext);

/** The viewer's mode, kept in the browser: a convenience, safe to lose (none on the server). */
const keptMode = keptText(ViewerStore, 'film-studio.lab-mode');

/**
 * Put `children` in the panel's slot `at` (a section's controls), for as
 * long as this is mounted: the staged lab's, made in its own context.
 */
export const Fill = (props: ParentProps<{ readonly at: SlotName }>) => {
  const slot = useLabPage().slot(props.at);
  return (
    <Show when={Option.getOrUndefined(slot())}>
      {(at) => <Portal mount={at()}>{props.children}</Portal>}
    </Show>
  );
};

/** The mode tray: the kit's segmented control, one mode pressed (pressing it again keeps it). */
const ModeTray = () => {
  const page = useLabPage();
  return (
    <ToggleGroup<LabMode>
      class="sh-seg lab-modes"
      aria-label="Mode"
      value={[page.mode()]}
      onValueChange={(pressed) => {
        Option.map(Arr.head(pressed), page.showMode);
      }}
    >
      <For each={LAB_MODES}>
        {(m) => (
          <Toggle<LabMode> value={m} data-mode-pick={m}>
            {MODE_TITLE[m]}
          </Toggle>
        )}
      </For>
    </ToggleGroup>
  );
};

/**
 * A tool's section of the panel, shown in its mode: what the staged lab puts
 * in it, under its head line if it has one. The tray above already shows the
 * mode pressed, so the section's name is for a screen reader only.
 */
const Section = (
  props: ParentProps<{
    readonly class: string;
    readonly mode: LabMode;
    readonly title: string;
  }>,
) => (
  <section class={props.class} data-mode-of={props.mode} aria-label={props.title}>
    {props.children}
  </section>
);

/**
 * The side panel: while a reload waits on the owner's unsaved work, what it
 * waits for; the header (the mode tray); each tool's section, filled by the
 * staged lab; the notes, under the pen and Note frame.
 */
const Panel = (props: {
  readonly slots: (name: SlotName) => (el: HTMLElement) => void;
  readonly staged: Accessor<boolean>;
}) => {
  const page = useLabPage();
  const at = (name: SlotName) => <div class="lab-slot" ref={props.slots(name)} />;
  return (
    <aside class="lab-panel" data-mode={page.mode()} data-staged={String(props.staged())}>
      <Show when={page.reloadWaiting()}>
        {(waiting) => (
          <p class="lab-reload-waiting" role="status">
            {waiting()}
          </p>
        )}
      </Show>
      <header>
        <ModeTray />
      </header>
      <Section class="lab-edit" mode="edit" title="Edit">
        {at('edit')}
      </Section>
      <Section class="lab-motion" mode="motion" title="Motion">
        <header>{at('motion-head')}</header>
        {at('motion')}
      </Section>
      <Section class="lab-compare-tools" mode="compare" title="Compare">
        <header>
          <span class="lab-edit-key">with last commit</span>
        </header>
        {at('compare')}
      </Section>
      <div class="lab-notes-box" data-mode-of="note">
        {/* Note's own: `n` and ⌘K note the frame in any mode, and a note begun shows Note. */}
        <header class="lab-note-head">
          <Pen hub={page.hub} />
          <Frame hub={page.hub} />
        </header>
        {at('compose')}
        <List film={page.name} host={page.host} hub={page.hub} />
      </div>
      <section class="lab-studio" data-mode-of="record">
        {at('record')}
      </section>
    </aside>
  );
};

/**
 * The Lab's page for film `name`: its place, its mode and its panel, and
 * `children` (the staged lab, the browser's) inside them. Its reads go
 * through `client`, the page's one client of the lab's API.
 */
export const LabPage = (
  props: ParentProps<{
    readonly name: string;
    readonly host: Host;
    readonly hub: Hub;
    readonly client: Layer.Layer<LabClient>;
  }>,
) => {
  const runtime: PageRuntime = Atom.runtime(
    Layer.mergeAll(labApiLayer(props.name), hostLayer(props.host)).pipe(
      Layer.provide(props.client),
    ),
  );
  const href = useAtomValue(() => UrlAtom.href);
  const here = createMemo(() => pickOf(href()), { equals: Equal.equals });
  // The mode: the one shown on this page (picked, or a cited note's or
  // beat's), else Note on a link that names a note, else the viewer's kept one.
  const kept = useAtomValue(() => keptMode);
  const keep = useAtomSet(() => keptMode);
  const [chosen, setChosen] = createSignal(Option.none<LabMode>(), { ownedWrite: true });
  const mode = createMemo(() =>
    Option.getOrElse(
      Option.orElse(chosen(), () => Option.map(here().note, (): LabMode => 'note')),
      () => modeOf(kept()),
    ),
  );
  /** Whether the viewer has picked a mode since the link last cited another beat or note. */
  let picked = false;
  const showMode = (m: LabMode) => {
    picked = true;
    setChosen(Option.some(m));
    keep(m);
  };
  // Each time the link comes to cite another beat or note (an entry: a
  // reload, a pasted link, a beat picked, Back), one that names a beat
  // (`?beat=`) the film lists, and no note, shows Record (the only mode that
  // shows beats). It is decided once an entry, when both the entry and the
  // studio's list are known: a beat the film no longer lists, a list never
  // read, or a mode the viewer picked on the entry before then leaves the
  // mode as it is. The path's scene alone never opens Record; the
  // recorder's own beat is the studio's (`beatAt`).
  const [listed, setListed] = createSignal(Option.none<ReadonlyArray<string>>(), {
    ownedWrite: true,
  });
  const cited = createMemo(
    () => `${Option.getOrElse(here().beat, () => '')}?${Option.getOrElse(here().note, () => '')}`,
  );
  let entry = Option.none<string>();
  let decided = false;
  createEffect(
    () => [cited(), listed()] as const,
    ([cite, beats]) => {
      if (!Option.contains(entry, cite)) {
        entry = Option.some(cite);
        decided = false;
        picked = false;
      }
      if (decided || Option.isNone(beats)) return;
      decided = true;
      const at = untrack(here);
      const listedBeat = Option.filter(at.beat, (b) => beats.value.includes(b));
      if (!picked && Option.isNone(at.note) && Option.isSome(listedBeat))
        setChosen(Option.some<LabMode>('record'));
    },
  );
  const beatsListed = (beats: ReadonlyArray<string>) => {
    setListed(Option.some(beats));
  };
  // A note picked (a link, a pin, Back) shows the Note mode on this page, the
  // only one that shows notes, and leaves the viewer's own mode as it was (a
  // pasted link is not their pick); a cue or a knob shows on the strip in
  // every mode.
  createEffect(
    () => here().note,
    (note) => {
      Option.map(note, () => setChosen(Option.some<LabMode>('note')));
    },
  );
  onCleanup(props.hub.commands.register(...modeCommands(mode, showMode)));
  const [reloadWaiting, setReloadWaiting] = createSignal('', { ownedWrite: true });
  const [staged, setStaged] = createSignal(false, { ownedWrite: true });
  // The slots are the browser's elements: each lands once the page is
  // mounted (a server render and its hydration leave them empty).
  const made = new Map<SlotName, HTMLElement>();
  const [slots, setSlots] = createSignal<ReadonlyMap<SlotName, HTMLElement>>(new Map(), {
    ownedWrite: true,
  });
  onSettled(() => {
    setSlots(new Map(made));
  });
  const value: LabPageValue = {
    name: props.name,
    host: props.host,
    hub: props.hub,
    client: props.client,
    here,
    mode,
    showMode,
    beatsListed,
    reloadWaiting,
    setReloadWaiting,
    staged: () => {
      setStaged(true);
      return () => setStaged(false);
    },
    slot: (name) => () => Option.fromUndefinedOr(slots().get(name)),
  };
  return (
    <LabPageContext value={value}>
      <NotesFeed film={props.name} runtime={runtime} hub={props.hub} note={() => here().note}>
        <Panel
          slots={(name) => (el) => {
            made.set(name, el);
          }}
          staged={staged}
        />
        {props.children}
      </NotesFeed>
    </LabPageContext>
  );
};
