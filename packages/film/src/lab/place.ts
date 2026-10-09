// The lab's place in the URL (`Places.lab`, `Places.labScene`, core/api.ts):
// `/films/<film>/lab/<scene>?cue=<name>|knob=<name>&note=<id>&beat=<id>&view=<compare>&code=follow|<line>#t=<seconds>&loop=<a>,<b>`.
// The path's scene is the selection's scene when something is selected, else
// the scene under the playhead, so the path never names a scene the frame has
// left; `#t=` is the frame's time in that scene (signed: a selection's scene
// may start after the frame). One reader (`labPlaceOf`, `labOpensAt`) and one
// printer (`labHref`), so a reload, a pasted link and Back all come back to
// the frame, the pick, the note and the studio's beat they left.

import { Place, parseHref } from '@bible/url-state';
import { Array as Arr, Option } from 'effect';
import { type CompareView, Places, pageHref } from '../core/api.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import type { Interval } from '../core/time.ts';
import { onTheMs } from '../core/time.ts';
import { type LabSelection as Selection, cueOf, knobOf, labKeysOf } from '../command/selection.ts';
import { type CodeOpen, codeOpenOf, codeText } from './source/open.ts';

/** What the lab's URL holds beside its film. */
interface LabPlace {
  /** The path's scene: none on a film's lab (`/films/<film>/lab`). */
  readonly scene: Option.Option<string>;
  /** The cue or knob selected in the path's scene. */
  readonly selection: Option.Option<Selection>;
  /** The note selected (`?note=<id>`). */
  readonly note: Option.Option<string>;
  /** The studio's beat picked (`?beat=<id>`, a scene's take): none on a film's lab. */
  readonly beat: Option.Option<string>;
  /** The compare with HEAD (`?view=`): off unless the link names a mode. */
  readonly view: CompareView;
  /** The Source view (`?code=`): shut unless the link opens it, following the frame or held on a line. */
  readonly code: Option.Option<CodeOpen>;
  /** `#t=`: seconds into the path's scene, or film seconds on a film's lab. */
  readonly t: Option.Option<number>;
  /** `#loop=`: the A–B loop, film seconds on both. */
  readonly loop: Option.Option<Interval>;
}

const NOWHERE: LabPlace = {
  scene: Option.none(),
  selection: Option.none(),
  note: Option.none(),
  beat: Option.none(),
  view: 'off',
  code: Option.none(),
  t: Option.none(),
  loop: Option.none(),
};

const named = (value: string): Option.Option<string> =>
  Option.liftPredicate(value, (v) => v !== '');

/** The selection a scene's query names: its cue, else its knob. */
const selectionIn = (
  scene: string,
  query: { readonly cue: string; readonly knob: string },
): Option.Option<Selection> =>
  Option.orElse(
    Option.map(named(query.cue), (name) => cueOf(scene, name)),
    () => Option.map(named(query.knob), (name) => knobOf(scene, name)),
  );

/** The lab's place `href` names; nothing for a page that is not the lab. */
export const labPlaceOf = (href: string): LabPlace =>
  Option.getOrElse(
    Option.orElse(
      Option.map(Place.decode(Places.labScene, href), ({ path, query, hash }): LabPlace => ({
        scene: Option.some(path.scene),
        selection: selectionIn(path.scene, query),
        note: named(query.note),
        beat: named(query.beat),
        view: query.view,
        code: codeOpenOf(query.code),
        t: hash.t,
        loop: hash.loop,
      })),
      () =>
        Option.map(Place.decode(Places.lab, href), ({ query, hash }): LabPlace => ({
          ...NOWHERE,
          note: named(query.note),
          view: query.view,
          t: hash.t,
          loop: hash.loop,
        })),
    ),
    () => NOWHERE,
  );

