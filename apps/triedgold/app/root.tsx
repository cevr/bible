import './app.css';

import { DateTime, Effect } from 'effect';
import type { ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';

import { brandCss, fonts, schemes } from '../src/brand';
import type { Route } from './+types/root';
import { SiteHeader } from './components/site-header';

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: fonts.stylesheet },
  { rel: 'icon', href: '/favicon.ico' },
];

export const meta: Route.MetaFunction = () => [
  { title: 'Tried Gold' },
  {
    name: 'description',
    content:
      'Tried Gold Ministries: timeless truths from the Bible for uncertain times. "When he hath tried me, I shall come forth as gold" (Job 23:10).',
  },
];

export function Layout(props: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="theme-color"
          content={schemes.light.ground}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={schemes.dark.ground}
          media="(prefers-color-scheme: dark)"
        />
        <style>{brandCss}</style>
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <SiteHeader />
        {props.children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** The copyright year, read on the server when the page renders. */
export const loader = () =>
  Effect.runPromise(
    Effect.map(DateTime.now, (now) => ({ year: DateTime.getPartUtc(now, 'year') })),
  );

export default function App(props: Route.ComponentProps) {
  return (
    <>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="px-4 py-6 text-center text-sm text-muted">
        <div className="container mx-auto">© {props.loaderData.year} by Tried Gold Ministries.</div>
      </footer>
    </>
  );
}

function Message(props: { readonly title: string; readonly detail: string }) {
  return (
    <main className="container mx-auto max-w-4xl flex-1 px-4 py-12">
      <h1 className="mb-4 text-4xl font-semibold text-ink">{props.title}</h1>
      <p className="text-muted">{props.detail}</p>
    </main>
  );
}

export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const error = props.error;
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <Message title="404" detail="The requested page could not be found." />;
  }
  if (isRouteErrorResponse(error) && error.statusText !== '') {
    return <Message title="Error" detail={error.statusText} />;
  }
  return <Message title="Oops!" detail="An unexpected error occurred." />;
}
