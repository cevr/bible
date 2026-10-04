// The review's pages. Home lists every folder with something to review,
// version stacks first, filtered by name. A folder shows its version stacks
// (Versions), and whatever is in no stack: its videos (with captions when a
// `.vtt` lies beside them), its sheets and stills (a lightbox), its docs
// (markdown inline). A stack plays every version on one clock: all of them,
// the first side by side with one other (a stack of two or more), every
// version's frame at a few moments, or the notes. A version's name opens its
// inspector: its Info, its approve and unapprove, what was said of it and
// the comment box, said over the set's route (UI-7).

import { useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Accessor,
  type ParentProps,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
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
import { playableOf } from '../../browser/media-browser.ts';
import type { ReviewFile, ReviewFolder, ReviewIndex, ReviewVideo } from '../../core/review.ts';
import {
  type Say,
  type SetSayPost,
  pageHref,
  reviewFileUrl,
  reviewFrameUrl,
} from '../../core/api.ts';
import { ReviewApi } from './api.ts';
import { newestAsked } from './asked.ts';
import { CommentCount, InspectName, Inspector, useThing } from './inspector.tsx';
import { ApproveButton, Comments, SayBox } from './options/choice.tsx';
import type { ThingVerb } from './things.ts';
import { Go, SetProvider, useReview, useSet } from './context.tsx';
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
  Rate,
  SyncEvent,
  type SyncState,
  ViewEvent,
  ViewName,
  clockText,
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

const Section = (props: {
  readonly title: string;
  readonly count: number;
  readonly children: JSX.Element;
}) => (
  <Show when={props.count > 0}>
    <h2 class="rv-h">
      {props.title} <small>{props.count}</small>
    </h2>
    {props.children}
  </Show>
);

/** The app's films, each a link to its project, its choices and its lab (none when the app has no films). */
const Films = () => {
  const { state } = useReview();
  const films = () =>
    Option.getOrElse(
      Option.map(AsyncResult.value(state.films()), (f) => f.films),
      () => [],
    );
  return (
    <Section title="Films" count={films().length}>
      <div class="rv-row rv-films">
        <For each={films()}>
          {(film) => (
            <>
              <Target
                of={Selection.cases.Film.make({ film })}
                class="rv-chip"
                render={(p: TargetElementProps) => (
                  <Go {...p} place={Place.Project({ film })}>
                    {film} · project
                  </Go>
                )}
              />
              <Target
                of={Selection.cases.Film.make({ film })}
                class="rv-chip"
                render={(p: TargetElementProps) => (
                  <Go {...p} place={Place.Film({ film })}>
                    {film} · choices
                  </Go>
                )}
              />
              <Target
                of={Selection.cases.Film.make({ film })}
                class="rv-chip"
                render={(p: TargetElementProps) => (
                  <a {...p} href={pageHref.lab(film)}>
                    {film} · lab
                  </a>
                )}
              />
            </>
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
          <Films />
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

/** A video in no set: its poster, its captions, and a link to the file itself. */
const LooseVideo = (props: {
  readonly video: ReviewVideo;
  readonly docs: ReadonlyArray<ReviewFile>;
}) => {
  const { state, meta } = useReview();
  const now = meta.now();
  const captions = captionsFor(props.video, props.docs);
  const ready = () =>
    Match.value(props.video.phone).pipe(
      Match.when('ready', () => ' · proxy ready'),
      Match.when('pending', () => ' · proxy coming'),
      Match.orElse(() => ''),
    );
  const source = createMemo(() => videoSource(props.video, state.quality()));
  return (
    <div class="rv-card rv-tall">
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
        <span class="rv-tag">
          {sizeText(props.video.size)} · {agoText(props.video.mtime, now)}
          {ready()}
        </span>
        <a class="rv-hint" href={reviewFileUrl(props.video.ref)} target="_blank" rel="noreferrer">
          file
        </a>
      </div>
    </div>
  );
};

const SetCard = (props: { readonly folder: ReviewFolder; readonly set: ChoicePoint }) => (
  <Target
    of={Selection.cases.Set.make({ folder: props.folder.ref, point: props.set.id })}
    class="rv-card"
    render={(p: TargetElementProps) => (
      <Go {...p} place={Place.Set({ folder: props.folder.ref, point: props.set.id })}>
        <Strip refs={seenVariants(props.set).map((v) => v.video.ref)} />
        <div class="rv-body">
          <b>{props.set.title}</b>
          <span class="rv-badge">{versionsText(props.set.variants.length)}</span>
          <div class="rv-meta">{props.set.variants.map((v) => v.label).join(' · ')}</div>
        </div>
      </Go>
    )}
  />
);

/** A folder: its sets, then whatever is in none of them. */
const FolderBody = (props: { readonly folder: ReviewFolder }) => {
  const { actions, meta } = useReview();
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
                <img
                  class="rv-media rv-zoom"
                  loading="lazy"
                  src={reviewFileUrl(image.ref)}
                  alt={image.name}
                  onClick={() => actions.show(Option.some(reviewFileUrl(image.ref)))}
                />
                <div class="rv-cap">
                  <span class="rv-name">{image.name}</span>
                  <span class="rv-tag">{agoText(image.mtime, now)}</span>
                </div>
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
                <a class="rv-chip" href={reviewFileUrl(doc.ref)} target="_blank" rel="noreferrer">
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
                class="rv-chip"
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
        <button type="button" onClick={() => actions.quality('full')}>
          Play the original
        </button>
      </p>
    </div>
  );
};

const VIEW_TITLES = {
  all: 'All',
  pair: 'Side by side',
  moments: 'Moments',
  notes: 'Notes',
} as const;

/** All, side by side (a stack of two or more), the moments, the notes. */
const ViewTabs = () => {
  const { set, view, send } = useSet();
  const offered = ViewName.literals.filter((name) => name !== 'pair' || set.variants.length >= 2);
  return (
    <div class="rv-seg rv-views">
      <For each={offered}>
        {(name) => (
          <button
            type="button"
            data-view={name}
            aria-pressed={pressed(viewNameOf(view()) === name)}
            onClick={() => send.view(ViewEvent.ViewChosen({ view: name }))}
          >
            {VIEW_TITLES[name]}
          </button>
        )}
      </For>
    </div>
  );
};

const RATE_TITLES = { 0.5: '½×', 1: '1×' } as const;

/** The synced player's controls: play, the clock, a scrub over every track, the rate, and a line of keys. */
export const Transport = (props: {
  readonly sync: Accessor<SyncState>;
  readonly send: (event: SyncEvent) => void;
  readonly hint: string;
}) => {
  const { sync } = props;
  const send = { sync: props.send };
  const playing = () => runningOf(sync()) || sync()._tag === 'Buffering';
  return (
    <section class="rv-transport">
      <button
        type="button"
        class="rv-big"
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
        {clockText(sync())}
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
      <div class="rv-seg">
        <For each={Rate.literals}>
          {(rate) => (
            <button
              type="button"
              data-rate={String(rate)}
              aria-pressed={pressed(sync().rate === rate)}
              onClick={() => send.sync(SyncEvent.RateChosen({ rate }))}
            >
              {RATE_TITLES[rate]}
            </button>
          )}
        </For>
      </div>
      <span class="rv-hint rv-keys">{props.hint}</span>
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
          undo: Option.none(),
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
    run: () => saying.say(props.version.id, { _tag: 'Withdraw' }),
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
                  class="rv-chip"
                  data-act="unapprove"
                  disabled={saying.waiting()}
                  onClick={() => void saying.say(props.version.id, { _tag: 'Withdraw' })}
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
    <>
      <InspectName of={selection}>
        <span class="rv-name">{props.version.label}</span>
      </InspectName>
      <CommentCount of={selection} count={says.now(props.version).comments.length} />
    </>
  );
};

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

/** A variant's video on the set's clock, and the 🔊 that makes it the one heard. */
const VariantCard = (props: { readonly variant: SeenVariant }) => {
  const { state } = useReview();
  const { folder, set, sync, send, driver } = useSet();
  const audible = () => sync().audible === props.variant.id;
  const source = createMemo(() => videoSource(props.variant.video, state.quality()));
  onCleanup(() => driver.detach(props.variant.id));
  return (
    <Target
      of={versionOf(folder, set, props.variant.id)}
      class={['rv-card', { 'rv-audible': audible() }]}
      data-id={props.variant.id}
    >
      <Show
        when={Option.getOrUndefined(source())}
        fallback={<ProxyPending video={props.variant.video} />}
      >
        {(src) => {
          // The clock holds only a video on the page: it lets go when the placeholder returns.
          onCleanup(() => driver.detach(props.variant.id));
          return (
            <video
              preload="auto"
              playsinline
              muted
              src={src()}
              ref={(el: HTMLVideoElement) => driver.attach(props.variant.id, playableOf(el))}
            />
          );
        }}
      </Show>
      <div class="rv-cap">
        <span class="rv-letter">{letterOf(set, props.variant.id)}</span>
        <VersionName version={props.variant} />
        <StaleTag variant={props.variant} />
        <span class="rv-tag" title={props.variant.lines.join(' · ')}>
          {props.variant.lines.join(' · ')}
        </span>
        <button
          type="button"
          class={['rv-sound', { on: audible() }]}
          title="Hear this one"
          onClick={() => send.sync(SyncEvent.HeardChosen({ id: props.variant.id }))}
        >
          🔊
        </button>
      </div>
      <VersionInspector version={props.variant} />
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

const PairView = (props: { readonly other: string }) => {
  const { set, send } = useSet();
  const first = set.variants[0];
  const other = () => Option.fromUndefinedOr(set.variants.find((v) => v.id === props.other));
  return (
    <>
      <div class="rv-row rv-pick">
        <span class="rv-hint">
          {Option.getOrElse(
            Option.map(Option.fromUndefinedOr(first), (v) => v.label),
            () => '',
          )}{' '}
          against:
        </span>
        <For each={set.variants.slice(1)}>
          {(variant) => (
            <button
              type="button"
              class="rv-chip"
              data-other={variant.id}
              aria-pressed={pressed(variant.id === props.other)}
              onClick={() => send.view(ViewEvent.OtherChosen({ id: variant.id }))}
            >
              {variant.label}
            </button>
          )}
        </For>
      </div>
      <div class="rv-grid rv-two">
        <Show when={first} keyed>
          {(variant: SeenVariant) => <VariantCard variant={variant} />}
        </Show>
        <Show when={Option.getOrUndefined(other())} keyed>
          {(variant: SeenVariant) => <VariantCard variant={variant} />}
        </Show>
      </div>
    </>
  );
};

const MomentsView = (props: { readonly index: number }) => {
  const { actions } = useReview();
  const { folder, set, moments, send } = useSet();
  return (
    <Show
      when={Option.getOrUndefined(moments())}
      keyed
      fallback={<p class="empty">Measuring the first video…</p>}
    >
      {(ms: ReadonlyArray<number>) => {
        const at = () =>
          Option.getOrElse(
            Option.fromUndefinedOr(ms[Math.min(props.index, ms.length - 1)]),
            () => set.start,
          );
        return (
          <>
            <div class="rv-row rv-pick">
              <span class="rv-hint">Moment (←/→):</span>
              <For each={ms.map((t, i) => ({ t, i }))}>
                {(m) => (
                  <button
                    type="button"
                    class="rv-chip"
                    data-moment={String(m.i)}
                    aria-pressed={pressed(m.i === props.index)}
                    onClick={() => send.view(ViewEvent.MomentChosen({ index: m.i }))}
                  >
                    {m.t} s
                  </button>
                )}
              </For>
            </div>
            <div class={gridClass(set.variants.length)}>
              <For each={set.variants}>
                {(variant) => (
                  <Target
                    of={versionOf(folder, set, variant.id)}
                    class="rv-card"
                    data-id={variant.id}
                  >
                    <img
                      class="rv-media rv-zoom"
                      src={reviewFrameUrl(variant.video.ref, Option.some(at()), MOMENT_W)}
                      alt={`${variant.label} at ${at()} s`}
                      onClick={() =>
                        actions.show(
                          Option.some(
                            reviewFrameUrl(variant.video.ref, Option.some(at()), LIGHTBOX_W),
                          ),
                        )
                      }
                    />
                    <div class="rv-cap">
                      <span class="rv-letter">{letterOf(set, variant.id)}</span>
                      <VersionName version={variant} />
                      <StaleTag variant={variant} />
                      <span class="rv-tag">{variant.lines.join(' · ')}</span>
                    </div>
                    <VersionInspector version={variant} />
                  </Target>
                )}
              </For>
            </div>
          </>
        );
      }}
    </Show>
  );
};

const NotesView = () => {
  const { folder, set } = useSet();
  const now = useReview().meta.now();
  return (
    <div class="rv-grid rv-wide">
      <For each={set.variants}>
        {(variant) => (
          <Target of={versionOf(folder, set, variant.id)} class="rv-note" data-id={variant.id}>
            <div class="rv-verdict">
              <b>
                {letterOf(set, variant.id)} · {variant.label}
              </b>
              {approvalText(variant.approval)}
              <StaleTag variant={variant} />
              <For each={variant.lines}>{(line) => <div class="rv-hint">{line}</div>}</For>
            </div>
            <Show
              when={Option.getOrUndefined(variant.notes)}
              keyed
              fallback={
                <p class="rv-hint">
                  {variant.video.ref} · {sizeText(variant.video.size)} ·{' '}
                  {agoText(variant.video.mtime, now)}
                </p>
              }
            >
              {(notes: ReviewFile) => <Markdown file={notes.ref} />}
            </Show>
            <VersionInspector version={variant} />
          </Target>
        )}
      </For>
    </div>
  );
};

/** The set's page: the transport over the view it shows. */
const SetBody = () => {
  const { view, sync, send } = useSet();
  return (
    <>
      <Show when={playsIn(viewNameOf(view()))}>
        <Transport
          sync={sync}
          send={send.sync}
          hint="space · ←/→ 2 s · 🔊 picks whose sound you hear"
        />
      </Show>
      {Match.value(view()).pipe(
        Match.tagsExhaustive({
          All: () => <AllView />,
          Pair: (s) => <PairView other={s.other} />,
          Moments: (s) => <MomentsView index={s.index} />,
          Notes: () => <NotesView />,
        }),
      )}
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
