// The Lab's pages, the Lab and the Script, as the server and the browser
// both render them (`LabPage`): the place as the URL holds it, the mode the
// Lab's panel shows, and the film's notes (`notes/thread.tsx`, its list here); and on the Lab
// its panel (`LabPanel`), with the mode tray, each tool's section, and the
// notes under the pen and the Note frame button.
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
import { For, Loading, Portal, Show } from '@solidjs/web';
import { Array as Arr, Equal, Layer, Option } from 'effect';
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
import { type Host, hostLayer } from '../browser/host.ts';
import { keptText } from '../browser/storage.ts';
import { ViewerStore } from '../browser/storage-browser.ts';
import type { Hub } from '../command/hub.ts';
import { type LabClient, labApiLayer } from './api.ts';
import { LAB_MODES, type LabMode, MODE_TITLE, citedMode, modeCommands, modeOf } from './mode.ts';
import { labPlaceOf } from './place.ts';
import { pressed } from './pressed.ts';
import { PanelAside, SelectionSheet } from './selection-sheet.tsx';
import { isLive } from './source/open.ts';
import { PHONE, useMatches } from './viewport.ts';
import {
  Asks,
  NOTE_STATE,
  NotesFeed,
  type PageRuntime,
  ReplyForm,
  Said,
  Still,
  Thread,
  noteLabel,
  useNotesFeed,
} from './notes/thread.tsx';
import { feedText } from './notes/feed.ts';
import type { Note } from '../core/schema.ts';
import { BY_BUTTON, quietly } from '../command/command.ts';
import { Selection } from '../command/selection.ts';
import { Target, type TargetElementProps } from './command/context-menu.tsx';
import { hubKeys } from './command/changes.ts';

// ---------------------------------------------------------------- Notes

/** The pen's command. */
const PEN = 'notes.pen';

/** Note this frame's command (`n`). */
const NOTE_FRAME = 'notes.frame';

/** The pen: a drag on the frame draws ink while it is on. */
const Pen = (props: { readonly hub: Hub }) => {
  const feed = useNotesFeed();
  const keys = hubKeys(props.hub);
  return (
    <button
      type="button"
      data-act="pen"
      class="sh-btn"
      aria-pressed={pressed(feed.pen())}
      title={keys.titled('draw freehand ink on the frame', PEN)}
      onClick={() => props.hub.invokeId(PEN, BY_BUTTON)}
    >
      Pen
    </button>
  );
};

/** Note the whole frame shown: the touch path for Note this frame, once the film is staged. */
const Frame = (props: { readonly hub: Hub }) => {
  const feed = useNotesFeed();
  const keys = hubKeys(props.hub);
  return (
    <button
      type="button"
      class="sh-btn"
      data-act="note-frame"
      title={keys.titled('note the whole frame shown', NOTE_FRAME)}
      disabled={Option.isNone(feed.staged())}
      onClick={() => props.hub.invokeId(NOTE_FRAME, BY_BUTTON)}
    >
      Note frame
    </button>
  );
};

/** The Lab's notes commands, the Pen and Note this frame, registered on its hub while it is shown. */
const NotesCommands = (props: ParentProps<{ readonly hub: Hub }>) => {
  const feed = useNotesFeed();
  const hub = props.hub;
  // The header's pen and Note frame are commands, registered with the page
  // (a server render names their keys as the browser does): their buttons,
  // keys and ⌘K reach them alike. Note this frame waits for the staged film.
  onCleanup(
    hub.commands.register(
      {
        id: PEN,
        label: 'Pen on or off',
        group: 'Notes',
        touch: 'the Pen button in the header',
        when: () => true,
        run: quietly(() => feed.togglePen()),
      },
      {
        id: NOTE_FRAME,
        label: 'Note this frame',
        group: 'Notes',
        keys: ['n'],
        touch:
          'the Note frame button in the header; tap the frame to pin a point, drag to draw a box',
        when: () => Option.isSome(feed.staged()),
        run: quietly(() => Option.map(feed.staged(), (s) => s.noteFrame())),
      },
    ),
  );
  return <>{props.children}</>;
};

interface ItemProps {
  readonly film: string;
  readonly host: Host;
  readonly hub: Hub;
  readonly note: Note;
}

/**
 * One note in the list: its place, words, still and thread, and on the
 * selected one its reply: in place, or on a phone, once the film is staged,
 * in the selection's sheet, which peeks the note's label and its status.
 */
