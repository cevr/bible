/* oxlint-disable effect/noGlobals -- the test runs a Bun script in a process of its own, so its React Native stand-in never reaches the other tests. */

/**
 * The phones' hymn pager (`HymnScreen.native.tsx`), mounted on LegendList's
 * phone build under the bottom bar by `src/test/phone-pager.tsx`, which
 * prints what each case saw. A settle is the pager's scroll view told, as
 * iOS tells it, that its glide ended on a page.
 */

import { describe, expect, it } from 'bun:test';

import { backEdge } from './pager';

interface Seen {
  readonly pages: ReadonlyArray<number>;
  readonly headers: number;
  readonly headerNames: ReadonlyArray<number>;
  readonly rightItems: ReadonlyArray<number>;
  readonly firstOffset: number;
  readonly offsets: ReadonlyArray<number>;
  readonly paging: boolean;
  readonly opened: ReadonlyArray<string>;
  readonly paramsSet: ReadonlyArray<number>;
  readonly backEdge: {
    readonly count: number;
    readonly overPager: boolean;
    readonly position: string;
    readonly left: string;
    readonly top: string;
    readonly bottom: string;
    readonly width: string;
  };
  readonly pageHeights: ReadonlyArray<string>;
}

interface Run {
  readonly homeSource: { readonly length: number; readonly first: number };
  readonly homeOpened: ReadonlyArray<string>;
  readonly sourceAfterOpen: boolean;
  readonly open3: Seen;
  readonly settle4: Seen;
  readonly open30: Seen;
  readonly settle300: Seen;
  readonly open600: Seen;
  readonly settle601: Seen;
  readonly recentOpen3: ReadonlyArray<number>;
  readonly recentSettle4: ReadonlyArray<number>;
  readonly shelfRows: ReadonlyArray<string>;
  readonly shelfFirstTopic: string;
  readonly starred: ReadonlyArray<number>;
  readonly stars: number;
  readonly recentSource: ReadonlyArray<number>;
  readonly emptyHeadings: ReadonlyArray<string>;
  readonly playing: {
    readonly playing: boolean;
    readonly playedBefore: number;
    readonly playedAfter: number;
    readonly state: string;
    readonly track: number;
    readonly barHymn: number;
    readonly playFour: boolean;
    readonly route: string;
    readonly header: ReadonlyArray<number>;
  };
}

const run = Bun.spawnSync(['bun', Bun.resolveSync('../test/phone-pager.tsx', import.meta.dir)], {
  stderr: 'pipe',
});
/** The script's last line is its report; the lines before it are the app's own logs. */
const seen: Run = JSON.parse(run.stdout.toString().trim().split('\n').at(-1) ?? 'null');

/** A screen 390 points wide: page `i` starts at `i` screens. */
const width = 390;

describe('the pager’s source', () => {
  it('is the home list a row was pressed in, handed over before the hymn opens', () => {
    expect(seen.homeOpened).toEqual(['/hymns/3']);
    expect(seen.homeSource).toEqual({ length: 695, first: 1 });
  });

  it('is taken once, as the hymn opens, so a hymn opened by a link next pages through every hymn', () => {
    expect(seen.sourceAfterOpen).toBe(false);
  });

  it('is a search’s results: the second result opens between the first and the third', () => {
    expect(seen.open30.opened).toEqual(['/hymns/30']);
    expect(seen.open30.firstOffset).toBe(1 * width);
    expect(seen.open30.pages.toSorted((a, b) => a - b)).toEqual([3, 30, 300]);
  });
});

describe('the pager’s first frame', () => {
  it('opens at the hymn’s page, one screen wide, paging', () => {
    expect(seen.open3.firstOffset).toBe(2 * width);
    expect(seen.open3.pages).toContain(3);
    expect(seen.open3.paging).toBe(true);
  });

  it('opens a deep link to 600 among every hymn, at 600, and moves no further', () => {
    expect(seen.open600.firstOffset).toBe(599 * width);
    expect(seen.open600.pages).toContain(600);
    expect(new Set([...seen.open600.offsets, ...seen.settle601.offsets])).toEqual(
      new Set([599 * width]),
    );
  });

  it('draws about one page on each side of the one shown', () => {
    for (const shown of [seen.open3, seen.open600, seen.open30])
      expect(shown.pages.length).toBeLessThanOrEqual(4);
  });
});

