import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';

import { Page, Paragraph, Publication, Reference, publicationId } from './model.js';

describe('Writings domain', () => {
  test('models publication, page, and paragraph references as distinct states', () => {
    expect(Reference.publication('PP')._tag).toBe('publication');
    expect(Reference.page('PP', 351)._tag).toBe('page');
    expect(
      Reference.paragraph({
        publication: 'PP',
        order: 1024,
        page: 351,
        number: 1,
        refcode: 'PP 351.1',
      })._tag,
    ).toBe('paragraph');
  });

  test('rejects invalid coordinates at the input boundary', () => {
    expect(() => Reference.page('PP', 0)).toThrow();
    expect(() => Reference.paragraph({ publication: '', order: 1 })).toThrow();
    expect(() => Reference.paragraph({ publication: 'PP', order: -1 })).toThrow();
  });

  test('a page is non-empty and owns finite navigation', () => {
    const publication = new Publication({
      id: publicationId(127),
      code: Reference.publication('PP').publication,
      title: 'Patriarchs and Prophets',
      author: 'Ellen G. White',
      paragraphCount: Option.some(1000),
    });
    const paragraph = new Paragraph({
      reference: Reference.paragraph({
        publication: 'PP',
        order: 1024,
        page: 351,
        number: 1,
        refcode: 'PP 351.1',
      }),
      paragraphId: Option.none(),
      nodes: [],
      elementType: Option.none(),
      elementSubtype: Option.none(),
    });
    const page = new Page({
      publication,
      reference: Reference.page('PP', 351),
      paragraphs: [paragraph],
      heading: Option.none(),
      previous: Option.some(Reference.page('PP', 350)),
      next: Option.some(Reference.page('PP', 352)),
    });

    expect(page.paragraphs).toHaveLength(1);
    expect(() =>
      Schema.decodeUnknownSync(Page)({
        publication: page.publication,
        reference: page.reference,
        paragraphs: [],
        heading: page.heading,
        previous: page.previous,
        next: page.next,
      }),
    ).toThrow();
  });
});
