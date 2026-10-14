// A production's timeline (`/productions/<production>`) and its card on the
// front door: what the owner opens to see where a film or a track such as
// the look has been and where it is now (`core/production.ts`). Each
// version, newest first: what it is for and the decision that moved the
// production into it, then what happened in it, newest first (the sets
// published into it, each with its choices and whether the owner picked; the
// owner's words given outside the lab; a set the ledger files that no root
// holds now). The current version is open and says what waits on the owner,
// and holds the one verb of the page, Move forward: the decision in a line,
// what the next version is for, and the ledger opens it. A past version is
// shut to its head until opened (`?v=<n>` opens it from a link).

import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import { reviewFileUrl, reviewFrameUrl } from '../../core/api.ts';
import { pressed } from '../pressed.ts';
import { WIDE } from '../viewport.ts';
import { type ChoicePoint, seenVariants } from '../../core/choice.ts';
import {
  Entry,
  type ProductionFile,
  type ProductionHistory,
  type Said,
  type VersionView,
  type Waiting,
  currentOf,
  productionsOf,
  setPathOf,
  waitingIn,
} from '../../core/production.ts';
import type { ReviewFolder } from '../../core/review.ts';
import { counted } from '../../core/words.ts';
import { ReviewApi } from './api.ts';
import { newestAsked } from './asked.ts';
import { Go, useReview } from './context.tsx';
import { agoText, folderTitle } from './format.ts';
import { Loaded, useWrite, writeStatus } from './loaded.tsx';
import { ReviewPlace } from './place.ts';

/** How many stills a set's row shows. */
const STILLS = 3;
const STILL_W = 320;

/** Every production's history, from the ledgers and the index as the page last read them. */
export const useHistories = (): Accessor<ReadonlyArray<ProductionHistory>> => {
  const { state } = useReview();
  return createMemo(() => {
    const ledgers = Option.getOrElse(
      Option.map(AsyncResult.value(state.productions()), (p) => p.productions),
      (): ReadonlyArray<ProductionFile> => [],
    );
    const folders = Option.getOrElse(
      Option.map(AsyncResult.value(state.index()), (i) => i.folders),
      (): ReadonlyArray<ReviewFolder> => [],
    );
    return productionsOf(ledgers, folders);
  });
};

/** A folder's stills: its first set's variants (a frame each), else its videos, else its images. */
const stillsOf = (folder: ReviewFolder): ReadonlyArray<string> => {
  const frames = folder.sets
    .flatMap((set) => seenVariants(set).map((v) => v.video.ref))
    .concat(folder.videos.map((v) => v.ref))
    .slice(0, STILLS)
    .map((ref) => reviewFrameUrl(ref, Option.none(), STILL_W));
  if (frames.length > 0) return frames;
  return folder.images.slice(0, STILLS).map((i) => reviewFileUrl(i.ref));
};

/** The stills of the newest set on the current version, else on any version. */
const posterOf = (history: ProductionHistory): ReadonlyArray<string> =>
  Option.getOrElse(
    Arr.findFirst(
      history.versions.flatMap((v) =>
        v.entries.filter(Entry.$is('Published')).map((e) => stillsOf(e.folder)),
      ),
      (stills) => stills.length > 0,
    ),
    () => [],
  );

const Stills = (props: { readonly urls: ReadonlyArray<string> }) => (
  <Show when={props.urls.length > 0}>
    <div class="rv-strip">
      <For each={props.urls}>{(url) => <img loading="lazy" src={url} alt="" />}</For>
    </div>
  </Show>
);

/** What waits on the owner, as a count's words: `2 choices wait on you`. */
const waitingText = (n: number): string =>
  Match.value(n).pipe(
    Match.when(1, () => '1 choice waits on you'),
    Match.orElse(() => `${counted(n, 'choice')} wait on you`),
  );

/** A version's own title, when it has one beyond its number. */
const ownTitle = (v: Pick<VersionView, 'n' | 'title'>): Option.Option<string> =>
  Option.liftPredicate(v.title, (t) => t !== `v${v.n}`);

