// The review's pages. Home lists every folder with something to review,
// the productions first, then the films, then every folder no production
// holds, version stacks first. A folder shows its version stacks
// (Versions), and whatever is in no stack: its videos (with captions when a
// `.vtt` lies beside them), its sheets and stills (a lightbox), its docs
// (markdown inline). A stack plays every version on one clock: all of them,
// the first side by side with one other or wiped against it (a stack of two
// or more), every version's frame at a few moments, or the first and one
// other's difference at a moment. A version's name opens its inspector: its
// Info (its notes among it), its approve and unapprove, what was said of it
// and the comment box, said over the set's route.

import { useAtomValue } from '@bible/atom-solid';
import { unfiledOf } from '../../core/production.ts';
import { Dialog } from '@bible/ui/dialog';
import { Toggle } from '@bible/ui/toggle';
import * as UrlAtom from '@bible/url-state/atom';
import { ToggleGroup } from '@bible/ui/toggle-group';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Effect, Exit, Match, Option, Scope, Struct } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import {
  type Accessor,
  type ParentProps,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import {
  type ChoicePoint,
  type SeenPoint,
  type SeenVariant,
  seenPoint,
  seenVariants,
} from '../../core/choice.ts';
import { type Compare, type ComparePanes, Media } from '../../browser/media.ts';
import { Pointer, Surface } from '../../browser/pointer.ts';
import type {
  ReviewFile,
  ReviewFilms,
  ReviewFolder,
  ReviewIndex,
  ReviewVideo,
} from '../../core/review.ts';
import { timecode } from '../../core/time.ts';
import {
  Places,
  type ProjectView,
  type Say,
  type SetSaid,
  type SetSayPost,
  pageHref,
  reviewFileUrl,
  reviewFrameUrl,
  reviewStillUrl,
} from '../../core/api.ts';
import type { LabFailure } from '../api.ts';
import { pressed } from '../pressed.ts';
import { useSheetDismissal } from '../sheet.tsx';
import { addressOn } from '../../browser/host.ts';
import { StateBand } from '../scenes/card.tsx';
import { allBoard, filmCounts, filmLength, marksOf } from '../scenes/marks.ts';
import { ReviewApi } from './api.ts';
import { InspectName, Inspector, useInspected, useInspectorPlace, useThing } from './inspector.tsx';
import { Approval, CommentBox, Comments, type Sayer } from './options/choice.tsx';
import { approvalVerbs } from './things.ts';
import { setApproveUndo, setSaidText, undoApprove } from './options/receipt.ts';
import { quiet, refused } from '../../command/command.ts';
import { OpId, type Project, projectNow, versionState } from '../../core/catalogue.ts';
import { uniqueId } from '../../core/unique.ts';
import { Go, type ProjectShown, SetProvider, useProject, useReview, useSet } from './context.tsx';
import {
  agoText,
  approvalText,
  captionsFor,
  countsText,
  failedText,
  folderTitle,
  isFilmsFolder,
  isMarkdown,
  pathIn,
  POSTER_W,
  staleText,
  sizeText,
  versionsText,
  videoSource,
} from './format.ts';
import {
  LAYOUTS,
  type Layout,
  type SetMode,
  SyncEvent,
  ViewEvent,
  modeOf,
  modeView,
  modesOf,
  playsIn,
  viewNameOf,
} from './machine.ts';
import { Loaded, useWrite, writeStatus } from './loaded.tsx';
import { escapeHtml, markdownHtml } from './markdown.ts';
import { ReviewPlace as Place, stillIn, withStill } from './place.ts';
import { ProductionCards, useHistories } from './production.tsx';
import { HearToggle, PlayedAlone, Transport, useClockMedia } from './player.tsx';
import { Selection } from '../../command/selection.ts';
import { Target, type TargetElementProps } from '../command/context-menu.tsx';
import { hubKeys, registerWhile } from '../command/changes.ts';
import { wipeCommands, wipeTitle } from '../wipe-keys.ts';

/** A version of `set` in `folder`, as a selection: what a version's card is. */
const versionOf = (folder: ReviewFolder, set: { readonly id: string }, version: string) =>
  Selection.cases.Version.make({ folder: folder.ref, point: set.id, version });

/** A strip's frames are this wide; a poster (`POSTER_W`), a moment's frame and the lightbox wider. */
const THUMB_W = 320;
const MOMENT_W = 1280;
const LIGHTBOX_W = 1920;

/** The most frames a card's strip shows. */
const STRIP = 6;

/** The index once read, kept in place as it is read again; else what it waits on or why it failed. */
const WithIndex = (props: { readonly children: (index: Accessor<ReviewIndex>) => JSX.Element }) => {
  const { state } = useReview();
  return (
    <Loaded
      value={AsyncResult.value(state.index())}
      result={state.index()}
      reading="Reading the renders…"
    >
      {props.children}
    </Loaded>
  );
};

/** A strip of stills: one per file named, an image as it is, a video's frame 10% in. */
const Strip = (props: { readonly refs: ReadonlyArray<string> }) => (
  <div class="rv-strip">
    <For each={props.refs.slice(0, STRIP)}>
      {(ref) => <img loading="lazy" src={reviewStillUrl(ref, THUMB_W)} alt="" />}
    </For>
  </div>
);

/** The refs a folder's card shows: its first set's variants, else its first video. */
const posterRefs = (folder: ReviewFolder): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(folder.sets[0]), (set) =>
      seenVariants(set).map((v) => v.video.ref),
    ),
    () => folder.videos.slice(0, 1).map((v) => v.ref),
  );

const FolderCard = (props: { readonly folder: ReviewFolder }) => {
  const now = useReview().meta.now();
  const refs = posterRefs(props.folder);
  const image = Option.fromUndefinedOr(props.folder.images[0]);
  return (
    <Target
      of={Selection.cases.Folder.make({ folder: props.folder.ref })}
      class="rv-card"
      render={(p: TargetElementProps) => (
        <Go {...p} place={Place.Folder({ folder: props.folder.ref })}>
          <Show when={refs.length > 0}>
            <Strip refs={refs} />
          </Show>
          <Show when={refs.length === 0 && Option.getOrUndefined(image)} keyed>
            {(img: ReviewFile) => (
              <div class="rv-strip">
                <img loading="lazy" src={reviewFileUrl(img.ref)} alt="" />
              </div>
            )}
          </Show>
          <div class="rv-body">
            <b>{folderTitle(props.folder)}</b>
            <Show when={Option.isSome(props.folder.title)}>
              <div class="rv-hint">{props.folder.ref}</div>
            </Show>
            <div class="rv-meta">
              {countsText(props.folder)} · {agoText(props.folder.mtime, now)}
            </div>
          </div>
        </Go>
      )}
    />
  );
};

/** A heading over its things, shown while it has `count` of them; the count itself is not said at rest. */
const Section = (props: {
  readonly title: string;
  readonly count: number;
  readonly children: JSX.Element;
}) => (
  <Show when={props.count > 0}>
    <h2 class="rv-h">{props.title}</h2>
    {props.children}
  </Show>
);

