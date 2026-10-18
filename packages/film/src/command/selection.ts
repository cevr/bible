// What a page has selected: one thing of the film's or the review's, as a
// tagged union every primitive reads (the context menu shows its commands,
// the inspector its fields, ⌘K and the keys act on it). A selection is
// written in the URL where the pages' places have a key for it (`Places`,
// core/api.ts): a film studio's beat or panel (`?sel=beat:<id>`,
// `?sel=panel:<id>`), its note open and its words selected (`?note=`,
// `?words=`), a folder and a comparison set (their
// paths), and the version of a set whose review inspector is open
// (`?inspect=`: `useInspectorPlace`). A multi-select is a list of the same
// union; only its first item is citable (a batch is an action, not a place).
// Pure.

import { Place } from '@bible/url-state';
import { Option, Schema } from 'effect';
import { ActName } from '../core/address-schema.ts';
import {
  Places,
  beatSelection,
  panelSelection,
  pageHref,
  reviewFileUrl,
  selectedBeat,
} from '../core/api.ts';

/** One selected thing. */
export const Selection = Schema.TaggedUnion({
  /** A film as a whole (its project's header, its card on the index). */
  Film: { film: Schema.String },
  /** An act of a film's project. */
  Act: { film: Schema.String, act: ActName },
  /** A scene of a film. */
  Scene: { film: Schema.String, scene: Schema.String },
  /**
   * Words `from`–`to` of a scene's line: a talk's section's take word
   * indices, a narrated beat's words as its line is said (`?words=`).
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
  /** A Board panel on the studio's timeline (`<beat>.<mark>`). */
  Panel: { panel: Schema.String },
});
export type Selection = typeof Selection.Type;

/** A selection's kind: its tag. */
export type SelectionTag = Selection['_tag'];

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
 * The selection a page's URL names: a studio's beat (the scene that beat
 * is), a set's version or the set, a folder. None where the URL names none.
 */
export const selectionOf = (href: string): Option.Option<Selection> =>
  Option.firstSomeOf<Selection>([
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

/**
 * The link that cites `selection` from the page at `href`: the page's own
 * place with the selection's key, where it has one. A beat, a panel, a
 * beat's words, a mark of its line and a note cited from a film's studio are
 * cited there, selected or open, at its playhead; a version cites its set
 * with its sheet open (`?inspect=`); a choice point, a variant, an act and
 * the film the film's studio. One cited from its own page (the set, the
 * studio) keeps how the page shows it and when; a selection with no key of
 * its own cites the place it is on.
 */
export const citeOf = (selection: Selection, href: string): string => {
  const studio = Place.decode(Places.studio, href);
  // A film, an act or a render is cited on the film's studio, as it is shown there.
  const onStudio = (film: string) =>
    Option.getOrElse(
      Option.map(
        Option.filter(studio, (v) => v.path.film === film),
        (v) => Place.href(Places.studio, v),
      ),
      () => pageHref.studio(film),
    );
  const studioOf = (s: Selection & { readonly film: string }) => onStudio(s.film);
  // A thing cited from a film's studio is cited there with `query`, at its playhead; else the page itself.
  const onStudioWith = (query: {
    readonly sel?: string;
    readonly note?: string;
    readonly words?: string;
  }) =>
    Option.getOrElse(
      Option.map(studio, (v) =>
        Place.href(Places.studio, {
          ...v,
          query: { ...v.query, try: 0, note: '', words: '', ...query },
        }),
      ),
      () => href,
    );
  return Selection.match(selection, {
    Film: studioOf,
    Act: studioOf,
    // A scene is cited on the studio, its beat selected, at the studio's playhead when cited from it.
    Scene: (s) =>
      pageHref.studio(
        s.film,
        { sel: beatSelection(s.scene) },
        Option.flatMap(
          Option.filter(studio, (v) => v.path.film === s.film),
          (v) => v.hash.t,
        ),
      ),
    Words: (s) => onStudioWith({ sel: beatSelection(s.scene), words: wordsText(s) }),
    // A mark of a beat's line: the studio on that beat, whose Words read its line.
    Mark: (s) => onStudioWith({ sel: beatSelection(s.scene) }),
    Note: (s) => onStudioWith({ note: s.id }),
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
    Beat: (s) => onStudioWith({ sel: beatSelection(s.beat) }),
    Panel: (s) => onStudioWith({ sel: panelSelection(s.panel) }),
  });
};

/** A selection as a person reads it: `beat cold`, `option b of cold`. */
export const selectionText = (selection: Selection): string =>
  Selection.match(selection, {
    Film: (s) => `film ${s.film}`,
    Act: (s) => `act ${s.act}`,
    Scene: (s) => `scene ${s.scene}`,
    Words: (s) => {
      if (s.from === s.to) return `word ${s.from} of ${s.scene}`;
      return `words ${s.from}–${s.to} of ${s.scene}`;
    },
    Mark: (s) => `mark ${s.name} in ${s.scene}`,
    Note: (s) => `note ${s.id}`,
    Panel: (s) => `panel ${s.panel}`,
    Folder: (s) => `folder ${s.folder}`,
    Set: (s) => `set ${s.point}`,
    Version: (s) => `option ${s.version} of ${s.point}`,
    File: (s) => `file ${s.ref}`,
    Point: (s) => s.point,
    Variant: (s) => `${s.variant} of ${s.point}`,
    Beat: (s) => `beat ${s.beat}`,
  });
