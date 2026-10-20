/**
 * A page's structured data, as schema.org JSON-LD: who publishes the site and
 * where else it is found (the YouTube channel), the site, the page, the trail
 * back to the home page, and on a series page the series and each of its
 * films. Search engines read it to name the channel and to draw a film's
 * result with its picture and date. A pure function of the page, so the tests
 * read it without a build; the not-found page carries none.
 */
import { Match, Schema } from 'effect';

import type { Episode, Series } from './content.ts';
import { absolute, DESCRIPTION, type Page } from './pages.ts';
import { CHANNEL, ORIGIN } from './site.ts';

const ORGANIZATION = `${ORIGIN}/#organization`;
const WEBSITE = `${ORIGIN}/#website`;
const ref = (id: string) => ({ '@id': id });

const organization = {
  '@type': 'Organization',
  '@id': ORGANIZATION,
  name: CHANNEL.name,
  url: absolute('/'),
  logo: { '@type': 'ImageObject', url: absolute('/icon-512.png'), width: 512, height: 512 },
  sameAs: [CHANNEL.url],
};

const website = {
  '@type': 'WebSite',
  '@id': WEBSITE,
  name: CHANNEL.name,
  url: absolute('/'),
  description: DESCRIPTION,
  inLanguage: 'en',
  publisher: ref(ORGANIZATION),
};

const watchUrl = (episode: Episode) => `https://www.youtube.com/watch?v=${episode.youtubeId}`;

const video = (series: Series, seriesId: string, episode: Episode) => ({
  '@type': 'VideoObject',
  name: `${episode.title} · ${series.name} ${episode.no}`,
  description: episode.summary,
  thumbnailUrl: `https://i.ytimg.com/vi/${episode.youtubeId}/hqdefault.jpg`,
  uploadDate: episode.published,
  url: watchUrl(episode),
  embedUrl: `https://www.youtube.com/embed/${episode.youtubeId}`,
  inLanguage: 'en',
  isPartOf: ref(seriesId),
  publisher: ref(ORGANIZATION),
});

const creativeSeries = (page: Page, series: Series) => {
  const id = `${absolute(page.path)}#series`;
  return {
    '@type': 'CreativeWorkSeries',
    '@id': id,
    name: series.name,
    description: series.line,
    about: series.subject,
    url: absolute(page.path),
    image: absolute(page.image),
    inLanguage: 'en',
    publisher: ref(ORGANIZATION),
    hasPart: series.episodes.map((episode) => video(series, id, episode)),
  };
};

const PAGE_TYPE = { Home: 'WebPage', About: 'AboutPage', Series: 'CollectionPage' } as const;

const trail = (page: Page, name: string) => ({
  '@type': 'BreadcrumbList',
  '@id': `${absolute(page.path)}#breadcrumb`,
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: CHANNEL.name, item: absolute('/') },
    { '@type': 'ListItem', position: 2, name, item: absolute(page.path) },
  ],
});

const webPage = <Extra extends object>(page: Page, type: string, extra: Extra) => ({
  '@type': type,
  '@id': `${absolute(page.path)}#webpage`,
  url: absolute(page.path),
  name: page.title,
  description: page.description,
  inLanguage: 'en',
  isPartOf: ref(WEBSITE),
  primaryImageOfPage: {
    '@type': 'ImageObject',
    url: absolute(page.image),
    width: 1200,
    height: 630,
  },
  ...extra,
});

/** Every node a page's JSON-LD graph holds, in the order it prints them. */
export const graphOf = (page: Page) =>
  Match.value(page.view).pipe(
    Match.tagsExhaustive({
      Home: () => [
        organization,
        website,
        webPage(page, PAGE_TYPE.Home, { about: ref(ORGANIZATION) }),
      ],
      About: () => {
        const crumbs = trail(page, 'About');
        return [
          organization,
          website,
          webPage(page, PAGE_TYPE.About, {
            about: ref(ORGANIZATION),
            breadcrumb: ref(crumbs['@id']),
          }),
          crumbs,
        ];
      },
      Series: (view) => {
        const crumbs = trail(page, view.series.name);
        const series = creativeSeries(page, view.series);
        return [
          organization,
          website,
          webPage(page, PAGE_TYPE.Series, {
            mainEntity: ref(series['@id']),
            breadcrumb: ref(crumbs['@id']),
          }),
          series,
          crumbs,
        ];
      },
      NotFound: () => [],
    }),
  );

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/**
 * The graph as the text of a `<script type="application/ld+json">`. A `<`
 * is written `<`, so no string in it can close the script element.
 */
export const jsonLd = (page: Page) =>
  encodeJson({ '@context': 'https://schema.org', '@graph': graphOf(page) }).replaceAll(
    '<',
    '\\u003c',
  );