/** A version's name on the line: `v5 · 9005: K1-minimal, plain`, or `v5` when its title is only its number. */
const versionName = (v: Pick<VersionView, 'n' | 'title'>): string =>
  Option.match(ownTitle(v), { onNone: () => `v${v.n}`, onSome: (t) => `v${v.n} · ${t}` });

/** A production's card on the front door: its stills, its name, its current version, what waits. */
const ProductionCard = (props: { readonly history: ProductionHistory }) => {
  const { meta } = useReview();
  const current = () => currentOf(props.history);
  return (
    <Go
      class="rv-card pd-card"
      data-production={props.history.production}
      place={ReviewPlace.Production({ production: props.history.production, v: 0 })}
    >
      <Stills urls={posterOf(props.history)} />
      <div class="rv-body">
        <b>{props.history.title}</b>
        <div>{versionName(current())}</div>
        <div class="rv-meta">
          <Show when={current().waiting.length > 0}>
            <span class="sh-badge" data-state="warning">
              {waitingText(current().waiting.length)}
            </span>{' '}
          </Show>
          {agoText(props.history.latest, meta.now())}
        </div>
      </div>
    </Go>
  );
};

/** The front door's productions, newest first; nothing while none is kept or named. */
export const ProductionCards = (props: {
  readonly histories: ReadonlyArray<ProductionHistory>;
}) => (
  <Show when={props.histories.length > 0}>
    <h2 class="rv-h">Productions</h2>
    <div class="rv-grid">
      <For each={props.histories}>{(history) => <ProductionCard history={history} />}</For>
    </div>
  </Show>
);

/** A time as the line prints it: `Oct 14, 12:30 PM`. */
const dateText = (at: number): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);

/** A version's span: `Oct 13, 8:00 AM – Oct 13, 8:00 PM`, or `since Oct 14, 12:30 PM`. */
const spanText = (v: VersionView): string =>
  Option.match(v.until, {
    onNone: () => `since ${dateText(v.at)}`,
    onSome: (until) => `${dateText(v.at)} – ${dateText(until)}`,
  });

/** The folder under the roots at `path` (its ref less its root's label), when the index holds one. */
const folderAt = (path: string): Option.Option<ReviewFolder> => {
  const { state } = useReview();
  return Option.flatMap(AsyncResult.value(state.index()), (i) =>
    Arr.findFirst(i.folders, (f) => setPathOf(f.ref) === path),
  );
};

/** A choice's state in its row: the variant picked, waiting, or one variant (nothing to choose). */
const ChoiceState = (props: { readonly point: ChoicePoint; readonly waiting: boolean }) => {
  const picked = () =>
    props.point.variants.filter((v) => v.approval === 'approved' || v.picked).map((v) => v.label);
  return (
    <Show
      when={picked().length > 0}
      fallback={
        <Show when={props.waiting}>
          <span class="sh-badge" data-state="warning">
            waiting
          </span>
        </Show>
      }
    >
      <span class="sh-badge" data-state="approved">
        picked {picked().join(', ')}
      </span>
    </Show>
  );
};