/** A hash that is only a number (`#42.000`): film seconds, as an old lab link carried them. */
const bareSeconds = (href: string): Option.Option<number> =>
  Option.filter(
    Option.map(
      Option.liftPredicate(parseHref(href).hash.replace(/^#/, ''), (h) =>
        /^-?\d+(\.\d+)?$/.test(h),
      ),
      Number,
    ),
    Number.isFinite,
  );

/** Where `scene` starts in the film laid out as `placed`, if it has that scene. */
const startOf = (placed: ReadonlyArray<Placed>, scene: string): Option.Option<number> =>
  Option.map(
    Arr.findFirst(placed, (p) => p.spec.id === scene),
    (p) => p.start,
  );

/**
 * The film seconds the lab at `href` opens on: a scene's start plus its
 * `#t=`, a film's lab's `#t=`, or a bare `#<seconds>` (an old link's film
 * time); else the scene's start, else 0. Unclamped: the player clamps.
 */
export const labOpensAt = (placed: ReadonlyArray<Placed>, href: string): number => {
  const place = labPlaceOf(href);
  const start = Option.flatMap(place.scene, (scene) => startOf(placed, scene));
  return Option.getOrElse(
    Option.firstSomeOf([
      Option.map(place.t, (t) => Option.getOrElse(start, () => 0) + t),
      bareSeconds(href),
      start,
    ]),
    () => 0,
  );
};

/**
 * The studio's beat at `href`, among the beats `listed`: the one the link
 * picks (`?beat=`), else the path's scene (a beat is a scene's take), so
 * Record opens where the lab is. A beat the film does not list (a link made
 * before a scene was renamed) reads as absent.
 */
export const beatAt = (href: string, listed: ReadonlyArray<string>): Option.Option<string> => {
  const place = labPlaceOf(href);
  const isListed = (id: string) => listed.includes(id);
  return Option.orElse(Option.filter(place.beat, isListed), () =>
    Option.filter(place.scene, isListed),
  );
};

/** What the lab writes beside the frame's time: its pick, its note, the studio's beat, the compare's mode, the Source view and the loop. */
export interface LabPick {
  readonly selection: Option.Option<Selection>;
  readonly note: Option.Option<string>;
  readonly beat: Option.Option<string>;
  readonly view: CompareView;
  /** The Source view; a pick that says nothing of it leaves it shut. */
  readonly code?: Option.Option<CodeOpen>;
  readonly loop: Option.Option<Interval>;
}

/**
 * The lab's URL for `film` (laid out as `placed`) at film seconds `T` with
 * `pick`: the path names the selection's scene, else the scene under `T`,
 * and `#t=` is `T` in that scene, to the ms (`onTheMs`).
 */
export const labHref = (
  film: string,
  placed: ReadonlyArray<Placed>,
  pick: LabPick,
  T: number,
): string => {
  const scene = Option.orElse(
    Option.map(pick.selection, (s) => s.scene),
    () => Option.map(sceneAt(placed, T), (p) => p.spec.id),
  );
  const note = Option.getOrElse(pick.note, () => '');
  return Option.match(scene, {
    onNone: () => pageHref.lab(film, Option.some(onTheMs(T)), pick.view, pick.loop),
    onSome: (id) =>
      pageHref.labScene(
        film,
        id,
        {
          ...Option.match(pick.selection, {
            onNone: () => ({}),
            onSome: labKeysOf,
          }),
          note,
          beat: Option.getOrElse(pick.beat, () => ''),
          view: pick.view,
          code: codeText(Option.flatten(Option.fromUndefinedOr(pick.code))),
        },
        Option.some(onTheMs(T - Option.getOrElse(startOf(placed, id), () => 0))),
        pick.loop,
      ),
  });
};

/**
 * The lab's URL at `href` with `change` made to what it picks, at film
 * seconds `T` (`labHref`): what every lab write prints, so each keeps what
 * the others hold (a pick keeps the loop, the time keeps the pick).
 */
export const labHrefWith = (
  film: string,
  placed: ReadonlyArray<Placed>,
  href: string,
  change: Partial<LabPick>,
  T: number,
): string => {
  const { selection, note, beat, view, code, loop } = labPlaceOf(href);
  return labHref(film, placed, { selection, note, beat, view, code, loop, ...change }, T);
};

/** Whether `selection` is the cue `name` of `scene`. */
export const selectsCue = (selection: Option.Option<Selection>, scene: string, name: string) =>
  Option.exists(selection, (s) => s._tag === 'Cue' && s.scene === scene && s.name === name);