/**
 * A film's state on its card, as its Project's head says it: its
 * length and scenes (`8:46 · 20 scenes`, `filmLength`), the state band and
 * `n/N approved · n out of date`, from the film's project as its owner
 * shows it (`useProject`: read by the server, sent with the page, then the
 * newest answer). Its band marks the renders and approvals; the check's
 * findings are Project's. Nothing while the project is read or when the
 * film has none.
 */
const FilmState = (props: { readonly read: ProjectShown }) => {
  const read = props.read;
  return (
    <Show when={Option.getOrUndefined(AsyncResult.value(read.view()))}>
      {(view: Accessor<ProjectView>) => (
        <>
          <div class="rv-film-length" data-role="length">
            {filmLength(view().project.scenes)}
          </div>
          <StateBand
            scenes={view().project.scenes}
            marks={(scene) => marksOf(Option.some(view()), [], [])(scene)}
          />
          <div class="rv-film-counts" data-role="counts">
            {filmCounts(view().project.scenes)}
          </div>
        </>
      )}
    </Show>
  );
};

/**
 * The app's films (none when the app has no films), each a card that opens
 * its Scenes, with the stills of the folder its renders sit in when the
 * review holds one, and its state (`FilmState`); its context menu opens its other parts (`filmCommands`),
 * which no line on the card spells out (a gesture is the `?` sheet's). The
 * switcher is the other way into a film; the page bar shows once one is
 * chosen.
 */
const Films = (props: { readonly folders: ReadonlyArray<ReviewFolder> }) => {
  const { state } = useReview();
  const films = () =>
    Option.getOrElse(
      Option.map(AsyncResult.value(state.films()), (f) => f.films),
      () => [],
    );
  /** The folder a film's renders sit in: the one named for it (`isFilmsFolder`). */
  const folderOf = (film: string) =>
    Option.fromUndefinedOr(props.folders.find((f) => isFilmsFolder(f.ref, film)));
  return (
    <Section title="Films" count={films().length}>
      <div class="rv-grid rv-films">
        <For each={films()}>{(film) => <FilmCard film={film} folder={folderOf(film)} />}</For>
      </div>
    </Section>
  );
};

/**
 * A film's card: its Scenes, or its Board while every scene is still a
 * storyboard card (`allBoard`: a new film starts on its board).
 */
const FilmCard = (props: {
  readonly film: string;
  readonly folder: Option.Option<ReviewFolder>;
}) => {
  const film = props.film;
  const read = untrack(() => useProject(film));
  const href = () =>
    Option.match(
      Option.filter(AsyncResult.value(read.view()), (view) => allBoard(view.project.scenes)),
      { onNone: () => pageHref.scenes(film), onSome: () => pageHref.board(film) },
    );
  return (
    <Target
      of={Selection.cases.Film.make({ film })}
      class="rv-card rv-film-card"
      data-film={film}
      render={(p: TargetElementProps) => (
        <a {...p} href={href()}>
          <Show
            when={Option.getOrUndefined(
              Option.filter(Option.map(props.folder, posterRefs), (refs) => refs.length > 0),
            )}
          >
            {(refs) => <Strip refs={refs()} />}
          </Show>
          <div class="rv-body">
            <b>{film}</b>
            <FilmState read={read} />
          </div>
        </a>
      )}
    />
  );
};

/**
 * The front door: the productions first (each a card that opens its
 * timeline, `production.tsx`), then the films, then every folder no
 * production holds: sets (version stacks) first, then the rest (⌘K finds
 * one by name).
 */
export const Home = () => (
  <WithIndex>
    {(index) => {
      const histories = useHistories();
      const unfiled = createMemo(() => unfiledOf(histories(), index().folders));
      const sets = createMemo(() => unfiled().filter((f) => f.sets.length > 0));
      const rest = createMemo(() => unfiled().filter((f) => f.sets.length === 0));
      return (
        <>
          <ProductionCards histories={histories()} />
          <Films folders={index().folders} />
          <Section title="Sets" count={sets().length}>
            <div class="rv-grid">
              <For each={sets()}>{(folder) => <FolderCard folder={folder} />}</For>
            </div>
          </Section>
          <Section title="Renders" count={rest().length}>
            <div class="rv-grid">
              <For each={rest()}>{(folder) => <FolderCard folder={folder} />}</For>
            </div>
          </Section>
          <Show when={index().folders.length === 0}>
            <p class="empty">Nothing here yet.</p>
          </Show>
        </>
      );
    }}
  </WithIndex>
);

/** A doc, read when opened, its markdown shown inline. */
const Doc = (props: { readonly doc: ReviewFile }) => {
  const [open, setOpen] = createSignal(false);
  const now = useReview().meta.now();
  return (
    <details
      class="rv-doc"
      // `toggle` does not bubble, so it is heard on the element itself.
      ref={(el: HTMLDetailsElement) => el.addEventListener('toggle', () => setOpen(el.open))}
    >
      <summary>
        <b>{props.doc.name}</b> <span class="rv-hint">{agoText(props.doc.mtime, now)}</span>
      </summary>
      <Show when={open()}>
        <Markdown file={props.doc} />
      </Show>
    </details>
  );
};

/**
 * A markdown file's text, shown as HTML (every character of it escaped
 * first): the file as the index names it, so a file written again is read again.
 */
const Markdown = (props: { readonly file: ReviewFile }) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.text(props.file));
  return (
    <div
      class="rv-note"
      innerHTML={Option.getOrElse(Option.map(AsyncResult.value(read()), markdownHtml), () =>
        Match.value(AsyncResult.isFailure(read())).pipe(
          Match.when(true, () => `<p class="rv-hint">${escapeHtml(failedText(read()))}</p>`),
          Match.orElse(() => '<p class="rv-hint">loading…</p>'),
        ),
      )}
    />
  );
};

/** An image the lightbox shows: its source, and the caption under it (what its card no longer says). */
interface Shown {
  readonly src: string;
  readonly caption: string;
}

/**
 * A still that opens full size in the lightbox, with its caption (`shown`):
 * a button, so a tap, a click, Enter and Space all open it, and its name
 * says what opens. The URL keeps it open (`?still=` its `name`), so a link
 * opens it, and Back closes it as every sheet's opening is. The lightbox is
 * the kit's dialog over every other layer of the page (the tab bar and the
 * dock too), titled by its caption: focus moves into it and back to the
 * still, and Escape or a tap anywhere closes it, by the sheets' one rule
 * (`useSheetDismissal`), adding no entry.
 */