/** A set published into a version: its stills, its title, and each of its choices. */
const SetEntry = (props: {
  readonly folder: ReviewFolder;
  readonly at: number;
  readonly said: ReadonlyArray<Said>;
}) => {
  const { meta } = useReview();
  const waiting = createMemo(() => waitingIn(props.folder, props.said).map((w) => w.point.id));
  const place = () => ReviewPlace.Folder({ folder: props.folder.ref });
  return (
    <li class="pd-e pd-set" data-set={props.folder.ref}>
      <Go class="pd-set-stills" place={place()} aria-hidden="true" tabindex={-1}>
        <Stills urls={stillsOf(props.folder)} />
      </Go>
      <div class="pd-e-body">
        <div class="pd-e-head rv-row">
          <span class="pd-kind">Set</span>
          <Go class="pd-e-title" place={place()}>
            {folderTitle(props.folder)}
          </Go>
          <span class="rv-meta">{agoText(props.at, meta.now())}</span>
        </div>
        <Show when={props.folder.sets.length > 0}>
          <ul class="pd-choices">
            <For each={props.folder.sets}>
              {(point) => (
                <li class="rv-row">
                  <Go place={ReviewPlace.Set({ folder: props.folder.ref, point: point.id })}>
                    {point.title}
                  </Go>
                  <span class="rv-meta">{counted(point.variants.length, 'option')}</span>
                  <ChoiceState point={point} waiting={waiting().includes(point.id)} />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </li>
  );
};

/** A said entry's kind, as its row names it. */
const SAID_KIND = { Decided: 'Decided', Noted: 'Note' } as const satisfies Record<
  Said['_tag'],
  string
>;

/** The owner's word: a decision or a note, its own words quoted, the set it is about linked. */
const SaidEntry = (props: { readonly said: Said }) => {
  const { meta } = useReview();
  const set = () => Option.flatMap(props.said.set, folderAt);
  return (
    <li class="pd-e pd-said" data-kind={props.said._tag}>
      <div class="pd-e-body">
        <div class="pd-e-head rv-row">
          <span class="pd-kind" data-kind={props.said._tag}>
            {SAID_KIND[props.said._tag]}
          </span>
          <span class="pd-e-title">{props.said.text}</span>
          <span class="rv-meta">{agoText(props.said.at, meta.now())}</span>
        </div>
        <Show when={Option.getOrUndefined(props.said.quote)}>
          {(quote: Accessor<string>) => <q class="pd-quote">{quote()}</q>}
        </Show>
        <Show when={Option.getOrUndefined(set())}>
          {(folder: Accessor<ReviewFolder>) => (
            <div class="rv-meta">
              on{' '}
              <Go place={ReviewPlace.Folder({ folder: folder().ref })}>{folderTitle(folder())}</Go>
            </div>
          )}
        </Show>
      </div>
    </li>
  );
};

/** A set the ledger files that no root holds now. */
const MissingEntry = (props: { readonly set: string }) => (
  <li class="pd-e pd-missing">
    <div class="pd-e-body">
      <div class="pd-e-head rv-row">
        <span class="pd-kind" data-kind="Missing">
          Missing
        </span>
        <span class="pd-e-title">{props.set}</span>
      </div>
      <div class="rv-meta">
        No review.json or catalogue under the review roots: moved, in the Trash, or on another
        machine.
      </div>
    </div>
  </li>
);

const EntryRow = (props: { readonly entry: Entry; readonly said: ReadonlyArray<Said> }) => (
  <>
    {(() => {
      const entry = props.entry;
      if (entry._tag === 'Published')
        return <SetEntry folder={entry.folder} at={entry.at} said={props.said} />;
      if (entry._tag === 'Said') return <SaidEntry said={entry.said} />;
      return <MissingEntry set={entry.set} />;
    })()}
  </>
);

/**
 * What waits on the owner in the current version, a line a set: its one
 * choice linked, or the set and how many of its choices wait.
 */
const WaitingList = (props: { readonly waiting: ReadonlyArray<Waiting> }) => {
  const bySet = createMemo(() => Arr.groupBy(props.waiting, (w) => w.folder.ref));
  return (
    <Show when={props.waiting.length > 0}>
      <div class="pd-waiting" data-role="waiting">
        <h3 class="rv-h">{waitingText(props.waiting.length)}</h3>
        <ul>
          <For each={Object.values(bySet())}>
            {(group: Arr.NonEmptyReadonlyArray<Waiting>) => {
              const first = Arr.headNonEmpty(group);
              return (
                <li class="rv-row">
                  <Show
                    when={group.length > 1}
                    fallback={
                      <Go
                        place={ReviewPlace.Set({ folder: first.folder.ref, point: first.point.id })}
                      >
                        {first.point.title}
                      </Go>
                    }
                  >
                    <Go place={ReviewPlace.Folder({ folder: first.folder.ref })}>
                      {folderTitle(first.folder)}
                    </Go>
                  </Show>
                  <span class="rv-meta">
                    <Show
                      when={group.length > 1}
                      fallback={`${counted(first.point.variants.length, 'option')} · in ${folderTitle(first.folder)}`}
                    >
                      {counted(group.length, 'choice')}
                    </Show>
                  </span>
                </li>
              );
            }}
          </For>
        </ul>
      </div>
    </Show>
  );
};

/**
 * Move forward: closed, the page's one verb; open, the decision in a line
 * and what the next version is for, then the move, which the ledger refuses
 * if the production moved on since the page read it.
 */
const MoveForward = (props: { readonly production: string; readonly current: VersionView }) => {
  const { actions } = useReview();
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal('');
  const [because, setBecause] = createSignal('');
  const moves = newestAsked();
  const next = () => props.current.n + 1;
  const move = useWrite(
    (arg: { readonly title: string; readonly because: string }) =>
      ReviewApi.use((api) =>
        api.forward(props.production, {
          after: props.current.n,
          title: arg.title,
          because: Option.liftPredicate(arg.because.trim(), (b) => b.length > 0),
        }),
      ),
    writeStatus<ProductionFile>('production'),
    { moved: moves },
    (arg) => ({
      doing: `Moving ${props.production} forward…`,
      done: (file) => `${props.production} is at v${file.versions.length}: ${arg.title}`,
    }),
  );
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const named = title().trim();
    if (named.length === 0) return;
    void move.write({ title: named, because: because() }).then((landed) =>
      Option.map(landed, (l) => {
        l.show('moved', Option.some, (file) => {
          actions.moved(file);
          setOpen(false);
          setTitle('');
          setBecause('');
        });
      }),
    );
  };
  return (
    <Show
      when={open()}
      fallback={
        <button
          type="button"
          class="sh-btn pd-forward"
          data-primary
          data-act="move-forward"
          onClick={() => setOpen(true)}
        >
          Move forward to v{next()}
        </button>
      }
    >
      <form class="pd-move" data-act="move-form" onSubmit={submit}>
        <label>
          <span>What did we decide?</span>
          <textarea
            name="because"
            rows={2}
            placeholder="The pick or the direction, in a line"
            value={because()}
            onInput={(e) => setBecause(e.currentTarget.value)}
          />
        </label>
        <label>
          <span>What is v{next()} for?</span>
          <input
            name="title"
            required
            placeholder="What the next round tries"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </label>
        <div class="rv-row">
          <button
            type="submit"
            class="sh-btn"
            data-primary
            disabled={title().trim().length === 0 || move.waiting()}
            aria-busy={pressed(move.waiting())}
          >
            Open v{next()}
          </button>
          <button type="button" class="sh-btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </Show>
  );
};

/** One version on the line: its head, why it began, and what happened in it. */
const VersionBlock = (props: {
  readonly history: ProductionHistory;
  readonly version: VersionView;
  readonly focused: boolean;
  readonly said: ReadonlyArray<Said>;
}) => {
  const v = () => props.version;
  const sets = () => v().entries.filter((e) => e._tag === 'Published').length;
  const words = () => v().entries.filter((e) => e._tag === 'Said').length;
  const body = (): JSX.Element => (
    <>
      <Show when={Option.getOrUndefined(v().because)}>
        {(because: Accessor<string>) => <p class="pd-because rv-hint">{because()}</p>}
      </Show>
      <Show when={v().current}>
        <WaitingList waiting={v().waiting} />
        <MoveForward production={props.history.production} current={v()} />
      </Show>
      <Show
        when={v().entries.length > 0}
        fallback={<p class="rv-hint">Nothing published in this version yet.</p>}
      >
        <ol class="pd-entries">
          <For each={v().entries}>{(entry) => <EntryRow entry={entry} said={props.said} />}</For>
        </ol>
      </Show>
    </>
  );
  return (
    <li class="pd-v" data-v={v().n} data-current={pressed(v().current)}>
      <details open={v().current || props.focused}>
        <summary class="pd-v-head">
          <span class="pd-v-n">v{v().n}</span>
          <span class="pd-v-title">{Option.getOrElse(ownTitle(v()), () => '')}</span>
          <span class="rv-meta pd-v-span">
            <Show when={v().current}>now · </Show>
            {spanText(v())}
            <Show when={!v().current}>
              {' · '}
              {counted(sets(), 'set')} · {counted(words(), 'word')}
            </Show>
          </span>
        </summary>
        <div class="pd-v-body">{body()}</div>
      </details>
    </li>
  );
};

/** The production's page: its head, then its versions, newest first. */
export const ProductionPage = (props: { readonly production: string; readonly v: number }) => {
  const { state } = useReview();
  const histories = useHistories();
  const read = createMemo(() =>
    Option.liftPredicate(
      true,
      () => AsyncResult.isSuccess(state.index()) && !AsyncResult.isInitial(state.productions()),
    ),
  );
  return (
    <Loaded value={read()} result={state.index()} reading="Reading the timeline…">
      {() => (
        <Show
          when={histories().find((h) => h.production === props.production)}
          fallback={
            <p class="empty">
              No production named {props.production}: none keeps a ledger, and no set names it.
            </p>
          }
        >
          {(history: Accessor<ProductionHistory>) => {
            const said = () =>
              history().versions.flatMap((v) =>
                v.entries.filter(Entry.$is('Said')).map((e) => e.said),
              );
            return (
              <article class="pd" data-production={history().production}>
                <header class="pd-head">
                  <h1>{history().title}</h1>
                  <Show when={Option.getOrUndefined(history().blurb)}>
                    {(blurb: Accessor<string>) => <p class="rv-hint">{blurb()}</p>}
                  </Show>
                </header>
                <ol class="pd-line">
                  <For each={history().versions}>
                    {(version) => (
                      <VersionBlock
                        history={history()}
                        version={version}
                        focused={props.v === version.n}
                        said={said()}
                      />
                    )}
                  </For>
                </ol>
              </article>
            );
          }}
        </Show>
      )}
    </Loaded>
  );
};

/**
 * The timeline's look, read only through the studio's tokens: one column a
 * reader's width, each version a panel on `--surface-1` hung on a rule down
 * its left, the current one edged in the accent; a set's stills beside its
 * words on a laptop, above them on a phone.
 */
export const PRODUCTION_CSS = `
.pd{max-width:960px;margin:0 auto}
.pd h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:var(--s-4) 0 var(--s-1)}
.pd p{margin:0 0 var(--s-3)}
.pd :is(ol,ul){list-style:none;margin:0;padding:0}
.pd .pd-line{padding-left:var(--s-3);border-left:var(--border)}
.pd-v{position:relative;margin-bottom:var(--s-3);background:var(--surface-1)}
.pd-v::before{content:'';position:absolute;left:-17px;top:19px;width:9px;height:9px;border-radius:var(--r-dot);background:var(--surface-3)}
.pd-v[data-current=true]{box-shadow:inset 2px 0 var(--accent)}
.pd-v[data-current=true]::before{background:var(--accent)}
.pd-v[data-current=true] .pd-v-n{color:var(--accent)}
.pd summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--s-2);min-height:var(--hit);padding:var(--s-2) var(--s-3)}
.pd-v-n,.pd-v-title,.pd-e-title{font-weight:var(--w-2)}
.pd-v-span{margin-left:auto}
.pd-v-body{padding:0 var(--s-3) var(--s-3)}
.pd .rv-h{margin:0;color:var(--state-warning)}
.pd .rv-row{min-height:var(--hit)}
.pd-waiting,.pd-forward,.pd-move{margin-bottom:var(--s-3)}
.pd-kind{font-size:var(--fs-1);line-height:var(--lh-1);text-transform:uppercase;letter-spacing:var(--track-caps);color:var(--text-2)}
.pd-move{display:grid;gap:var(--s-2);padding:var(--s-3);background:var(--surface-2)}
.pd-move label{display:grid}
.pd-move :is(input,textarea){min-height:var(--hit);padding:var(--s-1) var(--s-2);background:var(--surface-1);color:inherit;border:var(--border);font:inherit}
.pd-e{display:grid;gap:var(--s-2);padding:var(--s-2) 0}
.pd-e+.pd-e{border-top:var(--border)}
.pd-kind[data-kind=Decided]{color:var(--state-approved)}
.pd-kind[data-kind=Missing]{color:var(--state-stale)}
.pd-quote{display:block;padding-left:var(--s-2);border-left:2px solid var(--line-strong)}
@media ${WIDE}{.pd-set{grid-template-columns:360px 1fr}}
`;
