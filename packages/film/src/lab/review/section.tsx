// The review's pages. Home lists every folder with something to review,
// comparisons first, filtered by name. A folder shows its comparison sets,
// and whatever is in no set: its videos (with captions when a `.vtt` lies
// beside them), its sheets and stills (a lightbox), its docs (markdown
// inline). A set plays every variant on one clock: all of them, the first
// against one other, every variant's frame at a few moments, or the notes.

import { useAtomValue } from '@bible/atom-solid';
import { For, type JSX, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  type ChoicePoint,
  type SeenPoint,
  type SeenVariant,
  seenPoint,
  seenVariants,
} from '../../core/choice.ts';
import type { ReviewFile, ReviewFolder, ReviewIndex, ReviewVideo } from '../../core/review.ts';
import { reviewFileUrl, reviewFrameUrl } from '../../core/api.ts';
import { SetProvider, useReview, useSet } from './context.tsx';
import {
  agoText,
  approvalText,
  captionsFor,
  countsText,
  folderMatches,
  folderTitle,
  isMarkdown,
  pressed,
  sizeText,
  videoUrl,
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
import { Loaded, failedText } from './loaded.tsx';
import { markdownHtml } from './markdown.ts';
import { type ReviewPlace, ReviewPlace as Place, searchOf } from './place.ts';

/** A strip's frames are this wide; a poster, a moment's frame and the lightbox wider. */
const THUMB_W = 320;
const POSTER_W = 960;
const MOMENT_W = 1280;
const LIGHTBOX_W = 1920;

/** The most frames a card's strip shows. */
const STRIP = 6;

const clicked = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey;

/** A link to `place`: the page goes there itself (so the player's state lives), a modified click opens a tab. */
const Go = (props: {
  readonly place: ReviewPlace;
  readonly class?: string;
  readonly children: JSX.Element;
}) => {
  const { actions } = useReview();
  return (
    <a
      class={props.class}
      href={`${location.pathname}${searchOf(props.place)}`}
      onClick={(e) => {
        if (!clicked(e)) return;
        e.preventDefault();
        actions.go(props.place);
      }}
    >
      {props.children}
    </a>
  );
};

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
    <Go class="rv-card" place={Place.Folder({ folder: props.folder.ref })}>
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

/** The app's films, each a link to its choices and its project (none when the review serves no films). */
const Films = () => {
  const { state } = useReview();
  const films = () =>
    Option.getOrElse(
      Option.map(AsyncResult.value(state.films()), (f) => f.films),
      () => [],
    ).filter((film) => film.toLowerCase().includes(state.filter().toLowerCase()));
  return (
    <Section title="Films" count={films().length}>
      <div class="rv-row rv-films">
        <For each={films()}>
          {(film) => (
            <>
              <Go class="rv-chip" place={Place.Project({ film })}>
                {film} · project
              </Go>
              <Go class="rv-chip" place={Place.Film({ film })}>
                {film} · choices
              </Go>
            </>
          )}
        </For>
      </div>
    </Section>
  );
};

/** Every folder with something to review: comparisons first, then the rest; filtered by name. */
export const Home = () => {
  const { state } = useReview();
  return (
    <WithIndex>
      {(index) => {
        const shown = createMemo(() =>
          index().folders.filter((f) => folderMatches(f, state.filter())),
        );
        const sets = createMemo(() => shown().filter((f) => f.sets.length > 0));
        const rest = createMemo(() => shown().filter((f) => f.sets.length === 0));
        return (
          <>
            <Films />
            <Section title="Comparisons" count={sets().length}>
              <div class="rv-grid">
                <For each={sets()}>{(folder) => <FolderCard folder={folder} />}</For>
              </div>
            </Section>
            <Section title="Renders" count={rest().length}>
              <div class="rv-grid">
                <For each={rest()}>{(folder) => <FolderCard folder={folder} />}</For>
              </div>
            </Section>
            <Show when={shown().length === 0}>
              <p class="empty">Nothing here yet.</p>
            </Show>
          </>
        );
      }}
    </WithIndex>
  );
};

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
          Match.when(true, () => `<p class="rv-hint">${failedText(read())}</p>`),
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
      Match.when('ready', () => ' · 720p ready'),
      Match.when('pending', () => ' · 720p coming'),
      Match.orElse(() => ''),
    );
  return (
    <div class="rv-card rv-tall">
      <video
        controls
        preload="none"
        playsinline
        poster={reviewFrameUrl(props.video.ref, Option.none(), POSTER_W)}
        src={videoUrl(props.video, state.quality())}
      >
        <Show when={Option.getOrUndefined(captions)} keyed>
          {(vtt: ReviewFile) => <track kind="captions" src={reviewFileUrl(vtt.ref)} default />}
        </Show>
      </video>
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
  <Go class="rv-card" place={Place.Set({ folder: props.folder.ref, point: props.set.id })}>
    <Strip refs={seenVariants(props.set).map((v) => v.video.ref)} />
    <div class="rv-body">
      <b>{props.set.title}</b>
      <span class="rv-badge">compare {props.set.variants.length}</span>
      <div class="rv-meta">{props.set.variants.map((v) => v.label).join(' · ')}</div>
    </div>
  </Go>
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
        {(blurb) => <p class="rv-hint">{blurb()}</p>}
      </Show>
      <Section title="Comparisons" count={props.folder.sets.length}>
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

/** The copy each video plays: the phone's 720p (once made) or the file. */
export const QualityToggle = () => {
  const { state, actions } = useReview();
  return (
    <div class="rv-seg" title="Phone copies are 720p, made for big videos">
      <button
        type="button"
        data-quality="phone"
        aria-pressed={pressed(state.quality() === 'phone')}
        onClick={() => actions.quality('phone')}
      >
        720p
      </button>
      <button
        type="button"
        data-quality="full"
        aria-pressed={pressed(state.quality() === 'full')}
        onClick={() => actions.quality('full')}
      >
        Full
      </button>
    </div>
  );
};

const VIEW_TITLES = { all: 'All', pair: 'vs one', moments: 'Moments', notes: 'Notes' } as const;

/** All, the first against one, the moments, the notes. */
export const ViewTabs = () => {
  const { set, view, send } = useSet();
  const first = Option.getOrElse(
    Option.map(Option.fromUndefinedOr(set.variants[0]), (v) => v.label),
    () => 'A',
  );
  const title = (name: ViewName) => {
    if (name === 'pair') return `${first} ${VIEW_TITLES.pair}`;
    return VIEW_TITLES[name];
  };
  return (
    <div class="rv-seg rv-views">
      <For each={ViewName.literals}>
        {(name) => (
          <button
            type="button"
            data-view={name}
            aria-pressed={pressed(viewNameOf(view()) === name)}
            onClick={() => send.view(ViewEvent.ViewChosen({ view: name }))}
          >
            {title(name)}
          </button>
        )}
      </For>
    </div>
  );
};

const RATE_TITLES = { 0.5: '½×', 1: '1×' } as const;

/** Play and pause, the time, one scrub bar for every video, and the rate. */
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

/** A variant's video on the set's clock, and the 🔊 that makes it the one heard. */
const VariantCard = (props: { readonly variant: SeenVariant }) => {
  const { state } = useReview();
  const { set, sync, send, driver } = useSet();
  const audible = () => sync().audible === props.variant.id;
  onCleanup(() => driver.detach(props.variant.id));
  return (
    <div class={['rv-card', { 'rv-audible': audible() }]} data-id={props.variant.id}>
      <video
        preload="auto"
        playsinline
        muted
        src={videoUrl(props.variant.video, state.quality())}
        ref={(el: HTMLVideoElement) => driver.attach(props.variant.id, el)}
      />
      <div class="rv-cap">
        <span class="rv-letter">{letterOf(set, props.variant.id)}</span>
        <span class="rv-name">{props.variant.label}</span>
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
    </div>
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
  const { set, moments, send } = useSet();
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
                  <div class="rv-card" data-id={variant.id}>
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
                      <span class="rv-name">{variant.label}</span>
                      <span class="rv-tag">{variant.lines.join(' · ')}</span>
                    </div>
                  </div>
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
  const { set } = useSet();
  const now = useReview().meta.now();
  return (
    <div class="rv-grid rv-wide">
      <For each={set.variants}>
        {(variant) => (
          <div class="rv-note" data-id={variant.id}>
            <div class="rv-verdict">
              <b>
                {letterOf(set, variant.id)} · {variant.label}
              </b>
              {approvalText(variant.approval)}
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
          </div>
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
            fallback={<Missing what="comparison" />}
          >
            {(set: ChoicePoint) => (
              <SetProvider folder={folder} set={seenPoint(set)}>
                <div class="rv-tools rv-set-tools">
                  <ViewTabs />
                </div>
                <SetBody />
              </SetProvider>
            )}
          </Show>
        )}
      </Show>
    )}
  </WithIndex>
);
