// The review's pages. Home lists every folder with something to review,
// version stacks first. A folder shows its version stacks
// (Versions), and whatever is in no stack: its videos (with captions when a
// `.vtt` lies beside them), its sheets and stills (a lightbox), its docs
// (markdown inline). A stack plays every version on one clock: all of them,
// the first side by side with one other or wiped against it (a stack of two
// or more), every version's frame at a few moments, the first and one
// other's difference at a moment, or the notes. A version's name opens its
// inspector: its Info, its approve and unapprove, what was said of it and
// the comment box, said over the set's route (UI-7).

import { useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Effect, Exit, Match, Option, Scope } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
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
import { type Compare, type ComparePanes, Media, playableOf } from '../../browser/media.ts';
import { Pointer, Surface } from '../../browser/pointer.ts';
import type { ReviewFile, ReviewFolder, ReviewIndex, ReviewVideo } from '../../core/review.ts';
import { timecode } from '../../core/time.ts';
import {
  Places,
  ProjectView,
  type Say,
  type SetSayPost,
  pageHref,
  reviewFileUrl,
  reviewFrameUrl,
  withdrawSay,
} from '../../core/api.ts';
import { served } from '../api.ts';
import { StateBand } from '../scenes/card.tsx';
import { filmCounts, marksOf } from '../scenes/marks.ts';
import { ReviewApi } from './api.ts';
import { OptionsApi } from './options/api.ts';
import { newestAsked } from './asked.ts';
import { InspectName, Inspector, useInspected, useInspectorPlace, useThing } from './inspector.tsx';
import { ApproveButton, Comments, SayBox } from './options/choice.tsx';
import type { ThingVerb } from './things.ts';
import { Go, SetProvider, type Shown, useReview, useSet } from './context.tsx';
import {
  agoText,
  approvalText,
  captionsFor,
  countsText,
  failedText,
  folderTitle,
  isMarkdown,
  POSTER_W,
  pressed,
  recordedStaleText,
  sayText,
  sizeText,
  versionsText,
  videoSource,
} from './format.ts';
import {
  LAYOUTS,
  type Layout,
  Rate,
  type SetMode,
  SyncEvent,
  type SyncState,
  ViewEvent,
  clockParts,
  modeOf,
  modeView,
  modesOf,
  playsIn,
  reachOf,
  runningOf,
  viewNameOf,
} from './machine.ts';
import { Loaded, useWrite, writeStatus } from './loaded.tsx';
import { escapeHtml, markdownHtml } from './markdown.ts';
import { ReviewPlace as Place } from './place.ts';
import { Selection } from '../../command/selection.ts';
import { Target, type TargetElementProps } from '../command/context-menu.tsx';
import { CommandChip } from '../command/command-chip.tsx';
import { useShellTime } from '../page-shell.tsx';
import { hubKeys } from '../command/changes.ts';
import { wipeCommands, wipeTitle } from '../wipe-keys.ts';
import { rateCommands, rateId, rateText, rateTitle } from '../../player/transport.ts';

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

