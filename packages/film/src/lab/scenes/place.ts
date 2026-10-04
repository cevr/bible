// A film's Scenes in the URL (`Places.scenes`, `Places.scene`, core/api.ts):
// `/films/<film>/scenes[/<scene>]#t=<seconds>`. The path's scene is the one
// selected (its card in the focus panel): each selection is a step Back
// walks; `#t=` is the playhead in film time, on the tape and on a selected
// scene alike, written in place as it moves. One reader (`scenesPlaceOf`)
// and one printer (`scenesHref`), so a reload, a pasted link and Back come
// back to the scene and the frame they left. Pure.

import { Place } from '@bible/url-state';
import { Option } from 'effect';
import { Places, pageHref } from '../../core/api.ts';
import { onTheMs } from '../../player/t-in-url.ts';

/** What a film's Scenes URL holds: its film, the scene selected, and the playhead. */
interface ScenesPlace {
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly t: Option.Option<number>;
}

/** The Scenes place `href` names; none for a page that is not a film's Scenes. */
export const scenesPlaceOf = (href: string): Option.Option<ScenesPlace> =>
  Option.orElse(
    Option.map(Place.decode(Places.scene, href), (v): ScenesPlace => ({
      film: v.path.film,
      scene: Option.some(v.path.scene),
      t: v.hash.t,
    })),
    () =>
      Option.map(Place.decode(Places.scenes, href), (v): ScenesPlace => ({
        film: v.path.film,
        scene: Option.none(),
        t: v.hash.t,
      })),
  );

/** A film's Scenes with `scene` selected (none: the tape alone), the playhead at film second `t`. */
export const scenesHref = (
  film: string,
  scene: Option.Option<string>,
  t: Option.Option<number>,
): string => {
  const at = Option.map(t, onTheMs);
  return Option.match(scene, {
    onNone: () => pageHref.scenes(film, at),
    onSome: (s) => pageHref.scene(film, s, at),
  });
};

/** `href` with its playhead at `T`: the scene it selects kept. */
export const withTime = (href: string, T: number): Option.Option<string> =>
  Option.map(scenesPlaceOf(href), (p) => scenesHref(p.film, p.scene, Option.some(T)));

/** `href` with `scene` selected (none: deselected): the playhead kept. */
export const withScene = (href: string, scene: Option.Option<string>): Option.Option<string> =>
  Option.map(scenesPlaceOf(href), (p) => scenesHref(p.film, scene, p.t));
