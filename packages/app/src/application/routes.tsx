import { A, Navigate, Route, useLocation } from '@solidjs/router';
import { Show } from '@solidjs/web';
import { createMemo } from 'solid-js';

import { Plans, Practice, Settings, Topics } from '../library/index.js';
import {
  BibleReader,
  BibleSearch,
  WritingsCatalog,
  WritingsPageReader,
  WritingsParagraphReader,
  WritingsPublicationReader,
} from '../reading/index.js';
import { decodeRoute } from '../route/index.js';

const BibleRoute = () => {
  const location = useLocation();
  const reference = createMemo(() => {
    const route = decodeRoute(`${location.pathname}${location.search}`);
    return route?._tag === 'bible' ? route.reference : undefined;
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
    return route?._tag === 'writings' && route.reference._tag === 'page'
      ? route.reference
      : undefined;
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
    return decoded?._tag === 'search' ? decoded : undefined;
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
    return route?._tag === 'writings' && route.reference._tag === 'publication'
      ? route.reference
      : undefined;
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
    return route?._tag === 'writings' && route.reference._tag === 'paragraph'
      ? route.reference
      : undefined;
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

const SettingsRoute = () => {
  const location = useLocation();
  const route = createMemo(() => {
    const decoded = decodeRoute(location.pathname);
    return decoded?._tag === 'settings' ? decoded : undefined;
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
    return decoded?._tag === 'plans' ? decoded : undefined;
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
    return decoded?._tag === 'practice' ? decoded : undefined;
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
    return decoded?._tag === 'topics' ? decoded : undefined;
  });
  return (
    <Show when={route()} fallback={<NotFoundContent requestedPath={location.pathname} />}>
      {(current) => <Topics topicId={current().topicId} />}
    </Show>
  );
};

export const SharedRoutes = () => (
  <>
    <Route path="/" component={() => <Navigate href="/bible/1/1" />} />
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