const Zoom = (props: {
  readonly still: string;
  readonly alt: string;
  readonly shown: Shown;
  readonly name: string;
}) => {
  const { meta } = useReview();
  const href = useAtomValue(() => UrlAtom.href);
  const address = addressOn(meta.host);
  const dismissal = useSheetDismissal(meta.host, (at, name) =>
    Option.exists(stillIn(at), (open) => open === name),
  );
  const open = () => Option.exists(stillIn(href()), (name) => name === props.name);
  const show = () =>
    Option.map(withStill(untrack(href), props.name), (to) => {
      dismissal.opening(props.name);
      address.go(to);
    });
  const close = () => dismissal.dismiss(() => withStill(untrack(href), ''));
  return (
    <>
      <button
        type="button"
        class="rv-zoom"
        aria-label={`Open ${props.shown.caption}`}
        onClick={show}
      >
        <img class="rv-media" loading="lazy" src={props.still} alt={props.alt} />
      </button>
      <Dialog.Root
        open={open()}
        onOpenChange={(next: boolean) => {
          if (!next) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop class="rv-lightbox-backdrop" />
          <Dialog.Popup
            class="rv-lightbox"
            data-role="lightbox"
            data-still={props.name}
            onClick={close}
          >
            <img src={props.shown.src} alt={props.shown.caption} />
            <Dialog.Title class="rv-lightbox-caption">{props.shown.caption}</Dialog.Title>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

/**
 * A video in no set: its poster, its captions and its name, played on a
 * clock of its own (`PlayedAlone`). Its file (Open the file, Copy link,
 * Info: its size, age and proxy) is its long-press menu's.
 */
const LooseVideo = (props: {
  readonly video: ReviewVideo;
  readonly docs: ReadonlyArray<ReviewFile>;
}) => {
  const { state } = useReview();
  const captions = createMemo(() => captionsFor(props.video, props.docs));
  const source = createMemo(() => videoSource(props.video, state.quality()));
  return (
    <Target of={Selection.cases.File.make({ ref: props.video.ref })} class="rv-card rv-tall">
      <Show when={Option.getOrUndefined(source())} fallback={<ProxyPending video={props.video} />}>
        {(src) => (
          <PlayedAlone
            src={src()}
            video={props.video}
            poster={reviewFrameUrl(props.video.ref, Option.none(), POSTER_W)}
          >
            <Show when={Option.getOrUndefined(captions())} keyed>
              {(vtt: ReviewFile) => <track kind="captions" src={reviewFileUrl(vtt.ref)} default />}
            </Show>
          </PlayedAlone>
        )}
      </Show>
      <div class="rv-cap">
        <span class="rv-name">{props.video.name}</span>
      </div>
    </Target>
  );
};

/**
 * A version stack's card: its strip, its title, and how many versions when
 * there is more than one; their names are its long-press menu's
 * (Open version n).
 */
const SetCard = (props: { readonly folder: ReviewFolder; readonly set: ChoicePoint }) => (
  <Target
    of={Selection.cases.Set.make({ folder: props.folder.ref, point: props.set.id })}
    class="rv-card"
    render={(p: TargetElementProps) => (
      <Go {...p} place={Place.Set({ folder: props.folder.ref, point: props.set.id })}>
        <Strip refs={seenVariants(props.set).map((v) => v.video.ref)} />
        <div class="rv-body">
          <b>{props.set.title}</b>
          <Show when={props.set.variants.length >= 2}>
            <span class="sh-badge">{versionsText(props.set.variants.length)}</span>
          </Show>
        </div>
      </Go>
    )}
  />
);

/** A folder: its sets, then whatever is in none of them. */
const FolderBody = (props: { readonly folder: ReviewFolder }) => {
  const { meta } = useReview();
  const now = meta.now();
  // Derived per index value, and the docs keyed by their file: a refreshed index leaves an
  // open doc open.
  const markdown = createMemo(() => props.folder.docs.filter(isMarkdown));
  const other = createMemo(() =>
    props.folder.docs.filter((d) => !isMarkdown(d) && !d.name.endsWith('.vtt')),
  );
  return (
    <>
      <Show when={Option.getOrUndefined(props.folder.blurb)}>
        {(blurb) => <div class="rv-note" data-review-blurb innerHTML={markdownHtml(blurb())} />}
      </Show>
      <Section title="Versions" count={props.folder.sets.length}>
        <div class="rv-grid rv-wide">
          <For each={props.folder.sets}>{(set) => <SetCard folder={props.folder} set={set} />}</For>
        </div>
      </Section>
      <Section title="Videos" count={props.folder.videos.length}>
        <div class="rv-grid rv-wide">
          <For each={props.folder.videos}>
            {(video) => <LooseVideo video={video} docs={props.folder.docs} />}
          </For>
        </div>
      </Section>
      <Section title="Sheets & stills" count={props.folder.images.length}>
        <div class="rv-grid">
          <For each={props.folder.images}>
            {(image) => (
              <div class="rv-card">
                {/* Its path in the folder and its age are the lightbox's caption, and its name. */}
                <Zoom
                  still={reviewFileUrl(image.ref)}
                  name={image.ref}
                  alt={image.name}
                  shown={{
                    src: reviewFileUrl(image.ref),
                    caption: `${pathIn(props.folder, image)} · ${agoText(image.mtime, now)}`,
                  }}
                />
              </div>
            )}
          </For>
        </div>
      </Section>
      <Section title="Docs" count={markdown().length + other().length}>
        <For each={markdown()} keyed={(doc) => doc.ref}>
          {(doc) => <Doc doc={doc()} />}
        </For>
        <Show when={other().length > 0}>
          <p class="rv-row">
            <For each={other()} keyed={(doc) => doc.ref}>
              {(doc) => (
                <a class="sh-btn" href={reviewFileUrl(doc().ref)} target="_blank" rel="noreferrer">
                  {doc().name}
                </a>
              )}
            </For>
          </p>
        </Show>
      </Section>
      <Section title="Downloads" count={props.folder.downloads?.length ?? 0}>
        <p class="rv-row">
          <For each={props.folder.downloads ?? []}>
            {(file) => (
              <a
                class="sh-btn"
                data-review-download
                href={reviewFileUrl(file.ref)}
                download={file.name}
              >
                {file.name} · {sizeText(file.size)}
              </a>
            )}
          </For>
        </p>
      </Section>
    </>
  );
};

const folderIn = (index: ReviewIndex, ref: string) =>
  Option.fromUndefinedOr(index.folders.find((f) => f.ref === ref));

const Missing = (props: { readonly what: string }) => (
  <p class="empty">
    No {props.what} here now. <Go place={Place.Home()}>Every folder</Go>
  </p>
);

export const FolderPage = (props: { readonly folder: string }) => (
  <WithIndex>
    {(index) => (
      // Not keyed: a new index value moves the folder under the page, it does not remake it.
      <Show
        when={Option.getOrUndefined(folderIn(index(), props.folder))}
        fallback={<Missing what="folder" />}
      >
        {(folder) => <FolderBody folder={folder()} />}
      </Show>
    )}
  </WithIndex>
);

// ---------------------------------------------------------------------------
// A set

/**
 * In a video's place while its proxy is still being made, on Proxy: its
 * still, what is happening, and the way to play the Original instead. The
 * original is never streamed in its place unasked.
 */
export const ProxyPending = (props: { readonly video: ReviewVideo }) => {
  const { actions } = useReview();
  return (
    <div class="rv-pending" data-proxy="pending">
      <img
        class="rv-media"
        loading="lazy"
        alt=""
        src={reviewFrameUrl(props.video.ref, Option.none(), POSTER_W)}
      />
      <p class="rv-row">
        <span class="rv-hint">Proxy being made ({sizeText(props.video.size)} original)</span>
        <button type="button" class="sh-btn" onClick={() => actions.quality('full')}>
          Play the original
        </button>
      </p>
    </div>
  );
};

const MODE_TITLES = {
  all: 'All',
  compare: 'Compare',
  moments: 'Moments',
} as const satisfies Record<SetMode, string>;

/** Compare's layouts (Frame.io's comparison viewer): side by side, wiped, the difference. */
const LAYOUT_TITLES = {
  pair: 'Side by side',
  wipe: 'Wipe',
  diff: 'Difference',
} as const satisfies Record<Layout, string>;

/**
 * The set's modes as one segmented control, and in Compare
 * its layouts as a second: the touch path of `v` and `⇧V` (`viewCommands`).
 * Each is a toggle group (the arrows move between its choices); a choice
 * sends the view, which the address owns, and the pressed one is the view
 * the address shows (a press on it offers nothing).
 */
const ViewTabs = () => {
  const { set, view, send } = useSet();
  const name = () => viewNameOf(view());
  return (
    <>
      <ToggleGroup<SetMode>
        class="sh-seg rv-views"
        aria-label="View"
        value={[modeOf(name())]}
        onValueChange={(chosen) => {
          Option.map(Arr.head(chosen), (mode) =>
            send.view(ViewEvent.ViewChosen({ view: modeView(mode, name()) })),
          );
        }}
      >
        <For each={modesOf(set().variants.length)}>
          {(mode) => (
            <Toggle<SetMode> value={mode} data-view={mode}>
              {MODE_TITLES[mode]}
            </Toggle>
          )}
        </For>
      </ToggleGroup>
      <Show when={modeOf(name()) === 'compare'}>
        <ToggleGroup<Layout>
          class="sh-seg rv-layouts"
          aria-label="Layout"
          value={Arr.filter(LAYOUTS, (layout) => layout === name())}
          onValueChange={(chosen) => {
            Option.map(Arr.head(chosen), (layout) =>
              send.view(ViewEvent.ViewChosen({ view: layout })),
            );
          }}
        >
          <For each={LAYOUTS}>
            {(layout) => (
              <Toggle<Layout> value={layout} data-view={layout}>
                {LAYOUT_TITLES[layout]}
              </Toggle>
            )}
          </For>
        </ToggleGroup>
      </Show>
    </>
  );
};

const letterOf = (set: SeenPoint, id: string) => set.variants.findIndex((v) => v.id === id) + 1;

/** The scene a set's render is of, when it is one scene's alone: the one an approve's Undo names. */
const sceneOf = (set: SeenPoint): Option.Option<string> =>
  Option.flatMap(set.address, (address) =>
    Match.value(address).pipe(
      Match.tag('Scenes', ({ ids }) =>
        Option.map(
          Option.liftPredicate(ids, (i) => i.length === 1),
          ([id]) => id,
        ),
      ),
      Match.orElse(() => Option.none<string>()),
    ),
  );

/** The set page's says: a control's own. */
interface SetSays {
  /** A control's own say (`useWrite`): made once, as the control is made. */
  readonly useSay: () => {
    readonly waiting: Accessor<boolean>;
    readonly say: (version: string, say: Say) => Promise<boolean>;
  };
}

const SetSaysContext = createContext<SetSays>();

/**
 * The set's says: approve, unapprove or comment on a version, over
 * `POST /api/review/sets/<folder>/<point>/say`. A say answers the folder as
 * it leaves it, shown in the index in its place, so the page stays in place
 * (its player plays on). A say is asked in the index's order, with its
 * reads (`asked.ts`): its answer is not shown over a Refresh asked after
 * it, and one a Refresh overtook reads the index again.
 */
const Saying = (props: ParentProps<{ readonly folder: ReviewFolder; readonly set: SeenPoint }>) => {
  const { meta, actions } = useReview();
  const status = writeStatus<SetSaid>('set');
  /** Version `id` as a receipt names it: its letter, its label, and the set's title. */
  const versionText = (id: string) =>
    Option.getOrElse(
      Option.map(
        Option.fromUndefinedOr(props.set.variants.find((v) => v.id === id)),
        (v) => `${letterOf(props.set, id)} · ${v.label} · ${props.set.title}`,
      ),
      () => id,
    );
  // A project folder's film and a render set of one scene: where an approve names its own run.
  const film = () => props.folder.title;
  const scene = () => sceneOf(props.set);
  const value: SetSays = {
    useSay: () => {
      const own = useWrite(
        (asked: SetSayPost) =>
          ReviewApi.use((api) => api.say(props.folder.ref, props.set.id, asked)),
        status,
        { index: meta.asks },
        (asked) => ({
          doing: 'saying…',
          // What the catalogue says the say gave or took, never what was asked.
          done: (answer) => setSaidText(asked, answer, versionText(asked.variant)),
          // An approve of a scene's render offers its Undo, bound to what it gave.
          undo: (answer) => setApproveUndo(film(), asked, props.set.id, answer),
        }),
      );
      return {
        waiting: own.waiting,
        say: (version, say) => {
          // A scene's approve names its own run, so its Undo takes back just that approval.
          const run = Option.filter(
            Option.all({ film: film(), scene: scene() }),
            () => say._tag === 'Approve',
          ).pipe(Option.map(() => Effect.runSync(uniqueId(OpId))));
          return own
            .write({
              variant: version,
              say,
              ...Option.match(run, { onNone: () => ({}), onSome: (op) => ({ op }) }),
            })
            .then((landed) =>
              Option.match(landed, {
                onNone: () => false,
                onSome: (l) => {
                  // The index holds the folder; what the say gave or took is the receipt's.
                  l.show(
                    'index',
                    (said) => Option.some(Struct.omit(said, ['gave', 'took'])),
                    actions.answered,
                  );
                  // A Refresh asked after the say may not hold it, nor the say what that
                  // Refresh found: the index is read again, and every project with it. Else a
                  // say on a film's folder may change its project (an approve of a scene's
                  // render): its owner reads it again.
                  if (l.succeeded && l.overtaken('index')) actions.refresh();
                  else if (l.succeeded) Option.map(film(), (of) => meta.project(of).changed());
                  return l.succeeded;
                },
              }),
            );
        },
      };
    },
  };
  // An approve's Undo (`undoApprove`): a withdraw of the version that run approved, given the run.
  const undoing = value.useSay();
  registerWhile(meta.hub, () =>
    Option.toArray(film()).map((of) =>
      undoApprove(of, {
        waiting: undoing.waiting,
        // One withdraw, of the version the receipt names, given its run: nothing is read
        // of the page's state, so a reload or a stale render changes nothing.
        withdraw: (_, say, approved) =>
          Option.match(
            Option.filter(approved, (a) => a.point === props.set.id),
            {
              onNone: () =>
                Effect.succeed(
                  refused(
                    Option.match(approved, {
                      onNone: () =>
                        'that approve was kept before it named its version: approve again to undo it',
                      onSome: () => 'that approve was of another set',
                    }),
                  ),
                ),
              onSome: (a) =>
                Effect.as(
                  Effect.promise(() => undoing.say(a.version, say)),
                  quiet,
                ),
            },
          ),
      }),
    ),
  );
  return <SetSaysContext value={value}>{props.children}</SetSaysContext>;
};

/**
 * A version's inspector: its Info (its approval and why it is stale, its
 * lines, its file, its notes), its approve and unapprove, what was said of
 * it and the comment box. Its say goes to the folder's catalogue
 * where the set belongs to a film address; a montage keeps no say.
 */
const VersionInspector = (props: { readonly version: SeenVariant }) => {
  const { folder, set } = useSet();
  const says = useContext(SetSaysContext);
  const now = useReview().meta.now();
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const selection = untrack(() => versionOf(folder(), set(), props.version.id));
  const title = () => `${letterOf(set(), props.version.id)} · ${props.version.label}`;
  const sayable = () => Option.isSome(set().address);
  // The set's says as a card's `Sayer` (a version is a variant, said by its id).
  const sayer: Sayer = {
    use: () => {
      const own = says.useSay();
      return { waiting: own.waiting, say: (v, say) => own.say(v.id, say) };
    },
  };
  const saying = sayer.use();
  useThing({
    selection,
    title,
    commentable: sayable,
    verbs: () => approvalVerbs(props.version, saying, sayable()),
  });
  return (
    <Inspector of={selection} kind="version" title={title()}>
      {(box) => (
        <>
          <div class="rv-verdict">
            {approvalText(props.version.approval)}
            <StaleTag variant={props.version} />
            <For each={props.version.lines}>{(line) => <div class="rv-hint">{line}</div>}</For>
          </div>
          <p class="rv-hint">
            {props.version.video.ref} · {sizeText(props.version.video.size)} ·{' '}
            {agoText(props.version.video.mtime, now)}
          </p>
          <Show when={Option.getOrUndefined(props.version.notes)} keyed>
            {(notes: ReviewFile) => <Markdown file={notes} />}
          </Show>
          <Show when={sayable()}>
            <div class="rv-row">
              <Approval variant={props.version} sayer={sayer} />
            </div>
          </Show>
          <Comments comments={props.version.comments} />
          <Show when={sayable()}>
            <CommentBox variant={props.version} sayer={sayer} box={box} />
          </Show>
        </>
      )}
    </Inspector>
  );
};

/** A version's name, a tap opening its inspector, and the dot counting what was said of it. */
const VersionName = (props: { readonly version: SeenVariant }) => {
  const { folder, set } = useSet();
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const selection = untrack(() => versionOf(folder(), set(), props.version.id));
  return (
    <InspectName of={selection} comments={props.version.comments.length}>
      <span class="rv-name">{props.version.label}</span>
    </InspectName>
  );
};

/**
 * A version's state on its caption, when it is judged stale (`judged`): the
 * short badge; why, in its inspector's Info (`StaleTag`).
 */
const StaleBadge = (props: { readonly variant: SeenVariant }) => (
  <Show when={Option.getOrUndefined(staleText(props.variant))}>
    {(words) => (
      <span class="sh-badge" data-state="stale" title={words()}>
        Out of date
      </span>
    )}
  </Show>
);

/** Why a variant is stale, when it is judged so (`judged`); nothing otherwise (`staleText`). */
const StaleTag = (props: { readonly variant: SeenVariant }) => (
  <Show when={Option.getOrUndefined(staleText(props.variant))}>
    {(words) => (
      <span class="rv-tag" data-state="stale">
        {words()}
      </span>
    )}
  </Show>
);

/**
 * A variant's video on the set's clock (its proxy's placeholder until there
 * is one). Each source is a fresh element, so a failure stays that source's;
 * the clock holds only a video on the page, and lets go when the placeholder
 * returns.
 */
const VariantVideo = (props: { readonly variant: SeenVariant; readonly class?: string }) => {
  const { state } = useReview();
  const { driver } = useSet();
  // A card is kept by its version (`EachVersion`): its place on the clock is that version's for as long as it lives.
  const id = untrack(() => props.variant.id);
  const source = createMemo(() => videoSource(props.variant.video, state.quality()));
  return (
    <Show
      when={Option.getOrUndefined(source())}
      keyed
      fallback={<ProxyPending video={props.variant.video} />}
    >
      {(src: string) => (
        <video
          class={props.class}
          data-id={props.variant.id}
          preload="auto"
          playsinline
          muted
          src={src}
          ref={useClockMedia(driver, id)}
        />
      )}
    </Show>
  );
};

/**
 * A variant's caption: its letter, its name, Out of date when it is, and the
 * speaker that makes it the one heard; its lines and why it is stale are its
 * inspector's Info.
 */
const VariantCap = (props: { readonly variant: SeenVariant }) => {
  const { set, sync, send } = useSet();
  const audible = () => sync().audible === props.variant.id;
  return (
    <div class="rv-cap">
      <span class="rv-letter">{letterOf(set(), props.variant.id)}</span>
      <VersionName version={props.variant} />
      <StaleBadge variant={props.variant} />
      <HearToggle
        on={audible()}
        title="Hear this one"
        hear={() => send.sync(SyncEvent.HeardChosen({ id: props.variant.id }))}
      />
    </div>
  );
};

/**
 * A version's card, in whichever view of the set shows it: its context
 * menu's, lit while it is the one heard (`audible`, where the view plays),
 * and marked while its inspector is open, so no view leaves the inspected
 * version unmarked.
 */
const VersionCard = (
  props: ParentProps<{ readonly version: string; readonly audible?: boolean }>,
) => {
  const { folder, set, sync } = useSet();
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const of = untrack(() => versionOf(folder(), set(), props.version));
  const inspected = useInspected(of);
  return (
    <Target
      of={of}
      class={[
        'rv-card',
        { 'rv-audible': props.audible === true && sync().audible === props.version },
      ]}
      data-id={props.version}
      data-selected={pressed(inspected())}
    >
      {props.children}
    </Target>
  );
};

/** A variant's video on the set's clock, and its caption. */
const VariantCard = (props: { readonly variant: SeenVariant }) => (
  <VersionCard version={props.variant.id} audible>
    <VariantVideo variant={props.variant} />
    <VariantCap variant={props.variant} />
  </VersionCard>
);

const gridClass = (count: number) => {
  if (count <= 2) return 'rv-grid rv-two';
  return 'rv-grid rv-wide';
};

/**
 * The set's versions, each drawn by `children` and kept by its id: a
 * refreshed index moves a version's data under its card (its video, its
 * caption), a version gone takes its card with it.
 */
const EachVersion = (props: {
  readonly of: ReadonlyArray<SeenVariant>;
  readonly children: (variant: Accessor<SeenVariant>) => JSX.Element;
}) => (
  <For each={props.of} keyed={(v) => v.id}>
    {(variant) => props.children(variant)}
  </For>
);

const AllView = () => {
  const { set } = useSet();
  return (
    <div class={gridClass(set().variants.length)}>
      <EachVersion of={set().variants}>
        {(variant) => <VariantCard variant={variant()} />}
      </EachVersion>
    </div>
  );
};

/** The first variant and the one it is against, as the pair, its wipe and its difference show them. */
const pairOf = (set: SeenPoint, other: string) => ({
  first: Option.fromUndefinedOr(set.variants[0]),
  other: Option.fromUndefinedOr(set.variants.find((v) => v.id === other)),
});

/** The first variant's name, and a chip for each other it can be against. */
const OtherPick = (props: { readonly other: string }) => {
  const { set, send } = useSet();
  return (
    <ToggleGroup
      class="rv-row rv-pick"
      aria-label="Against"
      value={[props.other]}
      onValueChange={(chosen) => {
        Option.map(Arr.head(chosen), (id) => send.view(ViewEvent.OtherChosen({ id })));
      }}
    >
      <span class="rv-hint">
        {Option.getOrElse(
          Option.map(Option.fromUndefinedOr(set().variants[0]), (v) => v.label),
          () => '',
        )}{' '}
        against:
      </span>
      <EachVersion of={set().variants.slice(1)}>
        {(variant) => (
          <Toggle class="sh-btn" value={variant().id} data-other={variant().id}>
            {variant().label}
          </Toggle>
        )}
      </EachVersion>
    </ToggleGroup>
  );
};

/** The pair's versions there are, the first then the other. */
const bothOf = (pair: ReturnType<typeof pairOf>): ReadonlyArray<SeenVariant> =>
  [pair.first, pair.other].flatMap(Option.toArray);

const PairView = (props: { readonly other: string }) => {
  const { set } = useSet();
  const pair = () => pairOf(set(), props.other);
  return (
    <>
      <OtherPick other={props.other} />
      <div class="rv-grid rv-two">
        <EachVersion of={bothOf(pair())}>
          {(variant) => <VariantCard variant={variant()} />}
        </EachVersion>
      </div>
    </>
  );
};

/** Where a wipe opens: the frame halved. */
const WIPE_AT = 0.5;

/** The wipe's player as `data-engine` names it: `asking` until it is chosen (`media-choice.ts`). */
const engineName = (chosen: Option.Option<Compare>) =>
  Option.match(chosen, { onNone: () => 'asking', onSome: (c) => c.engine.engine });

/** Why the wipe plays on `<video>`, when it does. */
const engineWhy = (chosen: Option.Option<Compare>) =>
  Option.flatMap(chosen, ({ engine }) => {
    if (engine.engine === 'video') return Option.some(`Plays on <video>: ${engine.why}`);
    return Option.none();
  });

/** The wipe's panes: the player chosen for the pair's masters, and the pair's ids. */
interface Panes {
  readonly chosen: Compare;
  readonly first: string;
  readonly other: string;
}

/** The same panes: the same player for the same pair. */
const samePanes = Option.makeEquivalence<Panes>(
  (a, b) => a.chosen === b.chosen && a.first === b.first && a.other === b.other,
);

/**
 * The pair as the compare's WebCodecs panes (`Media.compare`): each master
 * painted on a canvas, both on one clock, held by the set's clock in place
 * of the videos; let go when the wipe closes.
 */
const WipePanes = (props: Panes & { readonly at: () => string }) => {
  const { driver } = useSet();
  const canvases: Array<HTMLCanvasElement> = [];
  const ids = [props.first, props.other];
  let made = Option.none<ComparePanes>();
  const releases: Array<() => void> = [];
  // Once both canvases are in the page; let go with the wipe (a cleanup inside `onSettled` is refused).
  onSettled(() => {
    const compare = props.chosen.panes(canvases);
    made = Option.some(compare);
    compare.panes.forEach((pane, i) =>
      Option.map(Option.fromUndefinedOr(ids[i]), (id) => releases.push(driver.attach(id, pane))),
    );
  });
  onCleanup(() =>
    Option.map(made, ({ dispose }) => {
      for (const release of releases) release();
      dispose();
    }),
  );
  return (
    <>
      <canvas class="rv-wipe-first" data-id={props.first} ref={(el) => canvases.push(el)} />
      <div class="rv-wipe-other" style={{ 'clip-path': `inset(0 0 0 ${props.at()})` }}>
        <canvas data-id={props.other} ref={(el) => canvases.push(el)} />
      </div>
    </>
  );
};

/**
 * The pair wiped: both videos on the clock, stacked full width, the
 * first left of a divider and the other right of it; the divider dragged by
 * its grip, clamped to the frame. The divider is this page's, not the
 * link's: a different split shows the same comparison. Each one's caption
 * (its speaker, its inspector) sits under the frame.
 */
const WipeView = (props: { readonly other: string }) => {
  const { meta } = useReview();
  const { set } = useSet();
  const pair = () => pairOf(set(), props.other);
  const [split, setSplit] = createSignal(WIPE_AT, { ownedWrite: true });
  let frame = Option.none<HTMLElement>();
  /** The divider follows one press at a time: a second finger's moves nothing. */
  const divider = new Surface('the divider');
  const grab = (e: PointerEvent) => {
    e.preventDefault();
    // The divider stays where the drag ends, lifted or ended by the browser.
    Effect.runForkWith(meta.host)(
      Pointer.use((pointer) =>
        pointer.press(e, divider, () =>
          Option.map(frame, (el) => {
            const r = el.getBoundingClientRect();
            return {
              move: (ev: PointerEvent) =>
                setSplit(Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)))),
              end: () => {},
            };
          }),
        ),
      ),
    );
  };
  const at = () => `${split() * 100}%`;
  // The grip by the keyboard, while it has focus: ←/→ (⇧ ten, ⌥ a thousandth), Home and End.
  onCleanup(meta.hub.commands.register(...wipeCommands('review', () => untrack(split), setSplit)));
  const keys = hubKeys(meta.hub);
  // The player is chosen from the masters (the scrub preview reads their key
  // frames); the videos play while it is asked, and stay if it is `<video>`.
  const masters = createMemo(() =>
    [pair().first, pair().other]
      .flatMap(Option.toArray)
      .flatMap((v) => Option.toArray(videoSource(v.video, 'full'))),
  );
  const [chosen, setChosen] = createSignal(Option.none<Compare>(), { ownedWrite: true });
  createEffect(
    () => masters().join('\n'),
    () => {
      setChosen(Option.none());
      const urls = untrack(masters);
      if (urls.length < 2) return;
      // The renders opened are the wipe's until it goes or its masters change: their
      // inputs are this scope's from the moment each is made, so closing it lets them go
      // however far the opening got (the panes' own letting go of them is then a no-op).
      const owner = Scope.makeUnsafe();
      const asking = Effect.runForkWith(meta.host)(
        Effect.map(
          Scope.provide(
            Media.use((media) => media.compare(urls)),
            owner,
          ),
          (c) => setChosen(Option.some(c)),
        ),
      );
      return () => {
        asking.interruptUnsafe();
        Effect.runFork(Scope.close(owner, Exit.void));
      };
    },
  );
  // The panes are the player chosen for the pair's masters: a refreshed index
  // that leaves the masters as they were keeps them (a new master asks again).
  const panes = createMemo(
    (): Option.Option<Panes> =>
      Option.all({
        chosen: Option.filter(chosen(), (c) => c.engine.engine === 'webcodecs'),
        first: Option.map(pair().first, (v) => v.id),
        other: Option.map(pair().other, (v) => v.id),
      }),
    { equals: samePanes },
  );
  return (
    <>
      <OtherPick other={props.other} />
      <div
        class="rv-wipe"
        data-split={split().toFixed(3)}
        data-engine={engineName(chosen())}
        title={Option.getOrUndefined(engineWhy(chosen()))}
        ref={(el: HTMLElement) => {
          frame = Option.some(el);
        }}
      >
        <Show
          when={Option.getOrUndefined(panes())}
          keyed
          fallback={
            <>
              <EachVersion of={Option.toArray(pair().first)}>
                {(variant) => <VariantVideo variant={variant()} class="rv-wipe-first" />}
              </EachVersion>
              <EachVersion of={Option.toArray(pair().other)}>
                {(variant) => (
                  <div class="rv-wipe-other" style={{ 'clip-path': `inset(0 0 0 ${at()})` }}>
                    <VariantVideo variant={variant()} />
                  </div>
                )}
              </EachVersion>
            </>
          }
        >
          {(p: Panes) => <WipePanes chosen={p.chosen} first={p.first} other={p.other} at={at} />}
        </Show>
        <div class="rv-wipe-line" style={{ left: at() }}>
          {/* A slider: dragged, or ←/→ a hundredth of the frame (⇧ ten), Home and End to its edges. */}
          <button
            type="button"
            role="slider"
            class="rv-wipe-grip"
            aria-label="Wipe"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split() * 100)}
            aria-valuetext={`${Math.round(split() * 100)}% of the frame shows ${pair().first.pipe(
              Option.map((v) => v.id),
              Option.getOrElse(() => 'the first'),
            )}`}
            title={wipeTitle('review', keys.first)}
            ref={(el: HTMLButtonElement) => el.addEventListener('pointerdown', grab)}
          />
        </div>
      </div>
      <div class="rv-grid rv-two rv-wipe-caps">
        <EachVersion of={bothOf(pair())}>
          {(variant) => (
            <VersionCard version={variant().id} audible>
              <VariantCap variant={variant()} />
            </VersionCard>
          )}
        </EachVersion>
      </div>
    </>
  );
};

