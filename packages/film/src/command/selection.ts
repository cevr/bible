// What a page has selected: one thing of the film's or the review's, as a
// tagged union every primitive reads (the context menu shows its commands,
// the inspector its fields, ⌘K and the keys act on it). A selection is
// written in the URL where the pages' places have a key for it (`Places`,
// core/api.ts): the lab's cue, knob, note and the studio's beat
// (`?cue=`, `?knob=`, `?note=`, `?beat=` in a scene's path), a film
// studio's beat (`?sel=beat:<id>`), a folder and a comparison set (their
// paths), and the version of a set whose review inspector is open
// (`?inspect=`: `useInspectorPlace`). A multi-select is a list of the same
// union; only its first item is citable (a batch is an action, not a place).
// Pure.

import { Place } from '@bible/url-state';
import { Match, Option, Schema } from 'effect';
import { ActName } from '../core/address-schema.ts';
import {
  type CompareView,
  Places,
  beatSelection,
  pageHref,
  reviewFileUrl,
  selectedBeat,
} from '../core/api.ts';
import type { Interval } from '../core/time.ts';

/** One selected thing. */
export const Selection = Schema.TaggedUnion({
  /** A film as a whole (its project's header, its card on the index). */
  Film: { film: Schema.String },
  /** An act of a film's project. */
  Act: { film: Schema.String, act: ActName },
  /** A scene of a film. */
  Scene: { film: Schema.String, scene: Schema.String },
  /** A cue of a scene, by its name. */
  Cue: { scene: Schema.String, name: Schema.String },
  /** A knob of a scene, by its name. */
  Knob: { scene: Schema.String, name: Schema.String },
  /** A line of a scene's code in the Source view, from 1 (a press on it: not a place of its own, `?code=` holds it). */
  Line: { scene: Schema.String, line: Schema.Finite },
  /**
   * Words `from`–`to` of a scene's line: a talk's section's take word
   * indices in the Transcript view, a narrated beat's words as its line is
   * said on the Script (`?words=`).
   */
  Words: { scene: Schema.String, from: Schema.Finite, to: Schema.Finite },
  /** A mark of a beat's line (`{name}` in its `say`), by its name, on the Script (`?mark=`). */
  Mark: { scene: Schema.String, name: Schema.String },
  /** A note of the lab's feed, by its id. */
  Note: { id: Schema.String },
  /** A folder of renders (its card on the index). */
  Folder: { folder: Schema.String },
  /** A comparison set of a folder of renders. */
  Set: { folder: Schema.String, point: Schema.String },
  /** One version of a comparison set. */
  Version: { folder: Schema.String, point: Schema.String, version: Schema.String },
  /** A file of a folder of renders in no set (a loose video), by its ref. */
  File: { ref: Schema.String },
  /** A choice point of a film (a scene's render on the project, a score, a look). */
  Point: { film: Schema.String, point: Schema.String },
  /** A variant of a film's choice point. */
  Variant: { film: Schema.String, point: Schema.String, variant: Schema.String },
  /** A beat of the studio's script. */
  Beat: { beat: Schema.String },
});
export type Selection = typeof Selection.Type;

/** A selection's kind: its tag. */
export type SelectionTag = Selection['_tag'];

/** What the lab's URL selects in a scene: a cue or a knob. */
export type LabSelection = typeof Selection.cases.Cue.Type | typeof Selection.cases.Knob.Type;

/** A cue of `scene`. */
export const cueOf = (scene: string, name: string): LabSelection =>
  Selection.cases.Cue.make({ scene, name });

/** A knob of `scene`. */
export const knobOf = (scene: string, name: string): LabSelection =>
  Selection.cases.Knob.make({ scene, name });

/** The lab's selection keys a cue or a knob writes (`?cue=` or `?knob=`). */
export const labKeysOf = (
  selection: LabSelection,
): { readonly cue?: string; readonly knob?: string } =>
  Match.value(selection).pipe(
    Match.withReturnType<{ readonly cue?: string; readonly knob?: string }>(),
    Match.tagsExhaustive({ Cue: (s) => ({ cue: s.name }), Knob: (s) => ({ knob: s.name }) }),
  );

/** A talk's words selected, as `?words=` holds them. */
export type WordsSelection = typeof Selection.cases.Words.Type;