const Item = (props: ItemProps) => {
  const feed = useNotesFeed();
  const selected = () => Option.exists(feed.selected(), (s) => s.id === props.note.id);
  const at = () => Option.map(feed.staged(), (s) => s.whenOf(props.note));
  const of = () => Selection.cases.Note.make({ id: props.note.id });
  return (
    <Target
      of={of()}
      render={(p: TargetElementProps) => <li {...p} />}
      class={['lab-note-item', props.note.status, { selected: selected() }]}
      data-id={props.note.id}
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
        // The sheet stands in the item, fixed over the page: a tap in it opens nothing.
        const inSheet = (el: Element) =>
          Option.isSome(Option.fromNullishOr(el.closest('.lab-inspector-sheet')));
        if (e.target instanceof Element && inSheet(e.target)) return;
        Option.map(feed.staged(), (s) => s.select(props.note));
      }}
    >
      <div class="lab-note-head">
        <span class="lab-note-label">{noteLabel(props.note, at())}</span>
        <span class="sh-badge" data-state={NOTE_STATE[props.note.status]}>
          {props.note.status}
        </span>
      </div>
      <Said note={props.note} />
      <Asks note={props.note} />
      <Still film={props.film} name={props.note.still} />
      <Thread film={props.film} note={props.note} />
      <Show when={selected()}>
        <SelectionSheet
          host={props.host}
          hub={props.hub}
          of={Option.as(feed.staged(), of())}
          peek={`${noteLabel(props.note, at())} · ${props.note.status}`}
          dismiss={() => Option.map(feed.staged(), (s) => s.dismiss())}
        >
          <Show when={props.note.status !== 'resolved'}>
            <ReplyForm note={props.note} />
          </Show>
        </SelectionSheet>
      </Show>
    </Target>
  );
};

/**
 * The feed's status, and the notes, newest first (how to make one while
 * there is none): what the server sends, and the browser follows.
 */
const List = (props: { readonly film: string; readonly host: Host; readonly hub: Hub }) => {
  const feed = useNotesFeed();
  // Note this frame's key as bound now: a rebound key reads as rebound.
  const keys = hubKeys(props.hub);
  const composing = () => Option.exists(feed.staged(), (s) => s.composerOpen());
  return (
    <Loading>
      <span class="lab-feed">{feedText(feed.state())}</span>
      <ol class="lab-notes">
        <For each={[...feed.notes()].reverse()} keyed={(n) => n.id}>
          {(note) => <Item film={props.film} host={props.host} hub={props.hub} note={note()} />}
        </For>
      </ol>
      <Show when={feed.notes().length === 0 && !composing()}>
        <p class="lab-feed" data-role="notes-empty">
          No notes yet: tap or click the frame to pin a point, drag for a box, or Note frame (
          <kbd>{keys.first(NOTE_FRAME)}</kbd>) for the whole frame.
        </p>
      </Show>
    </Loading>
  );
};

/** What the lab has picked, and how it compares with HEAD, as the URL at `href` holds it. */
const pickOf = (href: string) => {
  const { selection, note, beat, view, code, words, text } = labPlaceOf(href);
  return { selection, note, beat, view, code, words, text };
};

/** The lab's place: the cue or knob picked, the note, the studio's beat a link cites, the compare's view, the Source view, the words selected, and the Transcript view. */
type LabPick = ReturnType<typeof pickOf>;

/** What an entry's link cites (`citedMode`): its note, its beat, and the cue or knob it landed on. */
type Entry = Pick<LabPick, 'note' | 'beat' | 'selection'>;

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
   * Hear each mode shown (`showMode`: the tray, ⌘K, a note begun) until the
   * returned function is called: Code mode, which sets the panel aside, is
   * left for it (`source/context.tsx`).
   */
  readonly onModeShown: (heard: () => void) => () => void;
  /**
   * The beats the film lists, as the studio read them (its one read): with
   * them a `?beat=` the film lists opens Record.
   */
  readonly beatsListed: (beats: ReadonlyArray<string>) => void;
  /** What a reload held by the owner's unsaved work waits for; empty while none waits. */
  readonly reloadWaiting: Accessor<string>;
  readonly setReloadWaiting: (waiting: string) => void;
  /** Say the film is staged, its tools in the panel, until the returned function is called. */
  readonly staged: () => () => void;
  /** Whether the film is staged. */
  readonly isStaged: Accessor<boolean>;
  /** Where `name`'s controls go, once the page is the browser's. */
  readonly slot: (name: SlotName) => Accessor<Option.Option<HTMLElement>>;
  /** The panel's slot `name` made: the element `slot(name)` answers once the page has settled. */
  readonly slotted: (name: SlotName) => (el: HTMLElement) => void;
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
 * The Lab's side panel: while a reload waits on the owner's unsaved work,
 * what it waits for; the header (the mode tray); each tool's section, filled
 * by the staged lab; the notes, under the pen and Note frame. The modes'
 * commands are the panel's, for as long as it is mounted.
 */
