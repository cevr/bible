import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import {
  Page,
  Paragraph,
  Publication,
  Reference,
  pageNumber,
  publicationCode,
  publicationId,
  publicationOrder,
} from '@bible/core/writings';

import { EGWWire } from './EGWWire.js';

const publication = new Publication({
  id: publicationId(127),
  code: publicationCode('PP'),
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(2),
});

const paragraph = new Paragraph({
  reference: Reference.paragraph(127, '127.10'),
  publicationCode: publicationCode('PP'),
  order: publicationOrder(10),
  page: Option.some(pageNumber(5)),
  number: Option.some(2),
  refcode: Option.some('PP 5.2'),
  nodes: [{ _tag: 'Text', text: 'The paragraph.' }],
  elementType: Option.some('p'),
  elementSubtype: Option.none(),
});

describe('EGWWire', () => {
  test('maps canonical page navigation without inventing arithmetic page totals', () => {
    const wire = EGWWire.page(
      new Page({
        publication,
        reference: Reference.page(127, 5),
        paragraphs: [paragraph],
        heading: Option.some('A Heading'),
        previous: Option.some(Reference.page(127, 3)),
        next: Option.some(Reference.page(127, 9)),
      }),
    );

    expect(wire).toMatchObject({
      book: { bookId: 127, bookCode: 'PP', paragraphCount: 2 },
      page: 5,
      chapterHeading: 'A Heading',
      prevPage: 3,
      nextPage: 9,
      paragraphs: [{ paraId: '127.10', refcodeShort: 'PP 5.2', puborder: 10 }],
    });
    expect(wire).not.toHaveProperty('totalPages');
  });
});