/** The moments' chips, a toggle group, the one shown pressed: the page's ←/→ step the moment, and in the group they move its focus. */
const MomentPick = (props: { readonly moments: ReadonlyArray<number>; readonly index: number }) => {
  const { send } = useSet();
  return (
    <ToggleGroup
      class="rv-row rv-pick"
      aria-label="Moment"
      value={[String(props.index)]}
      onValueChange={(chosen) => {
        Option.map(Arr.head(chosen), (index) =>
          send.view(ViewEvent.MomentChosen({ index: Number(index) })),
        );
      }}
    >
      <For each={props.moments.map((t, i) => ({ t, i }))}>
        {(m) => (
          <Toggle class="sh-btn" value={String(m.i)} data-moment={String(m.i)}>
            {timecode(m.t)}
          </Toggle>
        )}
      </For>
    </ToggleGroup>
  );
};

/** A still's caption: the variant's letter, its name and Out of date when it is (no speaker: nothing plays). */
const StillCap = (props: { readonly variant: SeenVariant }) => {
  const { set } = useSet();
  return (
    <div class="rv-cap">
      <span class="rv-letter">{letterOf(set(), props.variant.id)}</span>
      <VersionName version={props.variant} />
      <StaleBadge variant={props.variant} />
    </div>
  );
};

