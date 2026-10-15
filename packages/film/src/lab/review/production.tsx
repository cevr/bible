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

import { PlaceStyle } from '../place-style.tsx';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createEffect, createMemo, createSignal, flush } from 'solid-js';
import { useAtomValue } from '@bible/atom-solid';
import { pageHref, reviewStillUrl } from '../../core/api.ts';
import type { BoardFile } from '../../core/board.ts';
import { focusFor } from '../focus.ts';
import { pressed } from '../pressed.ts';
import { WIDE } from '../viewport.ts';
import { type ChoicePoint, seenVariants } from '../../core/choice.ts';
import {
  type BoardStage,
  ChoiceState,
  Entry,
  type ProductionFile,
  type ProductionHistory,
  type Said,
  type VersionView,
  type Waiting,
  boardStageOf,
  choiceStateOf,
  currentOf,
  productionsOf,
  setPathOf,
} from '../../core/production.ts';
import type { ReviewFolder } from '../../core/review.ts';
import { counted } from '../../core/words.ts';
import { ReviewApi } from './api.ts';
import { newestAsked } from '../../core/asked.ts';
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

/** The variant a stack shows: the one picked or approved, else its last. */
const shownOf = (point: ChoicePoint): Option.Option<string> => {
  const seen = seenVariants(point);
  return Option.map(
    Option.orElse(
      Arr.findFirst(seen, (v) => v.approval === 'approved' || v.picked),
      () => Arr.last(seen),
    ),
    (v) => v.video.ref,
  );
};

