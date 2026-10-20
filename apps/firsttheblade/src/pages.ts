/**
 * The site's pages as data: where each is served, the file the prerender
 * writes for it, and what its head says (title, description, the card a link
 * to it shows). The prerender draws each one (`./views.tsx`); the sitemap
 * lists every page but the not-found one.
 */
import { MARK_4_28, SERIES, type Series } from './content.ts';
import { CHANNEL, ORIGIN } from './site.ts';

export type PageView =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'About' }
  | { readonly _tag: 'Series'; readonly series: Series }
  | { readonly _tag: 'NotFound' };

export interface Page {
  /** The path it is served at (`/about`); `htmlHandling` serves `about.html` there. */
  readonly path: string;
  /** The file the prerender writes, relative to `dist/`. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** The link card: a 1200 × 630 picture under `public/og/`. */
  readonly image: string;
  readonly imageAlt: string;
  /** Whether search engines and the sitemap list it. */
  readonly listed: boolean;
  readonly view: PageView;
}

export const DESCRIPTION =
  'Short films and plain talks that set the Bible out one step at a time, for anyone who will come and see. New on YouTube.';

const title = (name: string) => `${name} · ${CHANNEL.name}`;

const seriesPage = (series: Series): Page => ({
  path: `/series/${series.slug}`,
  file: `series/${series.slug}.html`,
  title: title(series.name),
  description: `${series.line} ${series.subject}, in ${series.form.toLowerCase()}, from ${CHANNEL.name}.`,
  image: `/og/${series.id}.jpg`,
  imageAlt: `${series.name}, a series from ${CHANNEL.name}.`,
  listed: true,
  view: { _tag: 'Series', series },
});

export const PAGES: ReadonlyArray<Page> = [
  {
    path: '/',
    file: 'index.html',
    title: CHANNEL.name,
    description: DESCRIPTION,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: true,
    view: { _tag: 'Home' },
  },
  {
    path: '/about',
    file: 'about.html',
    title: title('About'),
    description: `What ${CHANNEL.name} is, where its name comes from, and how its films and talks are made.`,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: true,
    view: { _tag: 'About' },
  },
  ...SERIES.map(seriesPage),
  {
    path: '/404',
    file: '404.html',
    title: title('Page not found'),
    description: DESCRIPTION,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: false,
    view: { _tag: 'NotFound' },
  },
];

/** An absolute URL on the canonical origin. */
export const absolute = (path: string) => `${ORIGIN}${path}`;
