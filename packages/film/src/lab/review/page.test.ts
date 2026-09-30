// What the review page reads and says, with no DOM: the place and view its
// URL keeps, the markdown it shows (escaped, so a doc can put no HTML of its
// own in the page), and what a card says of a file and which copy it plays.

import { Option } from 'effect';
import { describe, expect, test } from 'bun:test';
import type { ReviewFolder, ReviewVideo } from '../../core/review.ts';
import { agoText, captionsFor, countsText, folderMatches, sizeText, videoUrl } from './format.ts';
import { ViewState } from './machine.ts';
import { escapeHtml, markdownHtml } from './markdown.ts';
import { ReviewPlace, placeOf, searchOf, searchWithView, viewOf } from './place.ts';

describe('the place in the URL', () => {
  test('reads home, a folder and a set, and writes them back', () => {
    for (const place of [
      ReviewPlace.Home(),
      ReviewPlace.Folder({ folder: 'out/art 3' }),
      ReviewPlace.Set({ folder: 'out/art 3', point: 'render:scenes:roof&sky' }),
      ReviewPlace.Film({ film: 'righteousness-by-faith' }),
      ReviewPlace.Project({ film: 'righteousness-by-faith' }),
    ])
      expect(placeOf(searchOf(place))).toEqual(place);
    expect(searchOf(ReviewPlace.Home())).toBe('');
    expect(placeOf('?set=roof')).toEqual(ReviewPlace.Home());
    expect(placeOf('?folder=&set=roof')).toEqual(ReviewPlace.Home());
  });

  test('keeps the view, a pair against one of the set, the moment shown', () => {
    const ids = ['A', 'B', 'C'];
    expect(viewOf('?folder=f&set=s', ids)).toEqual(ViewState.All);
    expect(viewOf('?view=pair&other=C', ids)).toEqual(ViewState.Pair({ other: 'C' }));
    expect(viewOf('?view=pair&other=A', ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf('?view=pair&other=Z', ids)).toEqual(ViewState.Pair({ other: 'B' }));
    expect(viewOf('?view=moments&m=3', ids)).toEqual(ViewState.Moments({ index: 3 }));
    expect(viewOf('?view=moments&m=-2', ids)).toEqual(ViewState.Moments({ index: 0 }));
    expect(viewOf('?view=notes', ids)).toEqual(ViewState.Notes);
    expect(viewOf('?view=wat', ids)).toEqual(ViewState.All);
  });

  test('writes the view into the URL, leaving the place as it was', () => {
    const at = '?folder=f&set=s';
    const pair = searchWithView(at, ViewState.Pair({ other: 'C' }));
    expect(pair).toBe('?folder=f&set=s&view=pair&other=C');
    expect(searchWithView(pair, ViewState.Moments({ index: 2 }))).toBe(
      '?folder=f&set=s&view=moments&m=2',
    );
    expect(searchWithView(pair, ViewState.All)).toBe(at);
  });
});

describe('markdown', () => {
  test('headings, paragraphs, nested lists, tables and inline marks', () => {
    expect(
      markdownHtml(
        [
          '# Title',
          'A **bold** and *quiet* line with `code`.',
          '- one',
          '  - under one',
          '- two',
          '| a | b |',
          '|---|---|',
          '| 1 | 2 |',
        ].join('\n'),
      ),
    ).toBe(
      '<h1>Title</h1><p>A <b>bold</b> and <i>quiet</i> line with <code>code</code>.</p>' +
        '<ul><li>one</li><ul><li>under one</li></ul><li>two</li></ul>' +
        '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
  });

  test('escapes every character a doc could use to put its own HTML in the page', () => {
    expect(markdownHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(markdownHtml('- <img src=x onerror="go()">')).toBe(
      '<ul><li>&lt;img src=x onerror=&quot;go()&quot;&gt;</li></ul>',
    );
    expect(escapeHtml(`a&'b`)).toBe('a&amp;&#39;b');
  });
});

const file = (name: string, size = 10) => ({ ref: `out/f/${name}`, name, size, mtime: 0 });
const video = (name: string, phone: ReviewVideo['phone']): ReviewVideo => ({
  ...file(name),
  phone,
});

describe('what a card says', () => {
  test('sizes and ages', () => {
    expect(sizeText(812)).toBe('812 B');
    expect(sizeText(2.5 * 1024 ** 3)).toBe('2.5 GB');
    const now = 1_000_000_000;
    expect(agoText(now - 30_000, now)).toBe('just now');
    expect(agoText(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(agoText(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(agoText(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });

  test('plays the phone copy only once it is made, and only when asked for', () => {
    expect(videoUrl(video('a b.mp4', 'ready'), 'phone')).toBe('/review/phone/out/f/a%20b.mp4');
    expect(videoUrl(video('a b.mp4', 'pending'), 'phone')).toBe('/review/files/out/f/a%20b.mp4');
    expect(videoUrl(video('a b.mp4', 'ready'), 'full')).toBe('/review/files/out/f/a%20b.mp4');
  });

  test("finds a video's captions, a share copy's by its master", () => {
    const docs = [file('roof.A.vtt'), file('notes.md')];
    expect(captionsFor(file('roof.A.share.mp4'), docs)).toEqual(Option.some(file('roof.A.vtt')));
    expect(captionsFor(file('roof.B.mp4'), docs)).toEqual(Option.none());
  });

  test("counts a folder's things and filters by its ref or its title", () => {
    const folder: ReviewFolder = {
      ref: 'art3/out',
      title: Option.some('Roofs at dusk'),
      blurb: Option.none(),
      mtime: 0,
      sets: [],
      videos: [video('a.mp4', 'none'), video('b.mp4', 'none')],
      images: [],
      docs: [file('notes.md')],
    };
    expect(countsText(folder)).toBe('2 videos · 1 doc');
    expect(folderMatches(folder, '')).toBe(true);
    expect(folderMatches(folder, 'DUSK')).toBe(true);
    expect(folderMatches(folder, 'art3')).toBe(true);
    expect(folderMatches(folder, 'sea')).toBe(false);
  });
});
