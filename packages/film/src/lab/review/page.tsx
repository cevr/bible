// The review page (`/`, served by `film lab`): the studio's shell
// (`PageShell`: the film switcher, the page bar, a drill-down crumb, Go
// to…), the page itself, and the lightbox, in Solid 2 over the review's
// routes on the page's own origin. The browser mounts it (`mount.tsx`) and
// the lab renders it on the server first (`server.tsx`), over the same
// components; neither side's own adapters are imported here.

import { type JSX, Show } from '@solidjs/web';
import { parseHref } from '@bible/url-state';
import { Effect, Equal, type Layer, Match, Option } from 'effect';
import type { HttpClient } from 'effect/http';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createEffect, createMemo } from 'solid-js';
import type { ReviewIndex } from '../../core/review.ts';
import { Root, useReview } from './context.tsx';
import { Inspecting } from './inspector.tsx';
import { folderTitle } from './format.ts';
import { ReviewPlace, placeOf } from './place.ts';
import { ProjectPage } from './options/project.tsx';
import { FilmPage } from './options/section.tsx';
import { FolderPage, Home, SetPage } from './section.tsx';
import { REVIEW_CSS } from './style.ts';
import { type Part, pageAt } from '../../core/api.ts';
import { type Host, addressOn } from '../../browser/host.ts';
import { TabStore, ViewerStore } from '../../browser/storage-browser.ts';
import { type Hub, makeHub } from '../../command/hub.ts';
import { CommandMenu } from '../command/command-menu.tsx';
import { KeysSheet } from '../command/keys-sheet.tsx';
import { Receipts } from '../command/receipts.tsx';
import { TargetMenu } from '../command/context-menu.tsx';
import { COMMAND_CSS } from '../command/style.ts';
import { PageShell } from '../page-shell.tsx';
import { SHELL_CSS } from '../page-shell-style.ts';
import { SCENES_CSS } from '../scenes/style.ts';
import type { LabClient } from '../api.ts';
import type { Films } from '../../player/main.ts';

/** A folder's title from the index once read, else its ref. */
const folderName = (index: Option.Option<ReviewIndex>, ref: string): string =>
  Option.getOrElse(
    Option.map(
      Option.flatMap(index, (i) => Option.fromUndefinedOr(i.folders.find((f) => f.ref === ref))),
      folderTitle,
    ),
    () => ref,
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

/**
 * The film a folder of renders is of: the film its ref names in its last
 * segment (`bible-tools/righteousness-by-faith`), when there is one.
 */
const filmOfFolder = (ref: string, films: ReadonlyArray<string>): Option.Option<string> =>
  Option.fromUndefinedOr(films.find((film) => ref === film || ref.endsWith(`/${film}`)));

/** The film a place is about: a film's choices or project, or a set in that film's folder. */
const filmOf = (place: ReviewPlace, films: ReadonlyArray<string>): Option.Option<string> =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: () => Option.none<string>(),
      Folder: (p) => filmOfFolder(p.folder, films),
      Set: (p) => filmOfFolder(p.folder, films),
      Film: (p) => Option.some(p.film),
      Project: (p) => Option.some(p.film),
    }),
  );

/**
 * The part a place sits under: a film's choices and project are theirs; a
 * set sits under its film's Project when its folder names one (Frame.io's
 * version stack on its asset), under Films otherwise, as a folder does.
 */
const partOf = (place: ReviewPlace, films: ReadonlyArray<string>): Part =>
  Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: (): Part => 'films',
      Folder: (): Part => 'films',
      Set: (p): Part =>
        Option.match(filmOfFolder(p.folder, films), {
          onNone: () => 'films',
          onSome: () => 'project',
        }),
      Film: (): Part => 'choices',
      Project: (): Part => 'project',
    }),
  );

