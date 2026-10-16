// The review page (`/`, served by `film lab`): the lab's shell
// (`PageShell`: the film switcher, the Studio link, a drill-down crumb, Go
// to…) and the page itself, in Solid 2 over the review's
// routes on the page's own origin. The browser mounts it (`mount.tsx`) and
// the lab renders it on the server first (`server.tsx`), over the same
// components; neither side's own adapters are imported here.

import type { JSX } from '@solidjs/web';
import { parseHref } from '@bible/url-state';
import { Equal, type Layer, Match, Option } from 'effect';
import type { HttpClient } from 'effect/http';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createMemo } from 'solid-js';
import type { ProductionHistory } from '../../core/production.ts';
import type { ReviewIndex } from '../../core/review.ts';
import { type AskShown, Root, useReview } from './context.tsx';
import { Inspecting } from './inspector.tsx';
import { folderTitle, isFilmsFolder } from './format.ts';
import { ReviewPlace, placeOf } from './place.ts';
import { FilmPage } from './options/section.tsx';
import { FolderPage, Home, SetPage } from './section.tsx';
import { ProductionPage, useHistories } from './production.tsx';
import { AskPage } from '../ask/page.tsx';
import { DraftPage } from './draft.tsx';
import { COMMENTS_CSS } from './comments-style.ts';
import { REVIEW_CSS } from './style.ts';
import { type SeriesList, pageAt } from '../../core/api.ts';
import type { Host } from '../../browser/host.ts';
import type { Hub } from '../../command/hub.ts';
import { COMMAND_CSS } from '../command/style.ts';
import { StudioFrame, studioOn } from '../studio-frame.tsx';
import { PageShell } from '../page-shell.tsx';
import type { ShellPage } from '../page-title.ts';
import { SHELL_CSS } from '../page-shell-style.ts';
import type { LabClient } from '../api.ts';

/** A folder's title from the index once read, else its ref. */
const folderName = (index: Option.Option<ReviewIndex>, ref: string): string =>
  Option.getOrElse(
    Option.map(
      Option.flatMap(index, (i) => Option.fromUndefinedOr(i.folders.find((f) => f.ref === ref))),
      folderTitle,
    ),
    () => ref,
  );

/** A series draft's title from the series once read, else its file's name. */
const draftName = (list: Option.Option<SeriesList>, series: string, draft: string): string =>
  Option.getOrElse(
    Option.flatMap(list, (l) =>
      Option.flatMap(Option.fromUndefinedOr(l.series.find((s) => s.name === series)), (s) =>
        Option.map(Option.fromUndefinedOr(s.drafts.find((d) => d.name === draft)), (d) => d.title),
      ),
    ),
    () => draft,
  );

/** A set's title from the index once read, else its point's id. */
const setName = (index: Option.Option<ReviewIndex>, ref: string, point: string): string =>
  Option.getOrElse(
    Option.flatMap(index, (i) =>
      Option.flatMap(Option.fromUndefinedOr(i.folders.find((f) => f.ref === ref)), (f) =>
        Option.map(Option.fromUndefinedOr(f.sets.find((s) => s.id === point)), (s) => s.title),
      ),
    ),
    () => point,
  );

/** The film a folder of renders is of (`isFilmsFolder`), when there is one. */
const filmOfFolder = (ref: string, films: ReadonlyArray<string>): Option.Option<string> =>
  Option.fromUndefinedOr(films.find((film) => isFilmsFolder(ref, film)));

/** The production named `production`, when the page knows it. */
const historyNamed = (
  histories: ReadonlyArray<ProductionHistory>,
  production: string,
): Option.Option<ProductionHistory> =>
  Option.fromUndefinedOr(histories.find((h) => h.production === production));

/** The ask `shown`, when it is ask `id`: one read before another ask's page is not this one's. */
const shownAsk = (shown: Option.Option<AskShown>, id: string): Option.Option<AskShown> =>
  Option.filter(shown, (a) => a.id === id);

/** The film a place is about: a film's choices, a set in that film's folder, or the ask shown's. */
const filmOf = (
  place: ReviewPlace,
  films: ReadonlyArray<string>,
  histories: ReadonlyArray<ProductionHistory>,
  ask: Option.Option<AskShown>,
): Option.Option<string> =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: () => Option.none<string>(),
      Production: (p) => Option.flatMap(historyNamed(histories, p.production), (h) => h.film),
      Ask: (p) => Option.flatMap(shownAsk(ask, p.ask), (a) => a.film),
      Draft: () => Option.none<string>(),
      Folder: (p) => filmOfFolder(p.folder, films),
      Set: (p) => filmOfFolder(p.folder, films),
      Film: (p) => Option.some(p.film),
    }),
  );

/** The shell's page a place is: a film's choices are Choices; every other place sits under Films. */
const shellPageOf = (place: ReviewPlace): ShellPage =>
  Match.value(place).pipe(
    Match.tag('Film', (): ShellPage => 'choices'),
    Match.orElse((): ShellPage => 'films'),
  );

