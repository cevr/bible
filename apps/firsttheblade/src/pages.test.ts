import { describe, expect, test } from 'bun:test';

import { MARK_4_28, SERIES } from './content.ts';
import { robots, sitemap, webManifest } from './meta.ts';
import { absolute, PAGES } from './pages.ts';
import { ORIGIN, SERVED_FROM } from './site.ts';

describe('the pages', () => {
  test('every page has its own path, file and title', () => {
    expect(new Set(PAGES.map((page) => page.path)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((page) => page.file)).size).toBe(PAGES.length);
    expect(new Set(PAGES.map((page) => page.title)).size).toBe(PAGES.length);
  });

  test('every series has a page, and a link card of its own', () => {
    for (const series of SERIES) {
      const page = PAGES.find((candidate) => candidate.path === `/series/${series.slug}`);
      expect(page?.file).toBe(`series/${series.slug}.html`);
      expect(page?.image).toBe(`/og/${series.id}.jpg`);
    }
  });

  test('absolute URLs start at the canonical origin, over HTTPS', () => {
    expect(ORIGIN).toStartWith('https://');
    expect(absolute('/about')).toBe(`${ORIGIN}/about`);
  });

  test('the site is served from its custom domain', () => {
    expect(SERVED_FROM).toBe('custom-domain');
    expect(ORIGIN).toBe('https://firsttheblade.com');
  });
});

describe('the files beside the pages', () => {
  test('the sitemap lists every page but the not-found one', () => {
    const xml = sitemap(PAGES);
    for (const page of PAGES.filter((candidate) => candidate.listed)) {
      expect(xml).toContain(`<loc>${absolute(page.path)}</loc>`);
    }
    expect(xml).not.toContain('/404');
  });

  test('robots.txt points at the sitemap', () => {
    expect(robots()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  test('the manifest names the channel', () => {
    expect(webManifest().name).toBe('First the Blade');
  });
});

describe('the words', () => {
  test('Mark 4:28 is the King James Version, word for word', () => {
    expect(MARK_4_28.text).toBe(
      'For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.',
    );
  });

  test('no series claims a film that is not out', () => {
    for (const series of SERIES) expect(series.episodes).toEqual([]);
  });
});
