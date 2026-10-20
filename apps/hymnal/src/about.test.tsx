/**
 * Settings as its route renders it: the About section credits the
 * instruments the recordings are played on, as their licences ask.
 */

import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import Settings from '../app/(hymnal)/settings';

describe('Settings', () => {
  it('credits the piano and the strings under About', () => {
    const html = renderToStaticMarkup(<Settings />);
    expect(html).toContain('About');
    for (const words of [
      'Salamander Grand Piano',
      'Alexander Holm',
      'CC BY 3.0',
      'VS Chamber Orchestra 2',
      'Versilian Studios',
      'CC0',
    ])
      expect(html).toContain(words);
  });
});
