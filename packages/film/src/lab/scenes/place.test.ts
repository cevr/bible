// A film's Scenes keep their selection in the path and the playhead in the
// hash: one reader and one printer, round-tripping; a time written keeps the
// scene selected, and a selection keeps the time; the old look-book's links
// land on the Scenes.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { legacyPlace, pageHref } from '../../core/api.ts';
import { scenesHref, scenesPlaceOf, withScene, withTime } from './place.ts';

describe("a film's Scenes in the URL", () => {
  test('the path names the scene selected and the hash the playhead, both ways', () => {
    const href = scenesHref('f', Option.some('two'), Option.some(42.5));
    expect(href).toBe('/films/f/scenes/two#t=42.5');
    expect(scenesPlaceOf(href)).toEqual(
      Option.some({ film: 'f', scene: Option.some('two'), t: Option.some(42.5) }),
    );
    expect(scenesPlaceOf(pageHref.scenes('f'))).toEqual(
      Option.some({ film: 'f', scene: Option.none(), t: Option.none() }),
    );
    expect(scenesPlaceOf(pageHref.lab('f'))).toEqual(Option.none());
  });

  test('a time written keeps the scene selected; a selection keeps the time', () => {
    expect(withTime('/films/f/scenes/two#t=1', 9.25)).toEqual(
      Option.some('/films/f/scenes/two#t=9.25'),
    );
    expect(withScene('/films/f/scenes#t=9.25', Option.some('one'))).toEqual(
      Option.some('/films/f/scenes/one#t=9.25'),
    );
    expect(withScene('/films/f/scenes/one#t=9.25', Option.none())).toEqual(
      Option.some('/films/f/scenes#t=9.25'),
    );
  });

  test("the old look-book's links land on the film's Scenes", () => {
    expect(legacyPlace('https://lab.test/player?film=f&lookbook')).toEqual(
      Option.some(pageHref.scenes('f')),
    );
    expect(legacyPlace('https://lab.test/?film=f&lookbook')).toEqual(
      Option.some(pageHref.scenes('f')),
    );
  });
});
