import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';

import {
  Page,
  Paragraph,
  Publication,
  Reference,
  pageNumber,
  publicationCode,
  publicationId,
  publicationOrder,
} from './model.js';

describe('Writings domain', () => {
  test('models publication, page, and paragraph references as distinct states', () => {
    expect(Reference.publication(127)._tag).toBe('publication');
    expect(Reference.page(127, 351)._tag).toBe('page');
    expect(Reference.paragraph(127, 'p-1024')._tag).toBe('paragraph');
  });

  test('rejects invalid coordinates at the input boundary', () => {
    expect(() => Reference.page(127, 0)).toThrow();
    expect(() => Reference.paragraph(0, 'p-1')).toThrow();
    expect(() => Reference.paragraph(127, '')).toThrow();
  });

  test('a page is non-empty and owns finite navigation', () => {
    const publication = new Publication({
      id: publicationId(127),
      code: publicationCode('PP'),
      title: 'Patriarchs and Prophets',
      author: 'Ellen G. White',
      paragraphCount: Option.some(1000),
    });
    const paragraph = new Paragraph({
      reference: Reference.paragraph(127, 'p-1024'),
      publicationCode: publicationCode('PP'),
      order: publicationOrder(1024),
      page: Option.some(pageNumber(351)),
      number: Option.some(1),
      refcode: Option.some('PP 351.1'),
      nodes: [],
      elementType: Option.none(),
      elementSubtype: Option.none(),
    });
    const page = new Page({
      publication,
      reference: Reference.page(127, 351),
      paragraphs: [paragraph],
      heading: Option.none(),
      previous: Option.some(Reference.page(127, 350)),
      next: Option.some(Reference.page(127, 352)),
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