/** `?words=<a>-<b>` read: take word indices, the first not after the last; none for anything else. */
export const wordsIn = (scene: string, text: string): Option.Option<WordsSelection> =>
  Option.flatMap(Option.fromNullishOr(/^(\d{1,6})-(\d{1,6})$/.exec(text)), ([, a, b]) =>
    Option.map(
      Option.liftPredicate({ from: Number(a), to: Number(b) }, (w) => w.from <= w.to),
      (w) => Selection.cases.Words.make({ scene, ...w }),
    ),
  );

/** `?words=`'s value for words `from`–`to`. */
export const wordsText = (words: { readonly from: number; readonly to: number }): string =>
  `${words.from}-${words.to}`;

/**
 * The selection a page's URL names: a lab scene's cue, knob, words or note,
 * a studio's beat, a folder, a comparison set. None where the URL names none.
 */
export const selectionOf = (href: string): Option.Option<Selection> =>
  Option.firstSomeOf<Selection>([
    Option.flatMap(Place.decode(Places.labScene, href), ({ path, query }) =>
      Option.firstSomeOf<Selection>([
        Option.map(named(query.cue), (name) =>
          Selection.cases.Cue.make({ scene: path.scene, name }),
        ),
        Option.map(named(query.knob), (name) =>
          Selection.cases.Knob.make({ scene: path.scene, name }),
        ),
        wordsIn(path.scene, query.words),
        Option.map(named(query.note), (id) => Selection.cases.Note.make({ id })),
        Option.map(named(query.beat), (beat) => Selection.cases.Beat.make({ beat })),
      ]),
    ),
    Option.flatMap(Place.decode(Places.lab, href), ({ query }) =>
      Option.map(named(query.note), (id) => Selection.cases.Note.make({ id })),
    ),
    // The studio's beat (`?sel=beat:<id>`): the scene that beat is.
    Option.flatMap(Place.decode(Places.studio, href), ({ path, query }) =>
      Option.map(selectedBeat(query.sel), (scene) =>
        Selection.cases.Scene.make({ film: path.film, scene }),
      ),
    ),
    // A set's version whose sheet is open (`?inspect=`), else the set.
    Option.map(Place.decode(Places.set, href), ({ path, query }) =>
      Option.match(named(query.inspect), {
        onNone: (): Selection => Selection.cases.Set.make(path),
        onSome: (version) => Selection.cases.Version.make({ ...path, version }),
      }),
    ),
    Option.map(Place.decode(Places.folder, href), ({ path }) => Selection.cases.Folder.make(path)),
  ]);

const named = (value: string): Option.Option<string> =>
  Option.liftPredicate(value, (v) => v !== '');

/** The Lab page a selection of the Lab's is cited from: its film, its path's scene, its compare, its time and loop. */
interface CitingPage {
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly view: CompareView;
  readonly t: Option.Option<number>;
  readonly loop: Option.Option<Interval>;
}

/** The Lab page at `href`, if it is one. */
const citingPageOf = (href: string): Option.Option<CitingPage> =>
  Option.firstSomeOf<CitingPage>([
    Option.map(Place.decode(Places.labScene, href), (v) => ({
      film: v.path.film,
      scene: Option.some(v.path.scene),
      view: v.query.view,
      ...v.hash,
    })),
    Option.map(Place.decode(Places.lab, href), (v) => ({
      film: v.path.film,
      scene: Option.none(),
      view: v.query.view,
      ...v.hash,
    })),
  ]);

/**
 * The link that cites `selection` from the page at `href`: the page's own
 * place with the selection's key, where it has one. A selection of the
 * Lab's keeps the page's path scene unless it names its own, and the page's
 * time; a mark of a beat's line is cited on the studio, its beat selected; a
 * version cites its set with its sheet open (`?inspect=`); a choice point, a
 * variant, an act and the film the film's studio. One cited from its own
 * page (the set, the studio) keeps how the page shows it and when; a
 * selection with no key of its own cites the place it is on.
 */
