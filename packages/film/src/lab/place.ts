// The place in the URL of the Lab's pages, the Lab and the Script
// (`Places.lab`, `Places.labScene`, `Places.script`, `Places.scriptBeat`,
// core/api.ts):
// `/films/<film>/lab/<scene>?cue=<name>|knob=<name>&note=<id>&beat=<id>&view=<compare>&code=follow|<line>&words=<a>-<b>&text=follow|<word>#t=<seconds>&loop=<a>,<b>`
// and `/films/<film>/script/<beat>?cue=<name>|mark=<name>|words=<a>-<b>|note=<id>#t=<seconds>&loop=<a>,<b>`.
// The path's scene is the selection's scene when something is selected (a
// cue or knob, else a talk's words; on the Script a cue, a mark or words),
// else the scene under the playhead, so the path never names a scene the
// frame has left; `#t=` is the frame's time in that scene (signed: a
// selection's scene may start after the frame). The Script selects one
// thing at a time: a cue, a mark, words or a note, the newest pick winning. One
// reader (`labPlaceOf`, `labOpensAt`) and one printer (`labHref`), so a
// reload, a pasted link and Back all come back to the frame, the pick, the
// note and the studio's beat they left, on the page they left.

import { Place, parseHref } from '@bible/url-state';
import { Array as Arr, Option } from 'effect';
import { type CompareView, Places, pageHref } from '../core/api.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import type { Interval } from '../core/time.ts';
import { onTheMs } from '../core/time.ts';
import {
  type LabSelection as Selection,
  type MarkSelection,
  type WordsSelection,
  cueOf,
  knobOf,
  labKeysOf,
  markOf,
  wordsIn,
  wordsText,
} from '../command/selection.ts';
import { type CodeOpen, codeOpenOf, codeText } from './source/open.ts';
import { type TextOpen, textOpenOf, textText } from './transcript/open.ts';

/** Which of the Lab's pages a place is on: the Lab (`/films/<film>/lab…`) or the Script (`/films/<film>/script…`). */
export type LabRoot = 'lab' | 'script';

/** What the lab's URL holds beside its film. */
interface LabPlace {
  /** The page the place is on. */
  readonly root: LabRoot;
  /** The path's scene: none on a film's lab (`/films/<film>/lab`) or Script. */
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
  /** Words selected in the path's scene (`?words=<a>-<b>`): a talk's, or a beat's line's on the Script. */
  readonly words: Option.Option<WordsSelection>;
  /** A mark of the path's scene's line selected (`?mark=<name>`, the Script's). */
  readonly mark: Option.Option<MarkSelection>;
  /** The Transcript view (`?text=`): shut unless the link opens it, following the frame or held on a word. */
  readonly text: Option.Option<TextOpen>;
  /** `#t=`: seconds into the path's scene, or film seconds on a film's lab. */
  readonly t: Option.Option<number>;
  /** `#loop=`: the A–B loop, film seconds on both. */
  readonly loop: Option.Option<Interval>;
}

const NOWHERE: LabPlace = {
  root: 'lab',
  scene: Option.none(),
  selection: Option.none(),
  note: Option.none(),
  beat: Option.none(),
  view: 'off',
  code: Option.none(),
  words: Option.none(),
  mark: Option.none(),
  text: Option.none(),
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

/** The place of the Lab's pages `href` names; nothing for a page that is neither. */
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
      Option.map(Place.decode(Places.scriptBeat, href), ({ path, query, hash }): LabPlace => ({
        ...NOWHERE,
        root: 'script',
        scene: Option.some(path.scene),
        selection: Option.map(named(query.cue), (name) => cueOf(path.scene, name)),
        mark: Option.map(named(query.mark), (name) => markOf(path.scene, name)),
        words: wordsIn(path.scene, query.words),
        note: named(query.note),
        t: hash.t,
        loop: hash.loop,
      })),
      Option.map(Place.decode(Places.script, href), ({ query, hash }): LabPlace => ({
        ...NOWHERE,
        root: 'script',
        note: named(query.note),
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
  /** Words selected (a talk's, a beat's line's); a pick that says nothing of them selects none. */
  readonly words?: Option.Option<WordsSelection>;
  /** A mark of a beat's line selected (the Script's); a pick that says nothing of it selects none. */
  readonly mark?: Option.Option<MarkSelection>;
  /** The Transcript view; a pick that says nothing of it leaves it shut. */
  readonly text?: Option.Option<TextOpen>;
  readonly loop: Option.Option<Interval>;
}

/** `T` in scene `id` of the film laid out as `placed`, to the ms (`onTheMs`). */
const tIn = (placed: ReadonlyArray<Placed>, id: string, T: number) =>
  Option.some(onTheMs(T - Option.getOrElse(startOf(placed, id), () => 0)));

/** A pick's name for `?…=`, kept only when it is of the path's scene `id` (a section's words, a line's mark, a beat's cue). */
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

/** The Lab's URL: the path names the cue's or knob's scene, else the words', else the scene under `T`. */
const labPageHref = (
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
        },
        tIn(placed, id, T),
        pick.loop,
      ),
  });
};