/** The set's moments once known (the first video measured when the set names none), and the one at `index`. */
const WithMoments = (props: {
  readonly index: number;
  readonly children: (moments: ReadonlyArray<number>, at: Accessor<number>) => JSX.Element;
}) => {
  const { set, moments } = useSet();
  return (
    <Show
      when={Option.getOrUndefined(moments())}
      keyed
      fallback={<p class="empty">Measuring the first video…</p>}
    >
      {(ms: ReadonlyArray<number>) =>
        props.children(ms, () =>
          Option.getOrElse(
            Option.fromUndefinedOr(ms[Math.min(props.index, ms.length - 1)]),
            () => set().start,
          ),
        )
      }
    </Show>
  );
};

const MomentsView = (props: { readonly index: number }) => {
  const { set } = useSet();
  return (
    <WithMoments index={props.index}>
      {(ms, at) => (
        <>
          <MomentPick moments={ms} index={props.index} />
          <div class={gridClass(set().variants.length)}>
            <EachVersion of={set().variants}>
              {(variant) => (
                <VersionCard version={variant().id}>
                  <Zoom
                    still={reviewFrameUrl(variant().video.ref, Option.some(at()), MOMENT_W)}
                    name={variant().id}
                    alt={`${variant().label} at ${timecode(at())}`}
                    shown={{
                      src: reviewFrameUrl(variant().video.ref, Option.some(at()), LIGHTBOX_W),
                      caption: `${variant().label} at ${timecode(at())}`,
                    }}
                  />
                  <StillCap variant={variant()} />
                </VersionCard>
              )}
            </EachVersion>
          </div>
        </>
      )}
    </WithMoments>
  );
};

