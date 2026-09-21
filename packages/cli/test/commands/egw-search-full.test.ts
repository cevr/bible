/** `--full`: the printer shows the whole paragraph the hit already carries.
 *
 *  Every hit's text is `nodesToText(nodes)` — the complete paragraph, not a
 *  windowed extract — so the 200-character cut is presentation. A reader
 *  checking a quotation against the corpus had to run one `lookup` per result
 *  to see past the ellipsis; `--full` is that second call removed. `--json`
 *  carried the full text all along, but only for a reader willing to parse it.
 *
 *  These run against the formatter rather than through the golden corpus on
 *  purpose: the longest paragraph in that fixture is 76 characters, so a
 *  fixture-driven test could never tell a cut paragraph from an uncut one and
 *  would pass whatever the flag did. The premise a truncation test needs is a
 *  paragraph longer than the cut, so the test supplies one.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import {
  Paragraph,
  Publication,
  Reference,
  SearchHit,
  paragraphId,
  publicationCode,
  publicationId,
  publicationOrder,
} from '@bible/core/writings';

import { formatLocalSearchResult, SNIPPET_LIMIT } from '../../src/commands/egw/format.js';

/** A paragraph comfortably past the cut, so the two outputs cannot coincide. */
const LONG_TEXT =
  'As man came forth from the hand of his Creator, he was of lofty stature and perfect symmetry. ' +
  'His countenance bore the ruddy tint of health and glowed with the light of life and joy. ' +
  'Adam’s height was much greater than that of men who now inhabit the earth.';

const hit = (text: string): SearchHit =>
  SearchHit.make({
    publication: Publication.make({
      id: publicationId(127),
      code: publicationCode('PP'),
      title: 'Patriarchs and Prophets',
      author: 'Ellen G. White',
      paragraphCount: Option.none(),
    }),
    paragraph: Paragraph.make({
      reference: Reference.paragraph(127, paragraphId('PP-1')),
      publicationCode: publicationCode('PP'),
      order: publicationOrder(1),
      page: Option.none(),
      number: Option.none(),
      refcode: Option.some('PP 45.3'),
      nodes: [{ _tag: 'Text', text }],
      elementType: Option.none(),
      elementSubtype: Option.none(),
    }),
  });

describe('egw search result formatting — --full', () => {
  it('cuts at the limit and marks the cut by default', () => {
    // The premise, stated rather than assumed: a shorter paragraph would make
    // both assertions below vacuous.
    expect(LONG_TEXT.length).toBeGreaterThan(SNIPPET_LIMIT);

    const line = formatLocalSearchResult(hit(LONG_TEXT), 0);

    expect(line).toContain(LONG_TEXT.slice(0, SNIPPET_LIMIT));
    expect(line).not.toContain(LONG_TEXT);
    expect(line).toContain('…');
  });

  it('prints the whole paragraph, with no ellipsis, when asked', () => {
    const line = formatLocalSearchResult(hit(LONG_TEXT), 0, true);

    // The whole paragraph, not a longer prefix of it.
    expect(line).toContain(LONG_TEXT);
    // And no truncation marker: that character is the only way a reader can
    // tell a complete paragraph from a cut one.
    expect(line).not.toContain('…');
  });

  it('leaves a paragraph shorter than the limit alone either way', () => {
    // The flag changes how much is shown, never the text itself — a short
    // paragraph must not gain an ellipsis or lose a character.
    const short = 'Eve was not quite as tall as Adam.';
    expect(short.length).toBeLessThan(SNIPPET_LIMIT);

    expect(formatLocalSearchResult(hit(short), 0)).toContain(short);
    expect(formatLocalSearchResult(hit(short), 0, true)).toContain(short);
    expect(formatLocalSearchResult(hit(short), 0)).not.toContain('…');
  });

  it('reports an empty paragraph rather than printing nothing', () => {
    // The branch the cut shares with the full path: both must still say
    // something a reader can read.
    expect(formatLocalSearchResult(hit(''), 0)).toContain('(no content)');
    expect(formatLocalSearchResult(hit(''), 0, true)).toContain('(no content)');
  });
});
