/**
 * The files beside the pages that tell crawlers and browsers about the site:
 * the sitemap, robots.txt and the web app manifest. Each is a pure function
 * of the pages and the origin, so the tests read them without a build.
 */
import { absolute, type Page } from './pages.ts';
import { CHANNEL } from './site.ts';

const xmlEscape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const sitemap = (pages: ReadonlyArray<Page>) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages
      .filter((page) => page.listed)
      .map((page) => `  <url><loc>${xmlEscape(absolute(page.path))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

export const robots = () =>
  ['User-agent: *', 'Allow: /', '', `Sitemap: ${absolute('/sitemap.xml')}`, ''].join('\n');

/** The brand's parchment ground (`--color-ground`), for the browser's own chrome. */
export const THEME_COLOR = '#f5eddb';

export const webManifest = () => ({
  name: CHANNEL.name,
  short_name: CHANNEL.name,
  start_url: '/',
  display: 'browser',
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});