/** A strip of frames: one per video named, 10% in. */
const Strip = (props: { readonly refs: ReadonlyArray<string> }) => (
  <div class="rv-strip">
    <For each={props.refs.slice(0, STRIP)}>
      {(ref) => <img loading="lazy" src={reviewFrameUrl(ref, Option.none(), THUMB_W)} alt="" />}
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

/** A heading over its things, shown while it has `count` of them; the count itself is not said at rest (UR-7). */
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
 * A film's state on its card, as its Project's head says it (SU-8): the
 * state band and `n/N approved · n out of date`, from the film's project,
 * read for the card (by the server, sent with the page). Its band marks the
 * renders and approvals; the check's findings are Project's. Nothing while
 * the project is read or when the film has none.
 */
const FilmState = (props: { readonly film: string }) => {
  const { meta } = useReview();
  const readAtom = untrack(() =>
    meta.runtime
      .atom(OptionsApi.use((api) => api.project(props.film)))
      .pipe(served(`review.project:${props.film}`, ProjectView)),
  );
  const read = useAtomValue(() => readAtom);
  return (
    <Show when={Option.getOrUndefined(AsyncResult.value(read()))}>
      {(view: Accessor<ProjectView>) => (
        <>
          <StateBand
            scenes={view().project.scenes}
            marks={(scene) => marksOf(Option.some(view()), [])(scene)}
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
  /** The folder a film's renders sit in: the one named for it. */
  const folderOf = (film: string) =>
    Option.fromUndefinedOr(props.folders.find((f) => f.ref === film || f.ref.endsWith(`/${film}`)));
  return (
    <Section title="Films" count={films().length}>
      <div class="rv-grid rv-films">
        <For each={films()}>
          {(film) => (
            <Target
              of={Selection.cases.Film.make({ film })}
              class="rv-card rv-film-card"
              data-film={film}
              render={(p: TargetElementProps) => (
                <a {...p} href={pageHref.scenes(film)}>
                  <Show
                    when={Option.getOrUndefined(
                      Option.filter(
                        Option.map(folderOf(film), posterRefs),
                        (refs) => refs.length > 0,
                      ),
                    )}
                  >
                    {(refs) => <Strip refs={refs()} />}
                  </Show>
                  <div class="rv-body">
                    <b>{film}</b>
                    <FilmState film={film} />
                  </div>
                </a>
              )}
            />
          )}
        </For>
      </div>
    </Section>
  );
};

/** Every folder with something to review: version stacks first, then the rest (⌘K finds one by name). */
export const Home = () => (
  <WithIndex>
    {(index) => {
      const sets = createMemo(() => index().folders.filter((f) => f.sets.length > 0));
      const rest = createMemo(() => index().folders.filter((f) => f.sets.length === 0));
      return (
        <>
          <Films folders={index().folders} />
          <Section title="Versions" count={sets().length}>
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
        <Markdown file={props.doc.ref} />
      </Show>
    </details>
  );
};

/** A markdown file's text, shown as HTML (every character of it escaped first). */
const Markdown = (props: { readonly file: string }) => {
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

/**
 * A still that opens in the lightbox with its caption (`shown`): a button, so
 * a tap, a click, Enter and Space all open it, and its name says what opens.
 */
const Zoom = (props: { readonly still: string; readonly alt: string; readonly shown: Shown }) => {
  const { actions } = useReview();
  return (
    <button
      type="button"
      class="rv-zoom"
      aria-label={`Open ${props.shown.caption}`}
      onClick={() => actions.show(Option.some(props.shown))}
    >
      <img class="rv-media" loading="lazy" src={props.still} alt={props.alt} />
    </button>
  );
};

/**
 * A video in no set: its poster, its captions and its name. Its file (Open
 * the file, Copy link, Info: its size, age and proxy) is its long-press
 * menu's (UR-17).
 */
const LooseVideo = (props: {
  readonly video: ReviewVideo;
  readonly docs: ReadonlyArray<ReviewFile>;
}) => {
  const { state } = useReview();
  const captions = captionsFor(props.video, props.docs);
  const source = createMemo(() => videoSource(props.video, state.quality()));
  return (
    <Target of={Selection.cases.File.make({ ref: props.video.ref })} class="rv-card rv-tall">
      <Show when={Option.getOrUndefined(source())} fallback={<ProxyPending video={props.video} />}>
        {(src) => (
          <video
            controls
            preload="none"
            playsinline
            poster={reviewFrameUrl(props.video.ref, Option.none(), POSTER_W)}
            src={src()}
          >
            <Show when={Option.getOrUndefined(captions)} keyed>
              {(vtt: ReviewFile) => <track kind="captions" src={reviewFileUrl(vtt.ref)} default />}
            </Show>
          </video>
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
 * there is more than one (UR-15); their names are its long-press menu's
 * (Open version n, UR-12).
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
            <span class="rv-badge">{versionsText(props.set.variants.length)}</span>
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
  const markdown = props.folder.docs.filter(isMarkdown);
  const other = props.folder.docs.filter((d) => !isMarkdown(d) && !d.name.endsWith('.vtt'));
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
                {/* Its name and age are the lightbox's caption (UR-18). */}
                <Zoom
                  still={reviewFileUrl(image.ref)}
                  alt={image.name}
                  shown={{
                    src: reviewFileUrl(image.ref),
                    caption: `${image.name} · ${agoText(image.mtime, now)}`,
                  }}
                />
              </div>
            )}
          </For>
        </div>
      </Section>
      <Section title="Docs" count={markdown.length + other.length}>
        <For each={markdown}>{(doc) => <Doc doc={doc} />}</For>
        <Show when={other.length > 0}>
          <p class="rv-row">
            <For each={other}>
              {(doc) => (
                <a class="sh-btn" href={reviewFileUrl(doc.ref)} target="_blank" rel="noreferrer">
                  {doc.name}
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
      <Show
        when={Option.getOrUndefined(folderIn(index(), props.folder))}
        keyed
        fallback={<Missing what="folder" />}
      >
        {(folder: ReviewFolder) => <FolderBody folder={folder} />}
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
 * The set's modes as one segmented control (UR-21, UR2-5), and in Compare
 * its layouts as a second: the touch path of `v` and `⇧V` (`viewCommands`).
 */
const ViewTabs = () => {
  const { set, view, send } = useSet();
  const name = () => viewNameOf(view());
  return (
    <>
      <div class="sh-seg rv-views">
        <For each={modesOf(set.variants.length)}>
          {(mode) => (
            <button
              type="button"
              data-view={mode}
              aria-pressed={pressed(modeOf(name()) === mode)}
              onClick={() => send.view(ViewEvent.ViewChosen({ view: modeView(mode, name()) }))}
            >
              {MODE_TITLES[mode]}
            </button>
          )}
        </For>
      </div>
      <Show when={modeOf(name()) === 'compare'}>
        <div class="sh-seg rv-layouts">
          <For each={LAYOUTS}>
            {(layout) => (
              <button
                type="button"
                data-view={layout}
                aria-pressed={pressed(name() === layout)}
                onClick={() => send.view(ViewEvent.ViewChosen({ view: layout }))}
              >
                {LAYOUT_TITLES[layout]}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
};

/**
 * The synced player's controls, one row: play, the clock, a scrub over every
 * track, and the one rate chip (UR-25), whose rates are the page's commands
 * while the transport is shown (J, K, L; ⌘K). Its keys are in the `?` sheet.
 * A page docks it (`.sh-dock`: over the tab bar on a phone, held under the
 * header on a laptop, design language §4), Choices, a Set and Project alike.
 */
export const Transport = (props: {
  readonly sync: Accessor<SyncState>;
  readonly send: (event: SyncEvent) => void;
}) => {
  const { sync } = props;
  const { meta } = useReview();
  const send = { sync: props.send };
  const playing = () => runningOf(sync()) || sync()._tag === 'Buffering';
  const keys = hubKeys(meta.hub);
  // The header's timecode is this transport's clock.
  useShellTime(() => sync().t);
  onCleanup(
    meta.hub.commands.register(
      ...rateCommands({
        all: Rate.literals,
        now: () => sync().rate,
        choose: (rate) => send.sync(SyncEvent.RateChosen({ rate })),
      }),
    ),
  );
  return (
    <section class="rv-transport">
      <button
        type="button"
        class="sh-btn rv-big"
        data-primary=""
        data-act="play"
        title="Play / pause (space)"
        onClick={() => send.sync(SyncEvent.Toggled)}
      >
        {Match.value(playing()).pipe(
          Match.when(true, () => '❚❚'),
          Match.orElse(() => '▶'),
        )}
      </button>
      <span class="rv-time" data-state={sync()._tag}>
        {/* The time: a laptop's header shows it already (`useShellTime`), so its row leaves it out. */}
        <span class="rv-time-at">{clockParts(sync()).at}</span>
        {/* The end, and a wait: a phone's row leaves them out (the scrub shows the end). */}
        <span class="rv-time-rest">{clockParts(sync()).rest}</span>
      </span>
      <input
        type="range"
        aria-label="Scrub every video"
        min={sync().start}
        max={reachOf(sync())}
        step="0.05"
        value={sync().t}
        onInput={(e) => send.sync(SyncEvent.ScrubMoved({ t: Number(e.currentTarget.value) }))}
        onChange={() => send.sync(SyncEvent.ScrubReleased)}
      />
      <CommandChip
        hub={meta.hub}
        ids={Rate.literals.map(rateId)}
        act="rate"
        class="sh-btn"
        title={rateTitle(keys.titled)}
      >
        <span data-rate={String(sync().rate)}>{rateText(sync().rate)}</span>
      </CommandChip>
    </section>
  );
};

const letterOf = (set: SeenPoint, id: string) => set.variants.findIndex((v) => v.id === id) + 1;

/** What the set page's says hold: each version as the newest say left it, and a control's own say. */
interface SetSays {
  /** `version` as the newest say shown left it (its approval, its comments). */
  readonly now: (version: SeenVariant) => SeenVariant;
  /** A control's own say (`useWrite`): made once, as the control is made. */
  readonly useSay: () => {
    readonly waiting: Accessor<boolean>;
    readonly say: (version: string, say: Say) => Promise<boolean>;
  };
}

const SetSaysContext = createContext<SetSays>();

/**
 * The set's says (UI-7): approve, unapprove or comment on a version, over
 * `POST /api/review/sets/<folder>/<point>/say`. A say answers the folder as
 * it leaves it; the versions read the newest answer shown, so the page stays
 * in place (its player plays on) instead of reading the index again.
 */
const Saying = (props: ParentProps<{ readonly folder: ReviewFolder; readonly set: SeenPoint }>) => {
  const status = writeStatus<ReviewFolder>('set');
  const asks = newestAsked();
  /** Version `id` as a receipt names it: its letter, its label, and the set's title. */
  const versionText = (id: string) =>
    Option.getOrElse(
      Option.map(
        Option.fromUndefinedOr(props.set.variants.find((v) => v.id === id)),
        (v) => `${letterOf(props.set, id)} · ${v.label} · ${props.set.title}`,
      ),
      () => id,
    );
  const [said, setSaid] = createSignal(Option.none<SeenPoint>());
  const pointIn = (folder: ReviewFolder) =>
    Option.map(Option.fromUndefinedOr(folder.sets.find((s) => s.id === props.set.id)), seenPoint);
  const value: SetSays = {
    now: (version) =>
      Option.getOrElse(
        Option.flatMap(said(), (p) =>
          Option.fromUndefinedOr(p.variants.find((v) => v.id === version.id)),
        ),
        () => version,
      ),
    useSay: () => {
      const own = useWrite(
        (asked: SetSayPost) =>
          ReviewApi.use((api) => api.say(props.folder.ref, props.set.id, asked)),
        status,
        { set: asks },
        (asked) => ({
          doing: 'saying…',
          done: () => sayText(asked.say, versionText(asked.variant)),
        }),
      );
      return {
        waiting: own.waiting,
        say: (version, say) =>
          own.write({ variant: version, say }).then((landed) =>
            Option.match(landed, {
              onNone: () => false,
              onSome: (l) => {
                l.show('set', pointIn, (p) => setSaid(Option.some(p)));
                return l.succeeded;
              },
            }),
          ),
      };
    },
  };
  return <SetSaysContext value={value}>{props.children}</SetSaysContext>;
};

/**
 * A version's inspector: its Info (its approval and why it is stale, its
 * lines, its file, its notes), its approve and unapprove, what was said of
 * it and the comment box (UI-7). Its say goes to the folder's catalogue
 * where the set belongs to a film address; a montage keeps no say.
 */
const VersionInspector = (props: { readonly version: SeenVariant }) => {
  const { folder, set } = useSet();
  const says = useContext(SetSaysContext);
  const now = useReview().meta.now();
  const version = () => says.now(props.version);
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const selection = untrack(() => versionOf(folder, set, props.version.id));
  const title = () => `${letterOf(set, props.version.id)} · ${props.version.label}`;
  const sayable = Option.isSome(set.address);
  const saying = says.useSay();
  const approve: ThingVerb = {
    id: 'approve',
    label: 'Approve',
    run: () => saying.say(props.version.id, { _tag: 'Approve' }),
  };
  const unapprove: ThingVerb = {
    id: 'unapprove',
    label: 'Unapprove',
    run: () => saying.say(props.version.id, withdrawSay()),
  };
  const free = () => sayable && !saying.waiting();
  useThing({
    selection,
    title,
    commentable: () => sayable,
    verbs: () => [
      ...[approve].filter(
        () => free() && version().state === 'current' && version().approval !== 'approved',
      ),
      ...[unapprove].filter(() => free() && version().approval !== 'none'),
    ],
  });
  return (
    <Inspector of={selection} title={title()}>
      {(box) => (
        <>
          <div class="rv-verdict">
            {approvalText(version().approval)}
            <StaleTag variant={version()} />
            <For each={version().lines}>{(line) => <div class="rv-hint">{line}</div>}</For>
          </div>
          <p class="rv-hint">
            {version().video.ref} · {sizeText(version().video.size)} ·{' '}
            {agoText(version().video.mtime, now)}
          </p>
          <Show when={Option.getOrUndefined(version().notes)} keyed>
            {(notes: ReviewFile) => <Markdown file={notes.ref} />}
          </Show>
          <Show when={sayable}>
            <div class="rv-row">
              <ApproveButton
                approval={version().approval}
                disabled={version().state !== 'current' || saying.waiting()}
                approve={() => void saying.say(props.version.id, { _tag: 'Approve' })}
              />
              <Show when={version().approval !== 'none'}>
                <button
                  type="button"
                  class="sh-btn"
                  data-act="unapprove"
                  disabled={saying.waiting()}
                  onClick={() => void saying.say(props.version.id, withdrawSay())}
                >
                  Unapprove
                </button>
              </Show>
            </div>
          </Show>
          <Comments comments={version().comments} />
          <Show when={sayable}>
            <SayBox
              disabled={saying.waiting()}
              box={box}
              say={(text) => saying.say(props.version.id, { _tag: 'Comment', text })}
            />
          </Show>
        </>
      )}
    </Inspector>
  );
};

/** A version's name, a tap opening its inspector, and the dot counting what was said of it. */
const VersionName = (props: { readonly version: SeenVariant }) => {
  const { folder, set } = useSet();
  const says = useContext(SetSaysContext);
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const selection = untrack(() => versionOf(folder, set, props.version.id));
  return (
    <InspectName of={selection} comments={says.now(props.version).comments.length}>
      <span class="rv-name">{props.version.label}</span>
    </InspectName>
  );
};

/**
 * A version's state on its caption, when its record proves it stale: the
 * short badge (UR-29); why, in its inspector's Info (`StaleTag`).
 */
const StaleBadge = (props: { readonly variant: SeenVariant }) => (
  <Show when={Option.getOrUndefined(recordedStaleText(props.variant))}>
    {(words) => (
      <span class="rv-badge" data-approval="stale" title={words()}>
        Out of date
      </span>
    )}
  </Show>
);

/** Why a variant is stale, when its record proves it; nothing otherwise (`recordedStaleText`). */
const StaleTag = (props: { readonly variant: SeenVariant }) => (
  <Show when={Option.getOrUndefined(recordedStaleText(props.variant))}>
    {(words) => (
      <span class="rv-tag" data-state="stale">
        {words()}
      </span>
    )}
  </Show>
);

/** A variant's video on the set's clock (its proxy's placeholder until there is one). */
const VariantVideo = (props: { readonly variant: SeenVariant; readonly class?: string }) => {
  const { state } = useReview();
  const { driver } = useSet();
  const source = createMemo(() => videoSource(props.variant.video, state.quality()));
  onCleanup(() => driver.detach(props.variant.id));
  return (
    <Show
      when={Option.getOrUndefined(source())}
      fallback={<ProxyPending video={props.variant.video} />}
    >
      {(src) => {
        // The clock holds only a video on the page: it lets go when the placeholder returns.
        onCleanup(() => driver.detach(props.variant.id));
        return (
          <video
            class={props.class}
            data-id={props.variant.id}
            preload="auto"
            playsinline
            muted
            src={src()}
            ref={(el: HTMLVideoElement) => driver.attach(props.variant.id, playableOf(el))}
          />
        );
      }}
    </Show>
  );
};

/**
 * A variant's caption: its letter, its name, Out of date when it is, and the
 * 🔊 that makes it the one heard; its lines and why it is stale are its
 * inspector's Info (UR-29, UR-30).
 */
const VariantCap = (props: { readonly variant: SeenVariant }) => {
  const { set, sync, send } = useSet();
  const audible = () => sync().audible === props.variant.id;
  return (
    <div class="rv-cap">
      <span class="rv-letter">{letterOf(set, props.variant.id)}</span>
      <VersionName version={props.variant} />
      <StaleBadge variant={props.variant} />
      <button
        type="button"
        class={['sh-tool', 'rv-sound', { on: audible() }]}
        title="Hear this one"
        onClick={() => send.sync(SyncEvent.HeardChosen({ id: props.variant.id }))}
      >
        🔊
      </button>
    </div>
  );
};

/** A variant's video on the set's clock, and its caption; marked while its inspector is open (SU-13). */
const VariantCard = (props: { readonly variant: SeenVariant }) => {
  const { folder, set, sync } = useSet();
  // A card is keyed by its version: its selection is fixed for as long as it lives.
  const inspected = useInspected(untrack(() => versionOf(folder, set, props.variant.id)));
  return (
    <Target
      of={versionOf(folder, set, props.variant.id)}
      class={['rv-card', { 'rv-audible': sync().audible === props.variant.id }]}
      data-id={props.variant.id}
      data-selected={pressed(inspected())}
    >
      <VariantVideo variant={props.variant} />
      <VariantCap variant={props.variant} />
    </Target>
  );
};

const gridClass = (count: number) => {
  if (count <= 2) return 'rv-grid rv-two';
  return 'rv-grid rv-wide';
};

const AllView = () => {
  const { set } = useSet();
  return (
    <div class={gridClass(set.variants.length)}>
      <For each={set.variants}>{(variant) => <VariantCard variant={variant} />}</For>
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
    <div class="rv-row rv-pick">
      <span class="rv-hint">
        {Option.getOrElse(
          Option.map(Option.fromUndefinedOr(set.variants[0]), (v) => v.label),
          () => '',
        )}{' '}
        against:
      </span>
      <For each={set.variants.slice(1)}>
        {(variant) => (
          <button
            type="button"
            class="sh-btn"
            data-other={variant.id}
            aria-pressed={pressed(variant.id === props.other)}
            onClick={() => send.view(ViewEvent.OtherChosen({ id: variant.id }))}
          >
            {variant.label}
          </button>
        )}
      </For>
    </div>
  );
};

const PairView = (props: { readonly other: string }) => {
  const { set } = useSet();
  const pair = () => pairOf(set, props.other);
  return (
    <>
      <OtherPick other={props.other} />
      <div class="rv-grid rv-two">
        <Show when={Option.getOrUndefined(pair().first)} keyed>
          {(variant: SeenVariant) => <VariantCard variant={variant} />}
        </Show>
        <Show when={Option.getOrUndefined(pair().other)} keyed>
          {(variant: SeenVariant) => <VariantCard variant={variant} />}
        </Show>
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

/**
 * The pair as the compare's WebCodecs panes (`Media.compare`): each master
 * painted on a canvas, both on one clock, held by the set's clock in place
 * of the videos; let go when the wipe closes.
 */
const WipePanes = (props: {
  readonly chosen: Compare;
  readonly first: SeenVariant;
  readonly other: SeenVariant;
  readonly at: () => string;
}) => {
  const { driver } = useSet();
  const canvases: Array<HTMLCanvasElement> = [];
  const ids = [props.first.id, props.other.id];
  let made = Option.none<ComparePanes>();
  // Once both canvases are in the page; let go with the wipe (a cleanup inside `onSettled` is refused).
  onSettled(() => {
    const compare = props.chosen.panes(canvases);
    made = Option.some(compare);
    compare.panes.forEach((pane, i) =>
      Option.map(Option.fromUndefinedOr(ids[i]), (id) => driver.attach(id, pane)),
    );
  });
  onCleanup(() =>
    Option.map(made, ({ dispose }) => {
      for (const id of ids) driver.detach(id);
      dispose();
    }),
  );
  return (
    <>
      <canvas class="rv-wipe-first" data-id={props.first.id} ref={(el) => canvases.push(el)} />
      <div class="rv-wipe-other" style={{ 'clip-path': `inset(0 0 0 ${props.at()})` }}>
        <canvas data-id={props.other.id} ref={(el) => canvases.push(el)} />
      </div>
    </>
  );
};

/**
 * The pair wiped (PA-8): both videos on the clock, stacked full width, the
 * first left of a divider and the other right of it; the divider dragged by
 * its grip, clamped to the frame. The divider is this page's, not the
 * link's: a different split shows the same comparison. Each one's caption
 * (its 🔊, its inspector) sits under the frame.
 */
const WipeView = (props: { readonly other: string }) => {
  const { meta } = useReview();
  const { folder, set, sync } = useSet();
  const pair = () => pairOf(set, props.other);
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
  const panes = () =>
    Option.all({
      chosen: Option.filter(chosen(), (c) => c.engine.engine === 'webcodecs'),
      first: pair().first,
      other: pair().other,
    });
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
              <Show when={Option.getOrUndefined(pair().first)} keyed>
                {(variant: SeenVariant) => <VariantVideo variant={variant} class="rv-wipe-first" />}
              </Show>
              <Show when={Option.getOrUndefined(pair().other)} keyed>
                {(variant: SeenVariant) => (
                  <div class="rv-wipe-other" style={{ 'clip-path': `inset(0 0 0 ${at()})` }}>
                    <VariantVideo variant={variant} />
                  </div>
                )}
              </Show>
            </>
          }
        >
          {(p: { chosen: Compare; first: SeenVariant; other: SeenVariant }) => (
            <WipePanes chosen={p.chosen} first={p.first} other={p.other} at={at} />
          )}
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
        <For each={[pair().first, pair().other].flatMap(Option.toArray)}>
          {(variant) => (
            <Target
              of={versionOf(folder, set, variant.id)}
              class={['rv-card', { 'rv-audible': sync().audible === variant.id }]}
              data-id={variant.id}
            >
              <VariantCap variant={variant} />
            </Target>
          )}
        </For>
      </div>
    </>
  );
};

/** The moments' chips, the one shown pressed; ←/→ step through them. */
const MomentPick = (props: { readonly moments: ReadonlyArray<number>; readonly index: number }) => {
  const { send } = useSet();
  return (
    <div class="rv-row rv-pick">
      <For each={props.moments.map((t, i) => ({ t, i }))}>
        {(m) => (
          <button
            type="button"
            class="sh-btn"
            data-moment={String(m.i)}
            aria-pressed={pressed(m.i === props.index)}
            onClick={() => send.view(ViewEvent.MomentChosen({ index: m.i }))}
          >
            {timecode(m.t)}
          </button>
        )}
      </For>
    </div>
  );
};

/** A still's caption: the variant's letter, its name and Out of date when it is (no 🔊: nothing plays). */
const StillCap = (props: { readonly variant: SeenVariant }) => {
  const { set } = useSet();
  return (
    <div class="rv-cap">
      <span class="rv-letter">{letterOf(set, props.variant.id)}</span>
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
            () => set.start,
          ),
        )
      }
    </Show>
  );
};

const MomentsView = (props: { readonly index: number }) => {
  const { folder, set } = useSet();
  return (
    <WithMoments index={props.index}>
      {(ms, at) => (
        <>
          <MomentPick moments={ms} index={props.index} />
          <div class={gridClass(set.variants.length)}>
            <For each={set.variants}>
              {(variant) => (
                <Target
                  of={versionOf(folder, set, variant.id)}
                  class="rv-card"
                  data-id={variant.id}
                >
                  <Zoom
                    still={reviewFrameUrl(variant.video.ref, Option.some(at()), MOMENT_W)}
                    alt={`${variant.label} at ${timecode(at())}`}
                    shown={{
                      src: reviewFrameUrl(variant.video.ref, Option.some(at()), LIGHTBOX_W),
                      caption: `${variant.label} at ${timecode(at())}`,
                    }}
                  />
                  <StillCap variant={variant} />
                </Target>
              )}
            </For>
          </div>
        </>
      )}
    </WithMoments>
  );
};

/**
 * The pair's difference at a moment (PA-8): the first variant's frame, and
 * the other's cut at the same instant laid over it in the difference blend,
 * so what is the same is black and what differs is lit. Stills, never the
 * playing videos: the server cuts both at the one `t`, so the blend is exact.
 */
const DiffView = (props: { readonly other: string; readonly index: number }) => {
  const { folder, set } = useSet();
  const pair = () => pairOf(set, props.other);
  const frameOf = (variant: SeenVariant, t: number) =>
    reviewFrameUrl(variant.video.ref, Option.some(t), MOMENT_W);
  return (
    <WithMoments index={props.index}>
      {(ms, at) => (
        <>
          <OtherPick other={props.other} />
          <MomentPick moments={ms} index={props.index} />
          <div class="rv-diff">
            <Show when={Option.getOrUndefined(pair().first)} keyed>
              {(variant: SeenVariant) => (
                <img
                  class="rv-diff-first"
                  data-id={variant.id}
                  src={frameOf(variant, at())}
                  alt={`${variant.label} at ${timecode(at())}`}
                />
              )}
            </Show>
            <Show when={Option.getOrUndefined(pair().other)} keyed>
              {(variant: SeenVariant) => (
                <img
                  class="rv-diff-other"
                  data-id={variant.id}
                  src={frameOf(variant, at())}
                  alt={`the difference from ${variant.label}`}
                />
              )}
            </Show>
          </div>
          <p class="rv-hint">Black where the two are the same; lit where they differ.</p>
          <div class="rv-grid rv-two rv-wipe-caps">
            <For each={[pair().first, pair().other].flatMap(Option.toArray)}>
              {(variant) => (
                <Target
                  of={versionOf(folder, set, variant.id)}
                  class="rv-card"
                  data-id={variant.id}
                >
                  <StillCap variant={variant} />
                </Target>
              )}
            </For>
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
        Option.liftPredicate(v.query.inspect, (id) => set.variants.some((x) => x.id === id)),
        (id) => versionOf(folder, set, id),
      ),
    naming: (v, s) =>
      Option.map(
        Option.filter(
          Option.liftPredicate(s, Selection.guards.Version),
          (x) => x.folder === folder.ref && x.point === set.id,
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
      <For each={set.variants}>{(variant) => <VersionInspector version={variant} />}</For>
    </>
  );
};

export const SetPage = (props: { readonly folder: string; readonly point: string }) => (
  <WithIndex>
    {(index) => (
      <Show
        when={Option.getOrUndefined(folderIn(index(), props.folder))}
        keyed
        fallback={<Missing what="folder" />}
      >
        {(folder: ReviewFolder) => (
          <Show
            when={folder.sets.find((s) => s.id === props.point)}
            keyed
            fallback={<Missing what="version stack" />}
          >
            {(set: ChoicePoint) => (
              <SetProvider folder={folder} set={seenPoint(set)}>
                <Saying folder={folder} set={seenPoint(set)}>
                  <div class="rv-tools rv-set-tools">
                    <ViewTabs />
                  </div>
                  <SetBody />
                </Saying>
              </SetProvider>
            )}
          </Show>
        )}
      </Show>
    )}
  </WithIndex>
);