/** A folder's stills: one a stack (its pick, else its last variant), else its videos, else its images. */
const stillsOf = (folder: ReviewFolder): ReadonlyArray<string> => {
  const refs = folder.sets
    .flatMap((set) => Option.toArray(shownOf(set)))
    .concat(folder.videos.map((v) => v.ref))
    .concat(folder.images.map((i) => i.ref))
    .slice(0, STILLS);
  return refs.map((ref) => reviewStillUrl(ref, STILL_W));
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

/** What waits on the owner, as a count's words: `2 questions wait on you`. */
const waitingText = (n: number): string =>
  Match.value(n).pipe(
    Match.when(1, () => '1 question waits on you'),
    Match.orElse(() => `${counted(n, 'question')} wait on you`),
  );

/** A version's own title, when it has one beyond its number. */
const ownTitle = (v: Pick<VersionView, 'n' | 'title'>): Option.Option<string> =>
  Option.liftPredicate(v.title, (t) => t !== `v${v.n}`);

/** A version's name on the line: `v5 · 9005: K1-minimal, plain`, or `v5` when its title is only its number. */
const versionName = (v: Pick<VersionView, 'n' | 'title'>): string =>
  Option.match(ownTitle(v), { onNone: () => `v${v.n}`, onSome: (t) => `v${v.n} · ${t}` });

/** What a production's card shows of the film it makes: the front door's (its state, the ways into it). */
type FilmPart = (props: { readonly film: string }) => JSX.Element;

/**
 * A production's card on the front door: its stills, its name, its current
 * version and what waits, which open its timeline; under them, for a
 * production that makes one of the app's films, what that film's card shows
 * (`filmPart`), the film's only card on the front door.
 */
const ProductionCard = (props: {
  readonly history: ProductionHistory;
  readonly film: Option.Option<string>;
  readonly filmPart: FilmPart;
}) => {
  const { meta } = useReview();
  const current = () => currentOf(props.history);
  const Part = props.filmPart;
  return (
    <div class="rv-card rv-film-card pd-card" data-production={props.history.production}>
      <Go
        class="rv-card"
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
      <Show when={Option.getOrUndefined(props.film)}>
        {(film: Accessor<string>) => <Part film={film()} />}
      </Show>
    </div>
  );
};

/**
 * The front door's productions, newest first; nothing while none is kept or
 * named. A production whose film is one of `films` carries that film's part.
 */
export const ProductionCards = (props: {
  readonly histories: ReadonlyArray<ProductionHistory>;
  readonly films: ReadonlyArray<string>;
  readonly filmPart: FilmPart;
}) => (
  <Show when={props.histories.length > 0}>
    <h2 class="rv-h">Productions</h2>
    <div class="rv-grid">
      <For each={props.histories}>
        {(history) => (
          <ProductionCard
            history={history}
            film={Option.filter(history.film, (f) => props.films.includes(f))}
            filmPart={props.filmPart}
          />
        )}
      </For>
    </div>
  </Show>
);

/** The films a production makes, among `films`: the front door shows each only as its production. */
export const producedFilms = (
  histories: ReadonlyArray<ProductionHistory>,
  films: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  histories.flatMap((h) => Option.toArray(Option.filter(h.film, (f) => films.includes(f))));

/** How the line prints a time: `Oct 14, 12:30 PM`. */
const DATES = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** A version's span: `Oct 14, 9:09 AM – 12:30 PM` (the day once when it is one), or `since Oct 14, 12:30 PM`. */
const spanText = (v: VersionView): string =>
  Option.match(v.until, {
    onNone: () => `since ${DATES.format(v.at)}`,
    onSome: (until) => DATES.formatRange(v.at, until),
  });

/** The folder under the roots at `path` (its ref less its root's label), when the index holds one. */
const folderAt = (path: string): Option.Option<ReviewFolder> => {
  const { state } = useReview();
  return Option.flatMap(AsyncResult.value(state.index()), (i) =>
    Arr.findFirst(i.folders, (f) => setPathOf(f.ref) === path),
  );
};

/** A choice's state in its row: the variant picked or decided, waiting on an ask, or nothing. */
const StateChip = (props: { readonly state: ChoiceState }) => (
  <>
    {ChoiceState.$match(props.state, {
      Picked: ({ variants }) => (
        <span class="sh-badge" data-state="approved">
          picked {variants.join(', ')}
        </span>
      ),
      Decided: ({ variant }) => (
        <span class="sh-badge" data-state="approved">
          {Option.match(variant, { onNone: () => 'decided', onSome: (v) => `decided ${v}` })}
        </span>
      ),
      Waiting: () => (
        <span class="sh-badge" data-state="warning">
          waiting
        </span>
      ),
      Quiet: () => [],
    })}
  </>
);

/** How many of a set's choices its row names. */
const CHOICES = 3;

/** The choices a set's row leaves unnamed: `+2 more in the set`, or `4 choices in the set` when it names none. */
const moreText = (n: number, named: boolean): string =>
  Match.value(named).pipe(
    Match.when(true, () => `+${n} more in the set`),
    Match.orElse(() => `${counted(n, 'choice')} in the set`),
  );

/**
 * A set published into a version: its stills, its title, and the choices
 * in it that were picked, decided or wait on an ask (three at most, then
 * how many more the set holds).
 */
const SetEntry = (props: {
  readonly folder: ReviewFolder;
  readonly at: number;
  readonly said: ReadonlyArray<Said>;
  readonly waiting: ReadonlyArray<Waiting>;
}) => {
  const { meta } = useReview();
  const stated = createMemo(() =>
    props.folder.sets.flatMap((point) => {
      const state = choiceStateOf(props.folder, point, props.said, props.waiting);
      return [{ point, state }].filter((row) => row.state._tag !== 'Quiet');
    }),
  );
  const more = () => props.folder.sets.length - Math.min(stated().length, CHOICES);
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
            <For each={stated().slice(0, CHOICES)}>
              {(row) => (
                <li class="rv-row" data-point={row.point.id}>
                  <Go place={ReviewPlace.Set({ folder: props.folder.ref, point: row.point.id })}>
                    {row.point.title}
                  </Go>
                  <span class="rv-meta">{counted(row.point.variants.length, 'option')}</span>
                  <StateChip state={row.state} />
                </li>
              )}
            </For>
            <Show when={more() > 0}>
              <li class="rv-row rv-meta">
                <Go place={place()}>{moreText(more(), stated().length > 0)}</Go>
              </li>
            </Show>
          </ul>
        </Show>
      </div>
    </li>
  );
};

/** A said entry's kind, as its row names it. */
const SAID_KIND = { Decided: 'Decided', Noted: 'Note', Asked: 'Asked' } as const satisfies Record<
  Said['_tag'],
  string
>;

/** Who filed a said entry, after its time: the agent that heard it, when the entry says. */
const filedBy = (said: Said): string =>
  Option.match(said.by, { onNone: () => '', onSome: (by) => ` · filed by ${by}` });

/** The owner's word (a decision or a note) or a question asked of them: its own words quoted, the set it is about linked. */
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
          <span class="rv-meta">
            {agoText(props.said.at, meta.now())}
            {filedBy(props.said)}
          </span>
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
      <div class="rv-meta">Not on this machine: moved, in the Trash, or kept elsewhere.</div>
    </div>
  </li>
);

