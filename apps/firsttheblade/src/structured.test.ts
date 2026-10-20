import { describe, expect, test } from 'bun:test';

import { SERIES, type Series } from './content.ts';
import { lastModified, llmsTxt, sitemap } from './meta.ts';
import { absolute, PAGES, type Page } from './pages.ts';
import { CHANNEL } from './site.ts';
import { graphOf, jsonLd } from './structured.ts';

const typesOf = (page: Page) => graphOf(page).map((node) => node['@type']);
const nodeOf = (page: Page, type: string) => graphOf(page).find((node) => node['@type'] === type);

const pageAt = (path: string) => PAGES.find((page) => page.path === path) ?? PAGES[0]!;

/** A series with one published film, as its page will be once the first is out. */
const withFilm: Series = {
  ...SERIES[0]!,
  episodes: [
    {
      no: '01',
      title: 'In Its Order',
      youtubeId: 'abc123DEF45',
      published: '2026-11-07',
      summary: 'Why the Bible serves its truths in an order.',
    },
  ],
};
const filmPage: Page = {
  ...pageAt(`/series/${withFilm.slug}`),
  view: { _tag: 'Series', series: withFilm },
};

describe('the structured data', () => {
  test('every listed page names the channel as its publisher, and its YouTube channel as the same one', () => {
    for (const page of PAGES.filter((candidate) => candidate.listed)) {
      expect(nodeOf(page, 'Organization')).toMatchObject({
        name: CHANNEL.name,
        sameAs: [CHANNEL.url],
      });
      expect(typesOf(page)).toContain('WebSite');
    }
  });

  test('a series page holds its series and the trail home → series', () => {
    for (const series of SERIES) {
      const page = pageAt(`/series/${series.slug}`);
      expect(nodeOf(page, 'CreativeWorkSeries')).toMatchObject({ name: series.name });
      expect(nodeOf(page, 'BreadcrumbList')).toMatchObject({
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: CHANNEL.name, item: absolute('/') },
          { '@type': 'ListItem', position: 2, name: series.name, item: absolute(page.path) },
        ],
      });
    }
  });

  test('a published film is a video in its series, with its picture and its day', () => {
    expect(nodeOf(filmPage, 'CreativeWorkSeries')).toMatchObject({
      hasPart: [
        {
          '@type': 'VideoObject',
          uploadDate: '2026-11-07',
          thumbnailUrl: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
          embedUrl: 'https://www.youtube.com/embed/abc123DEF45',
        },
      ],
    });
  });

  test('the not-found page carries none', () => {
    expect(graphOf(pageAt('/404'))).toEqual([]);
  });

  test('no string in it can close its script element', () => {
    const page: Page = { ...pageAt('/'), description: 'a </script> in the words' };
    expect(jsonLd(page)).not.toContain('</script>');
    expect(jsonLd(page)).toContain('a \\u003c/script> in the words');
  });
});

describe('the dates and the crawler files', () => {
  test('a series page is dated by its newest film, and a page with none carries no date', () => {
    expect(lastModified(filmPage)).toEqual(['2026-11-07']);
    expect(sitemap([filmPage])).toContain('<lastmod>2026-11-07</lastmod>');
    expect(sitemap(PAGES)).not.toContain('<lastmod>');
  });

  test('llms.txt lists every listed page and the channel', () => {
    const text = llmsTxt(PAGES);
    expect(text).toContain(CHANNEL.url);
    for (const page of PAGES.filter((candidate) => candidate.listed)) {
      expect(text).toContain(absolute(page.path));
    }
    expect(text).not.toContain('/404');
  });
});
