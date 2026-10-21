/**
 * The site's pages as data: where each is served, the file the prerender
 * writes for it, and what its head says (title, description, the card a link
 * to it shows). The prerender draws each one (`./views.tsx`); the sitemap
 * lists every listed page: not the not-found page, nor the email list's
 * notices, which only its routes send people to (`./mail/paths.ts`).
 */
import { MARK_4_28, SERIES, type Series } from './content.ts';
import { MAIL_PAGES } from './mail/paths.ts';
import { CHANNEL, ORIGIN } from './site.ts';

/** The email list's pages that tell how a step went, each by its key in `MAIL_PAGES`. */
export type NoticeId = Exclude<keyof typeof MAIL_PAGES, 'confirm' | 'leave'>;

export type PageView =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'About' }
  | { readonly _tag: 'Series'; readonly series: Series }
  | { readonly _tag: 'Privacy' }
  | { readonly _tag: 'Notice'; readonly notice: NoticeId }
  | { readonly _tag: 'Confirm' }
  | { readonly _tag: 'Leave' }
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
  'Short films and talks on what the Bible teaches, starting with the first things. A new channel on YouTube.';

const title = (name: string) => `${name} · ${CHANNEL.name}`;

const seriesPage = (series: Series): Page => ({
  path: `/series/${series.slug}`,
  file: `series/${series.slug}.html`,
  title: title(series.name),
  description: `${series.line} A series of ${series.form.toLowerCase()} from ${CHANNEL.name}.`,
  image: `/og/${series.id}.jpg`,
  imageAlt: `${series.name}, a series from ${CHANNEL.name}.`,
  listed: true,
  view: { _tag: 'Series', series },
});

/** Each notice's title, which is also its heading. */
export const NOTICE_TITLES: Readonly<Record<NoticeId, string>> = {
  check: 'Check your inbox',
  confirmed: 'You are on the list',
  expired: 'This link has run out',
  address: 'Check your email address',
  busy: 'Too many tries',
  left: 'You have left the list',
  badLink: 'This link does not work',
};

const HOME_CARD = {
  image: '/og/home.jpg',
  imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
} as const;

/** A page of the email list's, served only where its routes send people. */
const listPage = (path: string, name: string, view: PageView): Page => ({
  path,
  file: `${path.slice(1)}.html`,
  title: title(name),
  description: DESCRIPTION,
  ...HOME_CARD,
  listed: false,
  view,
});

const NOTICES: ReadonlyArray<NoticeId> = [
  'check',
  'confirmed',
  'expired',
  'address',
  'busy',
  'left',
  'badLink',
];

export const PRIVACY_PATH = '/privacy';

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
    description: `What ${CHANNEL.name} is, and where its name comes from.`,
    image: '/og/home.jpg',
    imageAlt: `${CHANNEL.name}: “${MARK_4_28.text}” ${MARK_4_28.ref}.`,
    listed: true,
    view: { _tag: 'About' },
  },
  ...SERIES.map(seriesPage),
  {
    path: PRIVACY_PATH,
    file: 'privacy.html',
    title: title('Privacy'),
    description: `What the ${CHANNEL.name} email list keeps about you, and how to leave it.`,
    ...HOME_CARD,
    listed: true,
    view: { _tag: 'Privacy' },
  },
  ...NOTICES.map((notice) =>
    listPage(MAIL_PAGES[notice], NOTICE_TITLES[notice], { _tag: 'Notice', notice }),
  ),
  listPage(MAIL_PAGES.confirm, 'Confirm your email', { _tag: 'Confirm' }),
  listPage(MAIL_PAGES.leave, 'Leave the list', { _tag: 'Leave' }),
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