describe('a settle', () => {
  it('sets the route’s number in place, once, and pushes nothing', () => {
    expect(seen.settle4.paramsSet).toEqual([4]);
    expect(seen.settle4.opened).toEqual(['/hymns/3']);
    expect(seen.settle601.paramsSet).toEqual([601]);
    expect(seen.settle601.opened).toEqual([]);
    expect(seen.settle300.paramsSet).toEqual([300]);
  });

  it('moves through the source list: after the search’s second result comes its third', () => {
    expect(seen.settle300.headerNames).toEqual([300]);
  });

  it('names the settled hymn in the one header, with its buttons; the neighbour pages set none', () => {
    for (const [shown, hymn] of [
      [seen.open3, 3],
      [seen.settle4, 4],
      [seen.open600, 600],
      [seen.settle601, 601],
    ] as const) {
      expect(shown.headers).toBe(1);
      expect(shown.headerNames).toEqual([hymn]);
      expect(shown.rightItems).toEqual([1]);
    }
  });
});

describe('a page', () => {
  it('is as tall as the pager, not as its words, so the words scroll inside it on every way in', () => {
    // The phone stand-in measures every view 800 points tall.
    for (const shown of [seen.open3, seen.settle4, seen.open30, seen.open600, seen.settle601]) {
      expect(shown.pageHeights.length).toBeGreaterThan(0);
      for (const height of shown.pageHeights) expect(height).toBe('800px');
    }
  });
});

describe('the left edge', () => {
  it('lies over the pager on every page, the back zone’s width from top to bottom, so its pans go back', () => {
    for (const shown of [seen.open3, seen.settle4, seen.open30, seen.open600, seen.settle601])
      expect(shown.backEdge).toEqual({
        count: 1,
        overPager: true,
        position: 'absolute',
        left: '0px',
        top: '0px',
        bottom: '0px',
        width: `${backEdge}px`,
      });
  });
});

describe('a settle while a hymn sounds', () => {
  it('sends the player nothing: 3 sounds on, and the bar shows it with Play hymn 4', () => {
    expect(seen.playing.playing).toBe(true);
    expect(seen.playing.route).toBe('4');
    expect(seen.playing.header).toEqual([4]);
    expect(seen.playing.playedAfter).toBe(seen.playing.playedBefore);
    expect(seen.playing.state).toBe('Playing');
    expect(seen.playing.track).toBe(3);
    expect(seen.playing.barHymn).toBe(3);
    expect(seen.playing.playFour).toBe(true);
  });
});

describe('the reader’s lists', () => {
  it('Recent gains a hymn as it opens, and the hymn a settle shows, the latest first', () => {
    expect(seen.recentOpen3).toEqual([3]);
    expect(seen.recentSettle4).toEqual([4, 3]);
  });

  it('the home list shows Recent above its first topic, its hymns in order, and no Favourites section', () => {
    expect(seen.shelfRows).toEqual(['Recent', '30', '4', '3', seen.shelfFirstTopic]);
  });

  it('a favourite’s rows carry a star and are read as a favourite, in Recent and under its topic', () => {
    // Recent's 30 and 3 come first, then hymn 3 under its topic, in list order;
    // 30 under its topic lies past the rows drawn at the top.
    expect(seen.starred.slice(0, 3)).toEqual([30, 3, 3]);
    expect(seen.stars).toBe(seen.starred.length);
  });

  it('a press on a Recent row hands the pager Recent to page through', () => {
    expect(seen.recentSource).toEqual([30, 4, 3]);
  });

  it('a list with no hymn shows no section: the first topic comes first', () => {
    expect(seen.emptyHeadings).toEqual([seen.shelfFirstTopic]);
  });
});