const EntryRow = (props: {
  readonly entry: Entry;
  readonly said: ReadonlyArray<Said>;
  readonly waiting: ReadonlyArray<Waiting>;
}) => (
  <>
    {(() => {
      const entry = props.entry;
      if (entry._tag === 'Published')
        return (
          <SetEntry folder={entry.folder} at={entry.at} said={props.said} waiting={props.waiting} />
        );
      if (entry._tag === 'Said') return <SaidEntry said={entry.said} />;
      return <MissingEntry set={entry.set} />;
    })()}
  </>
);

/** Where an ask points: its choice when the review holds it, else its set. */
const askPlace = (w: Waiting): Option.Option<ReviewPlace> =>
  Option.map(w.folder, (folder) =>
    Option.match(w.point, {
      onNone: () => ReviewPlace.Folder({ folder: folder.ref }),
      onSome: (point) => ReviewPlace.Set({ folder: folder.ref, point: point.id }),
    }),
  );

/** What waits on the owner: a line an open question, linked to what it asks about. */
const WaitingList = (props: { readonly waiting: ReadonlyArray<Waiting> }) => (
  <div class="pd-waiting" data-role="waiting">
    <Show when={props.waiting.length > 0} fallback={<p class="rv-hint">Nothing waits on you.</p>}>
      <h3 class="rv-h">{waitingText(props.waiting.length)}</h3>
      <ul>
        <For each={props.waiting}>
          {(w) => (
            <li class="rv-row">
              <Show when={Option.getOrUndefined(askPlace(w))} fallback={<span>{w.ask.text}</span>}>
                {(place: Accessor<ReviewPlace>) => <Go place={place()}>{w.ask.text}</Go>}
              </Show>
              <span class="rv-meta">
                in{' '}
                {Option.match(w.folder, {
                  onNone: () => Option.getOrElse(w.ask.set, () => 'no set'),
                  onSome: folderTitle,
                })}
              </span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  </div>
);

/** The owner's newest decision in `v`, to start the move's first field from. */
const newestDecision = (v: VersionView): string =>
  Option.getOrElse(
    Arr.findFirst(v.entries, (e) => e._tag === 'Said' && e.said._tag === 'Decided').pipe(
      Option.flatMap((e) => Option.liftPredicate(e, Entry.$is('Said'))),
      Option.map((e) => e.said.text),
    ),
    () => '',
  );

/** The questions a move leaves open: `1 question still waits on you; it stays open after the move.` */
const openAfterText = (n: number): string =>
  Match.value(n).pipe(
    Match.when(1, () => '1 question still waits on you; it stays open after the move.'),
    Match.orElse(
      () => `${counted(n, 'question')} still wait on you; they stay open after the move.`,
    ),
  );

/**
 * Move forward: closed, the page's one verb; open, the decision in a line
 * (started from the owner's newest one) and what the next version is for,
 * both needed, then the move, which the ledger refuses if the production
 * moved on since the page read it.
 */
const MoveForward = (props: { readonly production: string; readonly current: VersionView }) => {
  const { actions } = useReview();
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal('');
  const [because, setBecause] = createSignal('');
  const fields = { first: Option.none<HTMLInputElement>() };
  const moves = newestAsked();
  const next = () => props.current.n + 1;
  const filled = () => title().trim().length > 0 && because().trim().length > 0;
  const move = useWrite(
    (arg: { readonly title: string; readonly because: string }) =>
      ReviewApi.use((api) =>
        api.forward(props.production, {
          after: props.current.n,
          title: arg.title,
          because: Option.some(arg.because),
        }),
      ),
    writeStatus<ProductionFile>('production'),
    { moved: moves },
    (arg) => ({
      doing: `Moving ${props.production} forward…`,
      done: (file) => `${props.production} is at v${file.versions.length}: ${arg.title}`,
    }),
  );
  const start = () => {
    setBecause(newestDecision(props.current));
    setOpen(true);
    flush();
    Option.map(fields.first, (field) => focusFor(field, 'pointer'));
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!filled()) return;
    void move.write({ title: title().trim(), because: because().trim() }).then((landed) =>
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
          onClick={start}
        >
          Move forward to v{next()}
        </button>
      }
    >
      <form class="pd-move" data-act="move-form" onSubmit={submit}>
        <label>
          <span>What did we decide?</span>
          <input
            class="sh-field"
            ref={(el: HTMLInputElement) => {
              fields.first = Option.some(el);
            }}
            name="because"
            required
            placeholder="The pick or the direction, in a line"
            value={because()}
            onInput={(e) => setBecause(e.currentTarget.value)}
          />
        </label>
        <label>
          <span>What is v{next()} for?</span>
          <input
            class="sh-field"
            name="title"
            required
            placeholder="What the next round tries"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </label>
        <Show when={props.current.waiting.length > 0}>
          <p class="rv-hint">{openAfterText(props.current.waiting.length)}</p>
        </Show>
        <div class="rv-row">
          <button
            type="submit"
            class="sh-btn"
            data-primary
            disabled={!filled() || move.waiting()}
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

/** A board's stage in words: `52 panels, 50 kept · 3 of 20 beats approved · 1 stale`. */
const boardText = (s: BoardStage): string =>
  Match.value(s.panels).pipe(
    Match.when(0, () => 'no panels yet'),
    Match.orElse(() =>
      [
        `${counted(s.panels, 'panel')}, ${s.kept} kept`,
        `${s.approved} of ${counted(s.beats, 'beat')} approved`,
        ...Arr.filter([`${s.stale} stale`], () => s.stale > 0),
      ].join(' · '),
    ),
  );

/**
 * A film production's first stage, under its current version's head: the
 * film's storyboard as its record stands (`boardStageOf`), linked to the
 * Board, where the panels are kept and the beats approved. Read in the page
 * alone; nothing while it is read, or when the film has no board to read.
 */
const BoardLine = (props: { readonly film: string }) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.board(props.film));
  return (
    <Show when={Option.getOrUndefined(AsyncResult.value(read()))}>
      {(board: Accessor<BoardFile>) => (
        <div class="rv-row" data-role="stage" data-stage="board">
          <span class="pd-kind">Board</span>
          <a href={pageHref.board(props.film)}>{boardText(boardStageOf(board()))} ›</a>
        </div>
      )}
    </Show>
  );
};

/** A version with nothing in it, said as its state allows. */
const emptyText = (v: VersionView): string =>
  Match.value(v.current).pipe(
    Match.when(true, () => `Nothing published in v${v.n} yet.`),
    Match.orElse(() => `Nothing was published in v${v.n}.`),
  );

/** A shut version's tally: `3 sets · 1 missing`. */
const tallyText = (v: VersionView): string => {
  const sets = v.entries.filter((e) => e._tag === 'Published').length;
  const missing = v.entries.filter((e) => e._tag === 'Missing').length;
  return [counted(sets, 'set'), ...Arr.filter([`${missing} missing`], () => missing > 0)].join(
    ' · ',
  );
};

/** One version on the line: its head and why it began, then what waits and what happened in it. */
const VersionBlock = (props: {
  readonly history: ProductionHistory;
  readonly version: VersionView;
  readonly focused: boolean;
  readonly said: ReadonlyArray<Said>;
  readonly waiting: ReadonlyArray<Waiting>;
}) => {
  const v = () => props.version;
  const held = { el: Option.none<HTMLLIElement>() };
  // A link to `?v=<n>` opens that version and brings it into view.
  createEffect(
    () => props.focused && !v().current,
    (bring) => {
      if (bring) Option.map(held.el, (el) => el.scrollIntoView({ block: 'start' }));
    },
  );
  return (
    <li
      ref={(el: HTMLLIElement) => {
        held.el = Option.some(el);
      }}
      class="pd-v"
      id={`v${v().n}`}
      data-v={v().n}
      data-current={pressed(v().current)}
    >
      <details open={v().current || props.focused}>
        <summary class="pd-v-head">
          <span class="pd-v-n">v{v().n}</span>
          <span class="pd-v-title">{Option.getOrElse(ownTitle(v()), () => '')}</span>
          <span class="rv-meta pd-v-span">
            {spanText(v())}
            <Show when={!v().current}> · {tallyText(v())}</Show>
          </span>
          <Show when={Option.getOrUndefined(v().because)}>
            {(because: Accessor<string>) => <span class="rv-hint pd-v-why">{because()}</span>}
          </Show>
        </summary>
        <div class="pd-v-body">
          <Show when={v().current}>
            <Show when={Option.getOrUndefined(props.history.film)}>
              {(film: Accessor<string>) => <BoardLine film={film()} />}
            </Show>
            <WaitingList waiting={v().waiting} />
            <MoveForward production={props.history.production} current={v()} />
          </Show>
          <Show when={v().entries.length > 0} fallback={<p class="rv-hint">{emptyText(v())}</p>}>
            <ol class="pd-entries">
              <For each={v().entries}>
                {(entry) => <EntryRow entry={entry} said={props.said} waiting={props.waiting} />}
              </For>
            </ol>
          </Show>
        </div>
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
    <>
      <PlaceStyle css={PRODUCTION_CSS} />
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
                          waiting={currentOf(history()).waiting}
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
    </>
  );
};

/**
 * The timeline's look, read only through the studio's tokens: one column a
 * reader's width, each version a panel on `--surface-1` hung on a rule down
 * its left, the current one's dot in the accent; a set's stills beside its
 * words on a laptop, above them on a phone.
 */
const PRODUCTION_CSS = `
.pd{max-width:960px;margin:0 auto}
.pd h1{font-size:var(--fs-5);line-height:var(--lh-5);font-weight:var(--w-3);margin:var(--s-4) 0 var(--s-1)}
.pd p{margin:0 0 var(--s-3)}
.pd :is(ol,ul){list-style:none;margin:0;padding:0}
.pd .pd-line{padding-left:var(--s-3);border-left:var(--border)}
.pd-v{position:relative;margin-bottom:var(--s-3);background:var(--surface-1)}
.pd-v::before{content:'';position:absolute;left:-17px;top:19px;width:9px;height:9px;border-radius:var(--r-dot);background:var(--surface-3)}
.pd-v[data-current=true]::before{background:var(--accent)}
.pd summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--s-2);min-height:var(--hit);padding:var(--s-2) var(--s-3);cursor:pointer}
.pd summary::before{content:'›'}
.pd [open]>summary::before{rotate:90deg}
.pd-v-why{flex-basis:100%}
.pd-v-n,.pd-v-title,.pd-e-title{font-weight:var(--w-2)}
.pd-v-span{margin-left:auto}
.pd-v-body{padding:0 var(--s-3) var(--s-3)}
.pd .rv-h,.pd-kind[data-kind=Asked]{margin:0;color:var(--state-warning)}
.pd .rv-row{min-height:var(--hit);row-gap:0}
.pd-choices{display:grid;gap:var(--s-1)}
.pd-waiting,.pd-forward,.pd-move{margin-bottom:var(--s-3)}
.pd-kind{font-size:var(--fs-1);line-height:var(--lh-1);text-transform:uppercase;letter-spacing:var(--track-caps);color:var(--text-2)}
.pd-move{display:grid;gap:var(--s-2);padding:var(--s-3);background:var(--surface-2)}
.pd-move label{display:grid}
.pd-e{display:grid;gap:var(--s-2);padding:var(--s-2) 0}
.pd-e+.pd-e{border-top:var(--border)}
.pd-kind[data-kind=Decided]{color:var(--state-approved)}
.pd-kind[data-kind=Missing]{color:var(--state-stale)}
.pd-quote{display:block;padding-left:var(--s-2);border-left:2px solid var(--line-strong)}
@media ${WIDE}{.pd-set{grid-template-columns:360px 1fr}}
`;