/**
 * The pair's difference at a moment: the first variant's frame, and
 * the other's cut at the same instant laid over it in the difference blend,
 * so what is the same is black and what differs is lit. Stills, never the
 * playing videos: the server cuts both at the one `t`, so the blend is exact.
 */
const DiffView = (props: { readonly other: string; readonly index: number }) => {
  const { set } = useSet();
  const pair = () => pairOf(set(), props.other);
  const frameOf = (variant: SeenVariant, t: number) =>
    reviewFrameUrl(variant.video.ref, Option.some(t), MOMENT_W);
  return (
    <WithMoments index={props.index}>
      {(ms, at) => (
        <>
          <OtherPick other={props.other} />
          <MomentPick moments={ms} index={props.index} />
          <div class="rv-diff">
            <EachVersion of={Option.toArray(pair().first)}>
              {(variant) => (
                <img
                  class="rv-diff-first"
                  data-id={variant().id}
                  src={frameOf(variant(), at())}
                  alt={`${variant().label} at ${timecode(at())}`}
                />
              )}
            </EachVersion>
            <EachVersion of={Option.toArray(pair().other)}>
              {(variant) => (
                <img
                  class="rv-diff-other"
                  data-id={variant().id}
                  src={frameOf(variant(), at())}
                  alt={`the difference from ${variant().label}`}
                />
              )}
            </EachVersion>
          </div>
          <p class="rv-hint">Black where the two are the same; lit where they differ.</p>
          <div class="rv-grid rv-two rv-wipe-caps">
            <EachVersion of={bothOf(pair())}>
              {(variant) => (
                <VersionCard version={variant().id}>
                  <StillCap variant={variant()} />
                </VersionCard>
              )}
            </EachVersion>
          </div>
        </>
      )}
    </WithMoments>
  );
};

