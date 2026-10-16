// The tab's title, pure: what the page has selected and its depth, then its
// page and its film, the film said once.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { pageTitle } from './page-title.ts';

describe("the tab's title", () => {
  test('names the selection first, then the page and the film; a page of no film is its name', () => {
    expect(pageTitle([Option.some('woman'), Option.none()], 'board', Option.some('rbf'))).toBe(
      'woman · Board · rbf',
    );
    expect(pageTitle([Option.none(), Option.none()], 'lab', Option.some('rbf'))).toBe('Lab · rbf');
    expect(
      pageTitle([Option.none(), Option.some('woman · stack')], 'films', Option.some('rbf')),
    ).toBe('woman · stack · Films · rbf');
    expect(pageTitle([Option.none(), Option.none()], 'films', Option.none())).toBe('Films');
  });

  test('a film the names before it already say is not said again', () => {
    expect(pageTitle([Option.none(), Option.some('rbf')], 'films', Option.some('rbf'))).toBe(
      'rbf · Films',
    );
  });
});
