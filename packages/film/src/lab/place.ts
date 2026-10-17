// The place in the URL of the Lab (`Places.lab`, `Places.labScene`,
// core/api.ts):
// `/films/<film>/lab/<scene>?cue=<name>|knob=<name>&note=<id>&beat=<id>&view=<compare>&code=follow|live|<line>&words=<a>-<b>&text=follow|<word>&cuts=1#t=<seconds>&loop=<a>,<b>`.
// The path's scene is the selection's scene when something is selected (a
// cue or knob, else a talk's words), else the scene under the playhead, so
// the path never names a scene the frame has left; `#t=` is the frame's time
// in that scene (signed: a selection's scene may start after the frame). One
// reader (`labPlaceOf`, `labOpensAt`) and one printer (`labHref`), so a
// reload, a pasted link and Back all come back to the frame, the pick, the
// note and the studio's beat they left.

import { Place, parseHref } from '@bible/url-state';
import { Array as Arr, Option } from 'effect';
import { type CompareView, Places, pageHref } from '../core/api.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import type { Interval } from '../core/time.ts';
import { onTheMs } from '../core/time.ts';
import {
  type LabSelection as Selection,
  type WordsSelection,
  cueOf,
  knobOf,
  labKeysOf,
  wordsIn,
  wordsText,
} from '../command/selection.ts';
import { type CodeOpen, codeOpenOf, codeText } from './source/open.ts';
import { type TextOpen, textOpenOf, textText } from './transcript/open.ts';

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
  /** A talk's words selected in the path's scene (`?words=<a>-<b>`). */
  readonly words: Option.Option<WordsSelection>;
  /** The Transcript view (`?text=`): shut unless the link opens it, following the frame or held on a word. */
  readonly text: Option.Option<TextOpen>;
  /** Whether the Transcript view shows the words its cut strikes (`?cuts=1`, "Show cuts"). */
  readonly cuts: boolean;
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
  words: Option.none(),
  text: Option.none(),
  cuts: false,
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

/** The place of the Lab `href` names; nothing for a page that is not the Lab. */
export const labPlaceOf = (href: string): LabPlace =>
  Option.getOrElse(
    Option.firstSomeOf<LabPlace>([
      Option.map(Place.decode(Places.labScene, href), ({ path, query, hash }): LabPlace => ({
        ...NOWHERE,
        scene: Option.some(path.scene),
        selection: selectionIn(path.scene, query),
        note: named(query.note),
        beat: named(query.beat),
        view: query.view,
        code: codeOpenOf(query.code),
        words: wordsIn(path.scene, query.words),
        text: textOpenOf(query.text),
        cuts: query.cuts,
        t: hash.t,
        loop: hash.loop,
      })),
      Option.map(Place.decode(Places.lab, href), ({ query, hash }): LabPlace => ({
        ...NOWHERE,
        note: named(query.note),
        view: query.view,
        t: hash.t,
        loop: hash.loop,
      })),
    ]),
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
  /** A talk's words selected; a pick that says nothing of them selects none. */
  readonly words?: Option.Option<WordsSelection>;
  /** The Transcript view; a pick that says nothing of it leaves it shut. */
  readonly text?: Option.Option<TextOpen>;
  /** Whether the Transcript view shows its struck words; a pick that says nothing of it hides them. */
  readonly cuts?: boolean;
  readonly loop: Option.Option<Interval>;
}

/** `T` in scene `id` of the film laid out as `placed`, to the ms (`onTheMs`). */
const tIn = (placed: ReadonlyArray<Placed>, id: string, T: number) =>
  Option.some(onTheMs(T - Option.getOrElse(startOf(placed, id), () => 0)));

/** A pick's name for `?…=`, kept only when it is of the path's scene `id` (a section's words). */
const keyIn = <A extends { readonly scene: string }>(
  picked: Option.Option<A>,
  id: string,
  text: (a: A) => string,
): string =>
  Option.getOrElse(
    Option.map(
      Option.filter(picked, (p) => p.scene === id),
      text,
    ),
    () => '',
  );

/**
 * The Lab's URL for `film` (laid out as `placed`) at film seconds `T` with
 * `pick`: the path names the cue's or knob's scene, else the words', else
 * the scene under `T`, and `#t=` is `T` in that scene, to the ms (`onTheMs`).
 */
export const labHref = (
  film: string,
  placed: ReadonlyArray<Placed>,
  pick: LabPick,
  T: number,
): string => {
  const words = Option.flatten(Option.fromUndefinedOr(pick.words));
  const scene = Option.firstSomeOf([
    Option.map(pick.selection, (s) => s.scene),
    Option.map(words, (w) => w.scene),
    Option.map(sceneAt(placed, T), (p) => p.spec.id),
  ]);
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
          // Words are a section's: kept only on the path that names it.
          words: keyIn(words, id, wordsText),
          text: textText(Option.flatten(Option.fromUndefinedOr(pick.text))),
          cuts: pick.cuts ?? false,
        },
        tIn(placed, id, T),
        pick.loop,
      ),
  });
};

/**
 * The Lab's URL at `href` with `change` made to what it picks, at film
 * seconds `T` (`labHref`): what every write prints, so each keeps what the
 * others hold (a pick keeps the loop, the time keeps the pick). The path
 * names one scene, so the newer of two picks in different scenes wins: words
 * selected in another scene than the cue or knob let it go, and a cue or
 * knob picked in another scene lets the words go (`labHref` keeps only the
 * path's).
 */
export const labHrefWith = (
  film: string,
  placed: ReadonlyArray<Placed>,
  href: string,
  change: Partial<LabPick>,
  T: number,
): string => {
  const { selection, note, beat, view, code, words, text, cuts, loop } = labPlaceOf(href);
  const picked = Option.flatten(Option.fromUndefinedOr(change.words));
  const kept = Option.filter(selection, (s) => !Option.exists(picked, (w) => w.scene !== s.scene));
  return labHref(
    film,
    placed,
    {
      selection: kept,
      note,
      beat,
      view,
      code,
      words,
      text,
      cuts,
      loop,
      ...change,
    },
    T,
  );
};

/** Whether `selection` is the cue `name` of `scene`. */
export const selectsCue = (selection: Option.Option<Selection>, scene: string, name: string) =>
  Option.exists(selection, (s) => s._tag === 'Cue' && s.scene === scene && s.name === name);