/**
 * The set's page: the transport over the view it shows, and its versions as
 * the page's things. The page owns each version's thing and sheet, not the
 * view's cards: a pair or a wipe shows two of three versions, and a link
 * may open the third's sheet.
 */
const SetBody = () => {
  const { folder, set, view, sync, send } = useSet();
  // The open sheet is the URL's (`?inspect=`, a version of the set): a tap on a version's
  // name names it (Back closes it); Close, Escape and a swipe name none; a link, Back and
  // Forward open what they name.
  useInspectorPlace({
    place: Places.set,
    named: (v) =>
      Option.map(
        Option.liftPredicate(v.query.inspect, (id) => set().variants.some((x) => x.id === id)),
        (id) => versionOf(folder(), set(), id),
      ),
    naming: (v, s) =>
      Option.map(
        Option.filter(
          Option.liftPredicate(s, Selection.guards.Version),
          (x) => x.folder === folder().ref && x.point === set().id,
        ),
        (x) => ({ ...v, query: { ...v.query, inspect: x.version } }),
      ),
    cleared: (v) => ({ ...v, query: { ...v.query, inspect: '' } }),
  });
  return (
    <>
      <Show when={playsIn(viewNameOf(view()))}>
        <section class="sh-dock">
          <Transport sync={sync} send={send.sync} />
        </section>
      </Show>
      {Match.value(view()).pipe(
        Match.tagsExhaustive({
          All: () => <AllView />,
          Pair: (s) => <PairView other={s.other} />,
          Wipe: (s) => <WipeView other={s.other} />,
          Moments: (s) => <MomentsView index={s.index} />,
          Diff: (s) => <DiffView other={s.other} index={s.index} />,
        }),
      )}
      <EachVersion of={set().variants}>
        {(variant) => <VersionInspector version={variant()} />}
      </EachVersion>
    </>
  );
};