/** A place's depth below its part, for the crumb and the tab's title: a folder, a set's versions. */
const depthOf = (place: ReviewPlace, index: Option.Option<ReviewIndex>): Option.Option<string> =>
  Match.value(place).pipe(
    Match.tags({
      Folder: (p) => Option.some(folderName(index, p.folder)),
      Set: (p) => Option.some(`${setName(index, p.folder, p.point)} · versions`),
    }),
    Match.orElse(() => Option.none<string>()),
  );

/**
 * The review in the studio's shell: the part its place sits under, the film
 * it is of, the films the switcher offers; a move to another of the review's
 * places stays on the page (its players play on), any other part loads.
 */
const Shell = (props: { readonly children: JSX.Element }) => {
  const { state, actions, meta } = useReview();
  const films = () =>
    Option.getOrElse(
      Option.map(AsyncResult.value(state.films()), (f) => f.films),
      (): ReadonlyArray<string> => [],
    );
  const index = () => AsyncResult.value(state.index());
  const film = () => filmOf(state.place(), films());
  const depth = () => depthOf(state.place(), index());
  createEffect(
    () => [...Option.toArray(depth()), ...Option.toArray(film()), 'Lab'],
    (trail) => {
      document.title = trail.join(' · ');
    },
  );
  return (
    <PageShell
      part={() => partOf(state.place(), films())}
      film={film}
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
 * The page `place` is on: Choices' card in focus (`?point=`) is that page's
 * own state, read from the URL by the page, so a tap, a Back or a Forward
 * moving it keeps the page (its player, its open sheet) instead of drawing
 * it again.
 */
const pageOf = (place: ReviewPlace): ReviewPlace =>
  Match.value(place).pipe(
    Match.tag('Film', (p) => ReviewPlace.Film({ film: p.film, point: '' })),
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
          Folder: (p) => <FolderPage folder={p.folder} />,
          Set: (p) => <SetPage folder={p.folder} point={p.point} />,
          Film: (p) => <FilmPage film={p.film} />,
          Project: (p) => <ProjectPage film={p.film} />,
        }),
      )}
    </main>
  );
};

const Lightbox = () => {
  const { state, actions } = useReview();
  return (
    <Show when={Option.getOrUndefined(state.lightbox())}>
      {(src) => (
        <div class="rv-lightbox" onClick={() => actions.show(Option.none())}>
          <img src={src()} alt="" />
        </div>
      )}
    </Show>
  );
};

/** What the review is rendered with: its host, its commands, the app's films and its client of the lab. */
interface ReviewWith {
  readonly host: Host;
  readonly hub: Hub;
  readonly films: Films;
  readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
}

/** The review: its shell, the page it is on, the lightbox, its context menu, the inspector, ⌘K, the `?` sheet and the receipts. */
const ReviewPage = (props: ReviewWith) => (
  <Root host={props.host} hub={props.hub} films={props.films} client={props.client}>
    <TargetMenu hub={props.hub}>
      <Inspecting hub={props.hub}>
        <Shell>
          <Page />
        </Shell>
        <Lightbox />
      </Inspecting>
      <CommandMenu hub={props.hub} />
      <KeysSheet hub={props.hub} />
      <Receipts hub={props.hub} tab={TabStore} scope="review" />
    </TargetMenu>
  </Root>
);

/** The review's page as the browser and the server both render it (`page-server.tsx`, `page-client.tsx`). */
export const REVIEW_PAGE = {
  bodyClass: 'rv',
  rootClass: 'rv-root',
  style: `${SHELL_CSS}${REVIEW_CSS}${COMMAND_CSS}${SCENES_CSS}`,
};

/**
 * The review over `host`, reading the lab through `client`: its commands
 * (`command/hub.ts`, their keys not yet heard) and its app, for the browser
 * to mount or hydrate and the server to render.
 */
export const reviewOn = (
  host: Host,
  client: Layer.Layer<LabClient | HttpClient.HttpClient>,
  films: Films,
) =>
  Effect.map(makeHub('review', addressOn(host).href, ViewerStore), (hub) => ({
    hub,
    app: () => <ReviewPage host={host} hub={hub} films={films} client={client} />,
  })).pipe(Effect.provideContext(host));