export const LabPanel = () => {
  const page = useLabPage();
  onCleanup(page.hub.commands.register(...modeCommands(page.mode, page.showMode)));
  const at = (name: SlotName) => <div class="lab-slot" ref={page.slotted(name)} />;
  return (
    <aside class="lab-panel" data-mode={page.mode()} data-staged={pressed(page.isStaged())}>
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
 * One of the Lab's pages for film `name`: its place, its mode and the
 * film's notes, and `children` (the Lab's panel, and the staged lab, the
 * browser's) inside them. Its reads go through `client`, the page's one
 * client of the lab's API.
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
  // The mode, derived (`lab/mode.ts`): the one the viewer picked on this
  // entry, else the one the entry's citation shows, else the viewer's kept
  // one. An entry is each time the link comes to cite another beat or note
  // (a reload, a pasted link, a beat picked, Back). It cites its note, its
  // beat (`?beat=`) once the studio's list has it (a beat the film no longer
  // lists, or a list never read, cites none; the path's scene alone never
  // opens Record, the recorder's own beat being the studio's `beatAt`), and,
  // on the page's first entry (a reload or a pasted link), the cue or knob it
  // names; a cue picked on the page later cites nothing. The citation is
  // weighed against the kept mode as it is now (`citedMode`), so a kept mode
  // that reaches the page only as it hydrates (the server never sees it)
  // still meets the link. A cited note or beat leaves the kept mode as it
  // was: a pasted link is not the viewer's pick, and an entry without a
  // citation (Back) shows the kept mode again.
  const kept = useAtomValue(() => keptMode);
  const keep = useAtomSet(() => keptMode);
  const phone = useMatches(props.host, PHONE);
  const [listed, setListed] = createSignal(Option.none<ReadonlyArray<string>>(), {
    ownedWrite: true,
  });
  const cites = createMemo(
    () => `${Option.getOrElse(here().beat, () => '')}?${Option.getOrElse(here().note, () => '')}`,
  );
  /** The cue or knob the page landed on, which only its first entry cites. */
  let landing = untrack(here).selection;
  const entry = createMemo((): Entry => {
    cites();
    const at = untrack(here);
    const selection = landing;
    landing = Option.none();
    return { note: at.note, beat: at.beat, selection };
  });
  const [picked, setPicked] = createSignal(
    Option.none<{ readonly on: Entry; readonly mode: LabMode }>(),
    { ownedWrite: true },
  );
  const mode = createMemo(() => {
    const at = entry();
    const own = modeOf(kept());
    const cited = citedMode(
      {
        note: at.note,
        beat: Option.filter(at.beat, (b) => Option.exists(listed(), (ids) => ids.includes(b))),
        selection: at.selection,
      },
      { now: own, phone: phone() },
    );
    const pick = Option.map(
      Option.filter(picked(), (p) => p.on === at),
      (p) => p.mode,
    );
    return Option.getOrElse(
      Option.orElse(pick, () => cited),
      () => own,
    );
  });
  /** What hears each mode shown (`onModeShown`). */
  const modeHeard = new Set<() => void>();
  const showMode = (m: LabMode) => {
    setPicked(Option.some({ on: untrack(entry), mode: m }));
    keep(m);
    for (const heard of modeHeard) heard();
  };
  const beatsListed = (beats: ReadonlyArray<string>) => {
    setListed(Option.some(beats));
  };
  // Code mode (`?code=live`) sets the panel aside, its selection sheets with it (`PanelAside`).
  const aside = createMemo(() => isLive(here().code));
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
    onModeShown: (heard) => {
      modeHeard.add(heard);
      return () => {
        modeHeard.delete(heard);
      };
    },
    beatsListed,
    reloadWaiting,
    setReloadWaiting,
    staged: () => {
      setStaged(true);
      return () => setStaged(false);
    },
    isStaged: staged,
    slot: (name) => () => Option.fromUndefinedOr(slots().get(name)),
    slotted: (name) => (el) => {
      made.set(name, el);
    },
  };
  return (
    <LabPageContext value={value}>
      <PanelAside value={aside}>
        <NotesFeed film={props.name} runtime={runtime} note={() => here().note}>
          <NotesCommands hub={props.hub}>{props.children}</NotesCommands>
        </NotesFeed>
      </PanelAside>
    </LabPageContext>
  );
};
