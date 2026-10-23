/**
 * Where a press on the full player's title goes (`titleGoes`), from every
 * screen the sheet can lie over: the sheet only closes over its hymn's own
 * page; else it closes and the hymn's page is pushed, or, with no screen
 * under it, the page replaces it.
 */

import { describe, expect, it } from 'bun:test';

import { TitleGo, titleGoes } from './title';

const home = { name: 'index' };
const recent = { name: 'recent' };
const settings = { name: 'settings' };
const hymn = (number: string) => ({ name: 'hymns/[number]', params: { number } });
const player = (n: string) => ({ name: 'player', params: { hymn: n } });

describe('titleGoes', () => {
  it('closes the sheet over the page of its own hymn', () => {
    expect(titleGoes({ routes: [home, hymn('100'), player('100')], index: 2 }, 100)).toEqual(
      TitleGo.Close(),
    );
  });

  it('opens the hymn’s page over the home list, the Recent screen or Settings', () => {
    for (const under of [home, recent, settings])
      expect(titleGoes({ routes: [home, under, player('100')], index: 2 }, 100)).toEqual(
        TitleGo.Open({ number: 100 }),
      );
    expect(titleGoes({ routes: [home, player('100')], index: 1 }, 100)).toEqual(
      TitleGo.Open({ number: 100 }),
    );
  });

  it('opens the hymn’s page over another hymn’s page, even with its own page deeper down', () => {
    expect(
      titleGoes({ routes: [home, hymn('100'), hymn('3'), player('100')], index: 3 }, 100),
    ).toEqual(TitleGo.Open({ number: 100 }));
  });

  it('replaces the sheet with the hymn’s page when the sheet is the only screen (a link straight to it)', () => {
    expect(titleGoes({ routes: [player('5')], index: 0 }, 5)).toEqual(
      TitleGo.Replace({ number: 5 }),
    );
  });

  it('reads the screen right under the sheet, not the last of the stack', () => {
    expect(titleGoes({ routes: [home, hymn('7'), player('7'), recent], index: 2 }, 7)).toEqual(
      TitleGo.Close(),
    );
  });
});
