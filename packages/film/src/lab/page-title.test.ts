// The tab's title, pure: what the page has selected and its depth, then
// Films and its film, the film said once.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { pageTitle } from './page-title.ts';

describe("the tab's title", () => {
  test('names the selection first, then Films and the film; a page of no film is Films', () => {
    expect(pageTitle([Option.some('cold'), Option.none()], Option.some('rbf'))).toBe(
      'cold · Films · rbf',
    );
    expect(pageTitle([Option.none(), Option.some('woman · stack')], Option.some('rbf'))).toBe(
      'woman · stack · Films · rbf',
    );
    expect(pageTitle([Option.none(), Option.none()], Option.none())).toBe('Films');
  });

  test('a film the names before it already say is not said again', () => {
    expect(pageTitle([Option.none(), Option.some('rbf')], Option.some('rbf'))).toBe('rbf · Films');
  });
});