/** A place's depth below its part, for the crumb and the tab's title: a folder, a set's stack. */
const depthOf = (
  place: ReviewPlace,
  index: Option.Option<ReviewIndex>,
  histories: ReadonlyArray<ProductionHistory>,
  series: Option.Option<SeriesList>,
  ask: Option.Option<AskShown>,
): Option.Option<string> =>
  Match.value(place).pipe(
    Match.tags({
      Production: (p) =>
        Option.some(
          Option.match(historyNamed(histories, p.production), {
            onNone: () => p.production,
            onSome: (h) => `${h.title} · timeline`,
          }),
        ),
      Ask: (p) =>
        Option.some(
          Option.match(shownAsk(ask, p.ask), { onNone: () => 'ask', onSome: (a) => a.title }),
        ),
      Draft: (p) => Option.some(draftName(series, p.series, p.draft)),
      Folder: (p) => Option.some(folderName(index, p.folder)),
      Set: (p) => Option.some(`${setName(index, p.folder, p.point)} · stack`),
    }),
    Match.orElse(() => Option.none<string>()),
  );

/**
 * The review in the lab's shell: the page its place is, the film it is of,
 * the films the switcher offers; a move to another of the review's places
 * stays on the page (its players play on), any other page loads.
 */
const Shell = (props: { readonly children: JSX.Element }) => {
  const { state, actions, meta } = useReview();
  const films = () =>
    Option.getOrElse(
      Option.map(AsyncResult.value(state.films()), (f) => f.films),
      (): ReadonlyArray<string> => [],
    );
  const index = () => AsyncResult.value(state.index());
  const histories = useHistories();
  const film = () => filmOf(state.place(), films(), histories(), state.ask());
  const depth = () =>
    depthOf(state.place(), index(), histories(), AsyncResult.value(state.series()), state.ask());
  return (
    <PageShell
      page={() => shellPageOf(state.place())}
      film={film}
      lastFilm={state.place()._tag !== 'Draft' && state.place()._tag !== 'Ask'}
      crumb={depth}
      films={films}
      hub={meta.hub}
      host={meta.host}
      follow={(href) => {
        if (!Option.contains(pageAt(parseHref(href).pathname), 'review')) return false;
        actions.go(placeOf(href));
        return true;
      }}
    >
      {props.children}
    </PageShell>
  );
};

/**
 * The page `place` is on: Choices' card in focus (`?point=`) and a draft's
 * words selected are that page's own state, read from the URL by the page,
 * so a tap, a Back or a Forward moving them keeps the page (its player, its
 * open sheet, its take heard) instead of drawing it again.
 */
const pageOf = (place: ReviewPlace): ReviewPlace =>
  Match.value(place).pipe(
    Match.tag('Film', (p) => ReviewPlace.Film({ film: p.film, point: '' })),
    Match.tag('Draft', (p) =>
      ReviewPlace.Draft({ series: p.series, draft: p.draft, beat: '', words: '' }),
    ),
    Match.orElse(() => place),
  );

const Page = () => {
  const { state } = useReview();
  const page = createMemo(() => pageOf(state.place()), { equals: Equal.equals });
  return (
    <main class="rv-main">
      {Match.value(page()).pipe(
        Match.tagsExhaustive({
          Home: () => <Home />,
          Production: (p) => <ProductionPage production={p.production} v={p.v} />,
          Ask: (p) => <AskPage ask={p.ask} />,
          Draft: (p) => <DraftPage series={p.series} draft={p.draft} />,
          Folder: (p) => <FolderPage folder={p.folder} />,
          Set: (p) => <SetPage folder={p.folder} point={p.point} />,
          Film: (p) => <FilmPage film={p.film} />,
        }),
      )}
    </main>
  );
};

/** What the review is rendered with: its host, its commands and its client of the lab. */
interface ReviewWith {
  readonly host: Host;
  readonly hub: Hub;
  readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
}

/** The review: its shell, the page it is on, its context menu, the inspector, ⌘K, the `?` sheet and the receipts. */
const ReviewPage = (props: ReviewWith) => (
  <Root host={props.host} hub={props.hub} client={props.client}>
    <StudioFrame hub={props.hub} scope="review" legend={false}>
      <Inspecting hub={props.hub}>
        <Shell>
          <Page />
        </Shell>
      </Inspecting>
    </StudioFrame>
  </Root>
);

/** The review's page as the browser and the server both render it (`page-server.tsx`, `page-client.tsx`). */
export const REVIEW_PAGE = {
  bodyClass: 'rv',
  rootClass: 'rv-root',
  style: `${SHELL_CSS}${REVIEW_CSS}${COMMENTS_CSS}${COMMAND_CSS}`,
};

/**
 * The review over `host`, reading the lab through `client`: its commands
 * (`command/hub.ts`, their keys not yet heard) and its app, for the browser
 * to mount or hydrate and the server to render.
 */
export const reviewOn = (host: Host, client: Layer.Layer<LabClient | HttpClient.HttpClient>) =>
  studioOn('review', host, (hub) => () => <ReviewPage host={host} hub={hub} client={client} />);
