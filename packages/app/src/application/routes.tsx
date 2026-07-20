import { A, Navigate, Route, useLocation, useNavigate } from '@solidjs/router';
import { Errored, Loading, Show } from '@solidjs/web';
import { createEffect, createMemo } from 'solid-js';

import { Plans, Practice, Settings, Topics } from '../library/index.js';
import {
  BibleReader,
  BibleSearch,
  ReaderLoading,
  WritingsCatalog,
  WritingsPageReader,
  WritingsParagraphReader,
  WritingsPublicationReader,
} from '../reading/index.js';
import { decodeRoute, encodeRoute, readingRouteForLocation } from '../route/index.js';
import { useReadingData } from '../runtime/index.js';

const BibleRoute = () => {
  const location = useLocation();
  const reference = createMemo(() => {
    const route = decodeRoute(`${location.pathname}${location.search}`);
    if (route?._tag === 'bible') return route.reference;
    return undefined;
  });
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <BibleReader reference={current()} />}
    </Show>
  );
};

const WritingsPageRoute = () => {
  const location = useLocation();
  const reference = createMemo(() => {
    const route = decodeRoute(`${location.pathname}${location.search}`);
    if (route?._tag === 'writings' && route.reference._tag === 'page') return route.reference;
    return undefined;
  });
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WritingsPageReader reference={current()} />}
    </Show>
  );
};

const SearchRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(`${location.pathname}${location.search}`);
    if (decoded?._tag === 'search') return decoded;
    return undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <BibleSearch route={current()} />}
    </Show>
  );
};

const PublicationRoute = () => {
  const location = useLocation();
  const reference = createMemo(() => {
    const route = decodeRoute(location.pathname);
    if (route?._tag === 'writings' && route.reference._tag === 'publication') {
      return route.reference;
    }
    return undefined;
  });
  return (
    <Show when={reference()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <WritingsPublicationReader reference={current()} />}
    </Show>
  );
};

const ParagraphRoute = () => {
  const location = useLocation();
  const reference = createMemo(() => {
    const route = decodeRoute(location.pathname);
    if (route?._tag === 'writings' && route.reference._tag === 'paragraph') {
      return route.reference;
    }
    return undefined;
  });
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
    <A href="/bible/1/1">Open Genesis 1</A>
  </section>
);

const NotFoundRoute = () => {
  const location = useLocation();
  return <NotFoundContent requestedPath={location.pathname} />;
};

const ResumeReading = () => {
  const data = useReadingData();
  const navigate = useNavigate();
  const fallback = '/bible/1/1';

  createEffect(
    () => {
      const route = readingRouteForLocation(data.readingContinuity.get()());
      if (route) return encodeRoute(route);
      return fallback;
    },
    (target) => navigate(target, { replace: true }),
  );

  return null;
};

const RootRoute = () => {
  const fallback = '/bible/1/1';
  return (
    <Errored fallback={() => <Navigate href={fallback} />}>
      <Loading fallback={<ReaderLoading label="Opening your last passage" />}>
        <ResumeReading />
      </Loading>
    </Errored>
  );
};

const SettingsRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(location.pathname);
    if (decoded?._tag === 'settings') return decoded;
    return undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Settings section={current().section} />}
    </Show>
  );
};

const PlansRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(location.pathname);
    if (decoded?._tag === 'plans') return decoded;
    return undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Plans planId={current().planId} />}
    </Show>
  );
};

const PracticeRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(location.pathname);
    if (decoded?._tag === 'practice') return decoded;
    return undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Practice memoryVerseId={current().memoryVerseId} />}
    </Show>
  );
};

const TopicsRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(location.pathname);
    if (decoded?._tag === 'topics') return decoded;
    return undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Topics topicId={current().topicId} />}
    </Show>
  );
};

export const SharedRoutes = () => (
  <>
    <Route path="/" component={RootRoute} />
    <Route path="/bible/:book/:chapter/:verse?" component={BibleRoute} />
    <Route path="/writings" component={WritingsCatalog} />
    <Route path="/writings/:publicationId" component={PublicationRoute} />
    <Route path="/writings/:publicationId/page/:page" component={WritingsPageRoute} />
    <Route path="/writings/:publicationId/p/:paragraphId" component={ParagraphRoute} />
    <Route path="/search" component={SearchRoute} />
    <Route path="/topics/:topicId?" component={TopicsRoute} />
    <Route path="/settings/:section?" component={SettingsRoute} />
    <Route path="/plans/:planId?" component={PlansRoute} />
    <Route path="/practice/:memoryVerseId?" component={PracticeRoute} />
    <Route path="*404" component={NotFoundRoute} />
  </>
);
