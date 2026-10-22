/**
 * The web's home screen, rendered to HTML as the web build renders it, over
 * the real compiled hymnal (`src/test/setup.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { renderToStaticMarkup } from 'react-dom/server';

import Index from '../../app/(hymnal)/index';
import { hymns } from '~/hymns/hymns';

const html = () =>
  renderToStaticMarkup(
    <RegistryProvider>
      <Index />
    </RegistryProvider>,
  );

describe('the web home screen', () => {
  it('shows its title, the Settings link, the search field and the first hymn row', () => {
    const page = html();
    expect({
      title: page.includes('>Hymns<'),
      settings: page.includes('>Settings<'),
      field: page.includes('placeholder="Number, title or first line"'),
      first: page.includes('aria-label="1, Praise to the Lord"'),
    }).toEqual({ title: true, settings: true, field: true, first: true });
  });

  it('draws no topic rows: no topic name shows on the page', () => {
    const page = html();
    const topics = [...new Set(hymns.map((h) => h.topic))];
    expect(topics.filter((name) => page.includes(`>${name}<`))).toEqual([]);
  });
});
