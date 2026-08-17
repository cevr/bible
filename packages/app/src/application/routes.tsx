import { defineRoutes, useLocation, useNavigate } from '@solidjs/router';
import { Errored, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, createMemo } from 'solid-js';

import { Plans, Practice, Settings, Topics } from '../library/index.js';
import {
  BibleReader,
  BibleSearch,
  ReaderLoading,
  WikiTopicPage,
  WritingsCatalog,
  WritingsPageReader,
  WritingsParagraphReader,
  WritingsPublicationReader,
} from '../reading/index.js';
import type { AppRoute } from '../route/index.js';
import { decodeRoute, encodeRoute, readingRouteForLocation } from '../route/index.js';
import { useReadingContinuity } from '../runtime/index.js';

/** Decodes the location and projects the slice a route component renders;
 *  `Show` receives the projection through `Option.getOrUndefined`. */
const routeSlice = <A,>(path: string, select: (route: AppRoute) => Option.Option<A>) =>
  Option.getOrUndefined(Option.flatMap(decodeRoute(path), select));

const BibleRoute = () => {
  const location = useLocation();
  const reference = createMemo(() =>
    routeSlice(`${location.pathname}${location.search}`, (route) => {
      if (route._tag === 'bible') return Option.some(route.reference);
      return Option.none();
    }),
  );
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <BibleReader reference={current()} />}
    </Show>
  );
};

const WritingsPageRoute = () => {
  const location = useLocation();
  const reference = createMemo(() =>
    routeSlice(`${location.pathname}${location.search}`, (route) => {
      if (route._tag === 'writings' && route.reference._tag === 'page') {
        return Option.some(route.reference);
      }
      return Option.none();
    }),
  );
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WritingsPageReader reference={current()} />}
    </Show>
  );
};

const SearchRoute = () => {
  const location = useLocation();
  const route = createMemo(() =>
    routeSlice(`${location.pathname}${location.search}`, (decoded) => {
      if (decoded._tag === 'search') return Option.some(decoded);
      return Option.none();
    }),
  );
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <BibleSearch route={current()} />}
    </Show>
  );
};

const PublicationRoute = () => {
  const location = useLocation();
  const reference = createMemo(() =>
    routeSlice(location.pathname, (route) => {
      if (route._tag === 'writings' && route.reference._tag === 'publication') {
        return Option.some(route.reference);
      }
      return Option.none();
    }),
  );
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WritingsPublicationReader reference={current()} />}
    </Show>
  );
};

const ParagraphRoute = () => {
  const location = useLocation();
  const reference = createMemo(() =>
    routeSlice(location.pathname, (route) => {
      if (route._tag === 'writings' && route.reference._tag === 'paragraph') {
        return Option.some(route.reference);
      }
      return Option.none();
    }),
  );
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WritingsParagraphReader reference={current()} />}
    </Show>
  );
};

const NotFoundContent = (props: { readonly requestedPath: string }) => (
  <section class="bible-empty-route">
    <p class="bible-reader__eyebrow">Not found</p>
    <h1>This page is not in the library.</h1>
    <p>
      No canonical reading route matches <code>{props.requestedPath}</code>.
    </p>
    <a href="/bible/1/1">Open Genesis 1</a>
  </section>
);

const NotFoundRoute = () => {
  const location = useLocation();
  return <NotFoundContent requestedPath={location.pathname} />;
};

const ResumeReading = () => {
  const continuity = useReadingContinuity();
  const navigate = useNavigate();
  const fallback = '/bible/1/1';

  createEffect(
    () => {
      const route = readingRouteForLocation(continuity());
      return Option.match(route, {
        onNone: () => fallback,
        onSome: encodeRoute,
      });
    },
    (target) => navigate(target, { replace: true }),
  );

  return <></>;
};

/** Replacement for the removed `<Navigate>` component: navigates once the
 *  effect graph settles, replacing the current history entry. */
const RedirectTo = (props: { readonly href: string }) => {
  const navigate = useNavigate();
  createEffect(
    () => props.href,
    (target) => navigate(target, { replace: true }),
  );
  return <></>;
};

const RootRoute = () => {
  const fallback = '/bible/1/1';
  return (
    <Errored fallback={() => <RedirectTo href={fallback} />}>
      <Loading fallback={<ReaderLoading label="Opening your last passage" />}>
        <ResumeReading />
      </Loading>
    </Errored>
  );
};

const SettingsRoute = () => {
  const location = useLocation();
  const route = createMemo(() =>
    routeSlice(location.pathname, (decoded) => {
      if (decoded._tag === 'settings') return Option.some(decoded);
      return Option.none();
    }),
  );
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Settings section={current().section} />}
    </Show>
  );
};

const PlansRoute = () => {
  const location = useLocation();
  const route = createMemo(() =>
    routeSlice(location.pathname, (decoded) => {
      if (decoded._tag === 'plans') return Option.some(decoded);
      return Option.none();
    }),
  );
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Plans planId={current().planId} />}
    </Show>
  );
};

const PracticeRoute = () => {
  const location = useLocation();
  const route = createMemo(() =>
    routeSlice(location.pathname, (decoded) => {
      if (decoded._tag === 'practice') return Option.some(decoded);
      return Option.none();
    }),
  );
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Practice memoryVerseId={current().memoryVerseId} />}
    </Show>
  );
};

const TopicsRoute = () => {
  const location = useLocation();
  const route = createMemo(() =>
    routeSlice(location.pathname, (decoded) => {
      if (decoded._tag === 'topics') return Option.some(decoded);
      return Option.none();
    }),
  );
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Topics topicId={current().topicId} />}
    </Show>
  );
};

/** The one wiki topic route (§10 M6: "web and desktop share one route in
 *  `routes.tsx`, one peek component, one breadcrumb").
 *
 *  The slug arrives as a URL segment — untrusted input — and is branded by the
 *  **decoder**, which is the one place a path becomes an `AppRoute`. A segment
 *  that is not a slug fails to decode and renders the not-found content, so this
 *  component neither re-brands nor re-validates. */
const WikiRoute = () => {
  const location = useLocation();
  const slug = createMemo(() =>
    routeSlice(location.pathname, (decoded) => {
      if (decoded._tag === 'wiki') return Option.some(decoded.slug);
      return Option.none();
    }),
  );
  return (
    <Show when={slug()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WikiTopicPage slug={current()} />}
    </Show>
  );
};

export const sharedRoutes = defineRoutes([
  { path: '/', component: RootRoute },
  { path: '/bible/:book/:chapter/:verse?', component: BibleRoute },
  { path: '/writings', component: WritingsCatalog },
  { path: '/writings/:publicationId', component: PublicationRoute },
  { path: '/writings/:publicationId/page/:page', component: WritingsPageRoute },
  { path: '/writings/:publicationId/p/:paragraphId', component: ParagraphRoute },
  { path: '/search', component: SearchRoute },
  { path: '/topics/:topicId?', component: TopicsRoute },
  { path: '/wiki/:slug', component: WikiRoute },
  { path: '/settings/:section?', component: SettingsRoute },
  { path: '/plans/:planId?', component: PlansRoute },
  { path: '/practice/:memoryVerseId?', component: PracticeRoute },
  { path: '*404', component: NotFoundRoute },
]);