/**
 * The film's project, which an approve's write judges a set's versions by
 * (`Review.say`), when the folder is the film's own: the project names its
 * own folder (`ProjectView.folder`, the server's ref of the checkout's out
 * folder), and the write judges by the project only there. That alone
 * decides, never the folder's name: the film's own folder under a root of
 * another label is judged by the project, and a copy of it under another
 * root by the record alone. The project as its owner shows it
 * (`FilmProject.shown`): in the page alone, never by the server, and only
 * when the folder's title is one of the app's films (a montage's title is
 * none), which the page then holds (`FilmProject.hold`), so a say reads it
 * again now. The record's judgement stands while it is read (and in the
 * server's render), and the write decides.
 */
const useSourcesNow = (folder: ReviewFolder): SourcesNow => {
  const { meta } = useReview();
  return Option.match(folder.title, {
    onNone: () => ({ project: () => Option.none(), by: (): JudgedBy => 'record' }),
    onSome: (title) => {
      const owner = meta.project(title);
      const isFilm = (films: AsyncResult.AsyncResult<ReviewFilms, LabFailure>) =>
        Option.exists(AsyncResult.value(films), (f) => f.films.includes(title));
      // Held while the page is the film's (the films say the title is one of theirs).
      const films = useAtomValue(() => meta.films);
      createEffect(
        () => isFilm(films()),
        (yes) => {
          if (yes) return owner.hold();
        },
      );
      // The project, once the films say the title is one of theirs; none for any other title.
      const readAtom = Atom.make(
        (get): AsyncResult.AsyncResult<Option.Option<ProjectView>, LabFailure> =>
          Match.value(get(meta.films)).pipe(
            Match.tag('Initial', () =>
              AsyncResult.initial<Option.Option<ProjectView>, LabFailure>(),
            ),
            Match.orElse((films) =>
              Match.value(isFilm(films)).pipe(
                Match.when(true, () => AsyncResult.map(get(owner.shown), Option.some)),
                Match.orElse(() => AsyncResult.success(Option.none<ProjectView>())),
              ),
            ),
          ),
      ).pipe(
        Atom.withServerValue(() => AsyncResult.initial<Option.Option<ProjectView>, LabFailure>()),
      );
      const read = useAtomValue(() => readAtom);
      const own = () =>
        Option.filter(Option.flatten(AsyncResult.value(read())), (view) =>
          Option.contains(view.folder, folder.ref),
        );
      return {
        project: () => Option.map(own(), (view) => view.project),
        by: () =>
          Match.value(read()).pipe(
            Match.tag('Initial', (): JudgedBy => 'reading'),
            Match.orElse((): JudgedBy =>
              Option.match(own(), { onNone: () => 'record', onSome: () => 'project' }),
            ),
          ),
      };
    },
  });
};

/**
 * What judges a set's versions: its record while the film's project is read
 * (`reading`; and in the server's render), then the project (`project`, the
 * folder is its own) or the record (`record`, any other folder, a project
 * that could not be read, a folder of no film).
 */
type JudgedBy = 'reading' | 'record' | 'project';

/** The film's sources now as a Set page judges by them (`useSourcesNow`), and what judges. */
interface SourcesNow {
  /** The film's project, where it judges the folder. */
  readonly project: Accessor<Option.Option<Project>>;
  /** Shown as the Set's `data-sources`. */
  readonly by: Accessor<JudgedBy>;
}

/**
 * `set` with each version judged as the write judges its approve: against
 * the film's sources now, where `project` says them for the set's address
 * (`projectNow`, `versionState`); as its record says, elsewhere.
 */
const judged = (set: SeenPoint, project: Option.Option<Project>): SeenPoint =>
  Option.match(
    Option.flatMap(Option.all({ project, address: set.address }), (at) =>
      projectNow(at.project, at.address),
    ),
    {
      onNone: () => set,
      onSome: (now) => ({
        ...set,
        variants: set.variants.map((v) => ({ ...v, ...versionState(v.key, now) })),
      }),
    },
  );

/**
 * A set's page while the index holds it. A page is one set's (a new place is
 * a new page), so neither Show is keyed: a refreshed index moves the folder
 * and the set under the page, and its player plays on (`SetProvider`).
 */
export const SetPage = (props: { readonly folder: string; readonly point: string }) => (
  <WithIndex>
    {(index) => (
      <Show
        when={Option.getOrUndefined(folderIn(index(), props.folder))}
        fallback={<Missing what="folder" />}
      >
        {(folder) => (
          <Show
            when={folder().sets.find((s) => s.id === props.point)}
            fallback={<Missing what="version stack" />}
          >
            {(point) => {
              // The folder is the page's: whether its film's sources judge it is fixed with it.
              const sourcesNow = untrack(() => useSourcesNow(folder()));
              const set = createMemo(() => judged(seenPoint(point()), sourcesNow.project()));
              return (
                <SetProvider folder={folder()} set={set()}>
                  <Saying folder={folder()} set={set()}>
                    <div class="rv-tools rv-set-tools" data-sources={sourcesNow.by()}>
                      <ViewTabs />
                    </div>
                    <SetBody />
                  </Saying>
                </SetProvider>
              );
            }}
          </Show>
        )}
      </Show>
    )}
  </WithIndex>
);
