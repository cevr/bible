/**
 * The Settings route, the sheet the home screen's gear opens, rendered to
 * HTML as the web build renders it.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { renderToStaticMarkup } from 'react-dom/server';

import Settings from '../../app/(hymnal)/settings';

const html = () =>
  renderToStaticMarkup(
    <RegistryProvider>
      <Settings />
    </RegistryProvider>,
  );

/** Each radio's label and whether it is checked, in page order. */
const radiosOf = (page: string) =>
  [
    ...page.matchAll(
      /<div (?=[^>]*role="radio")[^>]*aria-checked="(true|false)"[^>]*>(?:<[^>]+>)*([^<]+)</g,
    ),
  ].map(([, checked, label]) => ({ label, checked: checked === 'true' }));

describe('the Settings route', () => {
  it('shows its heading, the Appearance choices with System checked, then the Chord style choices with Simple checked, at first', () => {
    const page = html();
    expect({
      heading: page.includes('>Settings<'),
      groups: [
        ...page.matchAll(/<div (?=[^>]*role="radiogroup")(?=[^>]*aria-label="([^"]+)")/g),
      ].map(([, label]) => label),
      chords: page.includes('>Chords<'),
      radios: radiosOf(page),
    }).toEqual({
      heading: true,
      groups: ['Appearance', 'Chord style'],
      chords: true,
      radios: [
        { label: 'System', checked: true },
        { label: 'Light', checked: false },
        { label: 'Dark', checked: false },
        { label: 'Simple', checked: true },
        { label: 'Advanced', checked: false },
      ],
    });
  });
});
