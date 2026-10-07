// The tab's title, pure: what the page has selected and its depth, then its
// part and its film, the film said once.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { pageTitle } from './page-title.ts';

describe("the tab's title", () => {
  test('names the selection first, then the part and the film; a part of no film is its name', () => {
    expect(pageTitle([Option.some('woman'), Option.none()], 'scenes', Option.some('rbf'))).toBe(
      'woman · Scenes · rbf',
    );
    expect(pageTitle([Option.none(), Option.none()], 'lab', Option.some('rbf'))).toBe('Lab · rbf');
    expect(
      pageTitle([Option.none(), Option.some('woman · versions')], 'project', Option.some('rbf')),
    ).toBe('woman · versions · Project · rbf');
    expect(pageTitle([Option.none(), Option.none()], 'films', Option.none())).toBe('Films');
  });

  test('a film the names before it already say is not said again', () => {
    expect(pageTitle([Option.none(), Option.some('rbf')], 'project', Option.some('rbf'))).toBe(
      'rbf · Project',
    );
  });
});