/**
 * The Script's URL: the path names the cue's beat, else the words', else the
 * mark's, else the beat under `T`. A knob, the studio's beat, the compare and
 * the views are the Lab's alone, so the Script prints none of them.
 */
const scriptHref = (
  film: string,
  placed: ReadonlyArray<Placed>,
  pick: LabPick,
  T: number,
): string => {
  const words = Option.flatten(Option.fromUndefinedOr(pick.words));
  const mark = Option.flatten(Option.fromUndefinedOr(pick.mark));
  const cue = Option.filter(pick.selection, (s) => s._tag === 'Cue');
  const scene = Option.firstSomeOf([
    Option.map(cue, (s) => s.scene),
    Option.map(words, (w) => w.scene),
    Option.map(mark, (m) => m.scene),
    Option.map(sceneAt(placed, T), (p) => p.spec.id),
  ]);
  const note = Option.getOrElse(pick.note, () => '');
  return Option.match(scene, {
    onNone: () => pageHref.script(film, Option.some(onTheMs(T)), note, pick.loop),
    onSome: (id) =>
      pageHref.scriptBeat(
        film,
        id,
        {
          cue: keyIn(cue, id, (c) => c.name),
          mark: keyIn(mark, id, (m) => m.name),
          words: keyIn(words, id, wordsText),
          note,
        },
        tIn(placed, id, T),
        pick.loop,
      ),
  });
};

/** Each of the Lab's pages' printer. */
const PRINTERS: Readonly<Record<LabRoot, typeof labPageHref>> = {
  lab: labPageHref,
  script: scriptHref,
};

/**
 * The URL of `root` (the Lab unless said) for `film` (laid out as `placed`)
 * at film seconds `T` with `pick`: the path names the selection's scene,
 * else the scene under `T`, and `#t=` is `T` in that scene, to the ms
 * (`onTheMs`).
 */
export const labHref = (
  film: string,
  placed: ReadonlyArray<Placed>,
  pick: LabPick,
  T: number,
  root: LabRoot = 'lab',
): string => PRINTERS[root](film, placed, pick, T);

/** A change that picks a cue, a mark, words or a note: on the Script, it lets the others go. */
const picksOne = (change: Partial<LabPick>): boolean =>
  'selection' in change || 'mark' in change || 'words' in change || 'note' in change;

/** What a change lets go of on each page beside what it names: on the Script, a pick lets the others go. */
const LET_GO: Readonly<Record<LabRoot, (change: Partial<LabPick>) => Partial<LabPick>>> = {
  lab: () => ({}),
  script: (change) =>
    Option.match(Option.liftPredicate(change, picksOne), {
      onNone: () => ({}),
      onSome: (): Partial<LabPick> => ({
        selection: Option.none(),
        mark: Option.none(),
        words: Option.none(),
        note: Option.none(),
      }),
    }),
};

/**
 * The URL at `href` (the Lab's or the Script's) with `change` made to what it
 * picks, at film seconds `T` (`labHref`), on the page it is on: what every
 * write of either prints, so each keeps what the others hold (a pick keeps
 * the loop, the time keeps the pick). The path names one scene, so the newer
 * of two picks in different scenes wins: words selected in another scene
 * than the cue or knob let it go, and a cue or knob picked in another scene
 * lets the words go (`labHref` keeps only the path's). The Script selects
 * one thing at a time: a cue, a mark, words or a note picked lets the
 * others go.
 */
export const labHrefWith = (
  film: string,
  placed: ReadonlyArray<Placed>,
  href: string,
  change: Partial<LabPick>,
  T: number,
): string => {
  const { root, selection, note, beat, view, code, words, mark, text, loop } = labPlaceOf(href);
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
      mark,
      text,
      loop,
      ...LET_GO[root](change),
      ...change,
    },
    T,
    root,
  );
};

/** Whether `selection` is the cue `name` of `scene`. */
export const selectsCue = (selection: Option.Option<Selection>, scene: string, name: string) =>
  Option.exists(selection, (s) => s._tag === 'Cue' && s.scene === scene && s.name === name);