export const citeOf = (selection: Selection, href: string): string => {
  const lab = citingPageOf(href);
  // The page's time, in `scene` when the page's path names it.
  const timeIn = (l: CitingPage, scene: string) =>
    Option.filter(l.t, () => Option.contains(l.scene, scene));
  const inLab = (
    scene: string,
    keys: {
      cue?: string;
      knob?: string;
      note?: string;
      beat?: string;
      code?: string;
      words?: string;
      text?: string;
    },
  ) =>
    Option.match(lab, {
      onNone: () => href,
      onSome: (l) =>
        pageHref.labScene(l.film, scene, { ...keys, view: l.view }, timeIn(l, scene), l.loop),
    });
  // A film, an act or a render is cited on the film's studio, as it is shown there.
  const onStudio = (film: string) =>
    Option.getOrElse(
      Option.map(
        Option.filter(Place.decode(Places.studio, href), (v) => v.path.film === film),
        (v) => Place.href(Places.studio, v),
      ),
      () => pageHref.studio(film),
    );
  const studioOf = (s: Selection & { readonly film: string }) => onStudio(s.film);
  return Selection.match(selection, {
    Film: studioOf,
    Act: studioOf,
    // A scene is cited on the studio, its beat selected, at the studio's playhead when cited from it.
    Scene: (s) =>
      pageHref.studio(
        s.film,
        { sel: beatSelection(s.scene) },
        Option.flatMap(
          Option.filter(Place.decode(Places.studio, href), (v) => v.path.film === s.film),
          (v) => v.hash.t,
        ),
      ),
    Cue: (s) => inLab(s.scene, { cue: s.name }),
    Knob: (s) => inLab(s.scene, { knob: s.name }),
    // A line of the scene's code is cited as the view held on it.
    Line: (s) => inLab(s.scene, { code: String(s.line) }),
    // Words are cited selected; in the Lab, the Transcript view held on the first.
    Words: (s) => inLab(s.scene, { words: wordsText(s), text: String(s.from) }),
    // A mark of a beat's line: the studio on that beat, whose Words read its line.
    Mark: (s) =>
      Option.match(lab, {
        onNone: () => href,
        onSome: (l) => pageHref.studio(l.film, { sel: beatSelection(s.scene) }),
      }),
    Note: (s) =>
      Option.match(lab, {
        onNone: () => href,
        onSome: (l) =>
          Option.match(l.scene, {
            onNone: () =>
              Place.href(Places.lab, {
                path: { film: l.film },
                query: { note: s.id, view: l.view },
                hash: { t: l.t, loop: l.loop },
              }),
            onSome: (scene) =>
              pageHref.labScene(l.film, scene, { note: s.id, view: l.view }, l.t, l.loop),
          }),
      }),
    Folder: (s) => pageHref.folder(s.folder),
    Set: (s) => pageHref.set(s.folder, s.point),
    Version: (s) =>
      Option.getOrElse(
        Option.map(
          Option.filter(
            Place.decode(Places.set, href),
            (v) => v.path.folder === s.folder && v.path.point === s.point,
          ),
          (v) => Place.href(Places.set, { ...v, query: { ...v.query, inspect: s.version } }),
        ),
        () => pageHref.set(s.folder, s.point, s.version),
      ),
    // A file is cited as itself: its link opens the file.
    File: (s) => reviewFileUrl(s.ref),
    Point: (s) => onStudio(s.film),
    Variant: (s) => onStudio(s.film),
    // A beat in the lab's scene it is cited from, else in its own (a beat is a scene's take).
    Beat: (s) =>
      inLab(
        Option.getOrElse(
          Option.flatMap(lab, (l) => l.scene),
          () => s.beat,
        ),
        { beat: s.beat },
      ),
  });
};

/** A selection as a person reads it: `cue slam in cold`, `version b of cold`. */
export const selectionText = (selection: Selection): string =>
  Selection.match(selection, {
    Film: (s) => `film ${s.film}`,
    Act: (s) => `act ${s.act}`,
    Scene: (s) => `scene ${s.scene}`,
    Cue: (s) => `cue ${s.name} in ${s.scene}`,
    Knob: (s) => `knob ${s.name} in ${s.scene}`,
    Line: (s) => `line ${s.line} of ${s.scene}`,
    Words: (s) => {
      if (s.from === s.to) return `word ${s.from} of ${s.scene}`;
      return `words ${s.from}–${s.to} of ${s.scene}`;
    },
    Mark: (s) => `mark ${s.name} in ${s.scene}`,
    Note: (s) => `note ${s.id}`,
    Folder: (s) => `folder ${s.folder}`,
    Set: (s) => `set ${s.point}`,
    Version: (s) => `option ${s.version} of ${s.point}`,
    File: (s) => `file ${s.ref}`,
    Point: (s) => s.point,
    Variant: (s) => `${s.variant} of ${s.point}`,
    Beat: (s) => `beat ${s.beat}`,
  });
