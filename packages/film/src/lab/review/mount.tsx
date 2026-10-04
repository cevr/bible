// The review page's entry (`/`, served by `film lab`): the header (where the page is,
// and its tools), the page itself, and the lightbox, in Solid 2 over the
// review's routes on the page's own origin.

import { For, Show, render } from '@solidjs/web';
import { Location } from '@bible/url-state';
import { Effect, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createEffect } from 'solid-js';
import type { ReviewIndex } from '../../core/review.ts';
import { Go, Root, useReview } from './context.tsx';
import { Inspecting } from './inspector.tsx';
import { folderTitle, pressed } from './format.ts';
import { type ReviewPlace, ReviewPlace as Place } from './place.ts';
import { ProjectPage } from './options/project.tsx';
import { FilmPage } from './options/section.tsx';
import { FolderPage, Home, QualityToggle, SetPage } from './section.tsx';
import { REVIEW_CSS } from './style.ts';
import { pageHref } from '../../core/api.ts';
import { type Host, addressOn, hostOf } from '../../browser/host.ts';
import { BrowserHost } from '../../browser/host-browser.ts';
import { TabStore, ViewerStore } from '../../browser/storage-browser.ts';
import { type Hub, makeHub } from '../../command/hub.ts';
import { CommandMenu } from '../command/command-menu.tsx';
import { KeysSheet } from '../command/keys-sheet.tsx';
import { Receipts } from '../command/receipts.tsx';
import { TargetMenu } from '../command/context-menu.tsx';
import { COMMAND_CSS } from '../command/style.ts';

/** The trail to `place`: each step's title, and where it goes (none for the page itself). */
interface Crumb {
  readonly title: string;
  readonly place: Option.Option<ReviewPlace>;
}

/** The trail to `place`, titled from the index once read. */
const crumbsOf = (place: ReviewPlace, index: Option.Option<ReviewIndex>): ReadonlyArray<Crumb> => {
  const folderAt = (ref: string) =>
    Option.flatMap(index, (i) => Option.fromUndefinedOr(i.folders.find((f) => f.ref === ref)));
  const folder = (ref: string) =>
    Option.getOrElse(Option.map(folderAt(ref), folderTitle), () => ref);
  const set = (ref: string, point: string) =>
    Option.getOrElse(
      Option.flatMap(folderAt(ref), (f) =>
        Option.map(Option.fromUndefinedOr(f.sets.find((s) => s.id === point)), (s) => s.title),
      ),
      () => point,
    );
  return Match.value(place).pipe(
    Match.tagsExhaustive({
      Home: (): ReadonlyArray<Crumb> => [],
      Folder: (p): ReadonlyArray<Crumb> => [{ title: folder(p.folder), place: Option.none() }],
      Set: (p): ReadonlyArray<Crumb> => [
        { title: folder(p.folder), place: Option.some(Place.Folder({ folder: p.folder })) },
        { title: set(p.folder, p.point), place: Option.none() },
      ],
      Film: (p): ReadonlyArray<Crumb> => [{ title: `${p.film} · choices`, place: Option.none() }],
      Project: (p): ReadonlyArray<Crumb> => [
        { title: `${p.film} · project`, place: Option.none() },
      ],
    }),
  );
};

/** The film a place is about (its choices or its project), for its lab link. */
const filmOf = (place: ReviewPlace): Option.Option<string> =>
  Match.value(place).pipe(
    Match.tags({ Film: (p) => Option.some(p.film), Project: (p) => Option.some(p.film) }),
    Match.orElse(() => Option.none()),
  );

const Header = () => {
  const { state, actions } = useReview();
  const crumbs = () => crumbsOf(state.place(), AsyncResult.value(state.index()));
  createEffect(crumbs, (trail) => {
    document.title = [...trail.map((c) => c.title).toReversed(), 'Lab'].join(' · ');
  });
  return (
    <header class="rv-header">
      <nav class="rv-crumbs">
        <Go place={Place.Home()}>
          <b>Lab</b>
        </Go>
        <For each={crumbs()}>
          {(crumb) => (
            <>
              <span class="rv-hint">/</span>
              {Option.match(crumb.place, {
                onNone: () => <b>{crumb.title}</b>,
                onSome: (place) => <Go place={place}>{crumb.title}</Go>,
              })}
            </>
          )}
        </For>
      </nav>
      <span class="rv-spacer" />
      <div class="rv-row rv-tools">
        <Show when={Option.getOrUndefined(filmOf(state.place()))}>
          {(film) => (
            <a class="rv-chip" href={pageHref.lab(film())} data-act="lab">
              Lab
            </a>
          )}
        </Show>
        <Show when={state.place()._tag === 'Home'} fallback={<QualityToggle />}>
          <input
            type="search"
            class="rv-filter"
            placeholder="Filter folders"
            value={state.filter()}
            onInput={(e) => actions.filter(e.currentTarget.value)}
          />
          <button
            type="button"
            class="rv-chip"
            data-act="refresh"
            aria-busy={pressed(AsyncResult.isWaiting(state.index()))}
            onClick={actions.refresh}
          >
            Refresh
          </button>
        </Show>
      </div>
    </header>
  );
};

const Page = () => {
  const { state } = useReview();
  return (
    <main class="rv-main">
      {Match.value(state.place()).pipe(
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

/** The review: its header, the page it is on, the lightbox, its context menu, the inspector, ⌘K, the `?` sheet and the receipts. */
const ReviewPage = (props: { readonly host: Host; readonly hub: Hub }) => (
  <Root host={props.host} hub={props.hub}>
    <TargetMenu hub={props.hub}>
      <Inspecting hub={props.hub}>
        <Header />
        <Page />
        <Lightbox />
      </Inspecting>
      <CommandMenu hub={props.hub} />
      <KeysSheet hub={props.hub} />
      <Receipts hub={props.hub} tab={TabStore} scope="review" />
    </TargetMenu>
  </Root>
);

/**
 * Mount the review into the page, with its styles, over the page's host
 * (`browser/host.ts`), with its commands and their one key listener
 * (`command/hub.ts`).
 */
export const mountReview = (): void => {
  const host = hostOf(BrowserHost.layer);
  Effect.runSyncWith(host)(
    Effect.gen(function* () {
      const style = document.createElement('style');
      style.textContent = `${REVIEW_CSS}${COMMAND_CSS}`;
      document.head.append(style);
      document.body.classList.add('rv');
      const address = addressOn(host);
      const hub = yield* makeHub('review', address.href, ViewerStore);
      yield* Effect.forkDetach(hub.listen);
      const root = document.createElement('div');
      root.className = 'rv-root';
      document.body.append(root);
      render(() => <ReviewPage host={host} hub={hub} />, root);
      const { href } = yield* Location.use((bar) => bar.current);
      yield* Effect.logInfo(`review.mounted href=${href}`);
    }),
  );
};
