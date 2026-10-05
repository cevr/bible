// What a page has selected: one thing of the film's or the review's, as a
// tagged union every primitive reads (the context menu shows its commands,
// the inspector its fields, ⌘K and the keys act on it). A selection is
// written in the URL only where the pages' places already have a key for it
// (`Places`, core/api.ts; PA-1/PA-4): the lab's cue, knob and note
// (`?cue=`, `?knob=`, `?note=` in a scene's path), a project's card
// (`?point=`), a scene on a film's Scenes, a folder and a comparison set
// (their paths), and the thing whose review inspector is open (a variant on
// Choices and a version of a set, `?inspect=`; a project's part, its
// `?point=`: `useInspectorPlace`). The rest (a beat) is the page's own and
// dies with it. A multi-select is a list of the same union; only its first
// item is citable (a batch is an action, not a place). Pure.

import { Place } from '@bible/url-state';
import { Equal, Match, Option, Schema } from 'effect';
import { Places, pageHref } from '../core/api.ts';

/** One selected thing. */
export const Selection = Schema.TaggedUnion({
  /** A film as a whole (its project's header, its card on the index). */
  Film: { film: Schema.String },
  /** An act of a film's project. */
  Act: { film: Schema.String, act: Schema.String },
  /** A scene of a film. */
  Scene: { film: Schema.String, scene: Schema.String },
  /** A cue of a scene, by its name. */
  Cue: { scene: Schema.String, name: Schema.String },
  /** A knob of a scene, by its name. */
  Knob: { scene: Schema.String, name: Schema.String },
  /** A note of the lab's feed, by its id. */
  Note: { id: Schema.String },
  /** A folder of renders (its card on the index). */
  Folder: { folder: Schema.String },
  /** A comparison set of a folder of renders. */
  Set: { folder: Schema.String, point: Schema.String },
  /** One version of a comparison set. */
  Version: { folder: Schema.String, point: Schema.String, version: Schema.String },
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

/** Whether two selections name the same thing. */
export const sameSelection = (a: Selection, b: Selection): boolean => Equal.equals(a, b);

/**
 * The selection a page's URL names: a lab scene's cue, knob or note, a
 * project's card, a folder, a comparison set. None where the URL names none.
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
        Option.map(named(query.note), (id) => Selection.cases.Note.make({ id })),
      ]),
    ),
    Option.flatMap(Place.decode(Places.lab, href), ({ query }) =>
      Option.map(named(query.note), (id) => Selection.cases.Note.make({ id })),
    ),
    Option.map(Place.decode(Places.scene, href), ({ path }) =>
      Selection.cases.Scene.make({ film: path.film, scene: path.scene }),
    ),
    Option.flatMap(Place.decode(Places.project, href), ({ path, query }) =>
      Option.map(named(query.point), (point) =>
        Selection.cases.Point.make({ film: path.film, point }),
      ),
    ),
    // A set's version whose sheet is open (`?inspect=`), else the set.
    Option.map(Place.decode(Places.set, href), ({ path, query }) =>
      Option.match(named(query.inspect), {
        onNone: (): Selection => Selection.cases.Set.make(path),
        onSome: (version) => Selection.cases.Version.make({ ...path, version }),
      }),
    ),
    // Choices' variant whose sheet is open: `?inspect=` of the card in focus (`?point=`).
    Option.flatMap(Place.decode(Places.choices, href), ({ path, query }) =>
      Option.flatMap(named(query.point), (point) =>
        Option.map(named(query.inspect), (variant) =>
          Selection.cases.Variant.make({ film: path.film, point, variant }),
        ),
      ),
    ),
    Option.map(Place.decode(Places.folder, href), ({ path }) => Selection.cases.Folder.make(path)),
  ]);

const named = (value: string): Option.Option<string> =>
  Option.liftPredicate(value, (v) => v !== '');

/**
 * The link that cites `selection` from the page at `href`: the page's own
 * place with the selection's key, where it has one. A lab selection keeps
 * the page's path scene unless it names its own, and the page's time; a
 * version cites its set and a variant its card on Choices, each with its
 * sheet open (`?inspect=`); a selection with no key of its own cites the
 * place it is on (an act its project, a beat the lab).
 */
export const citeOf = (selection: Selection, href: string): string => {
  const lab = Option.orElse(
    Option.map(Place.decode(Places.labScene, href), (v) => ({
      film: v.path.film,
      scene: Option.some(v.path.scene),
      view: v.query.view,
      t: v.hash.t,
      loop: v.hash.loop,
    })),
    () =>
      Option.map(Place.decode(Places.lab, href), (v) => ({
        film: v.path.film,
        scene: Option.none<string>(),
        view: v.query.view,
        t: v.hash.t,
        loop: v.hash.loop,
      })),
  );
  const inLab = (scene: string, keys: { cue?: string; knob?: string; note?: string }) =>
    Option.match(lab, {
      onNone: () => href,
      onSome: (l) =>
        pageHref.labScene(
          l.film,
          scene,
          { ...keys, view: l.view },
          Option.filter(l.t, () => Option.contains(l.scene, scene)),
          l.loop,
        ),
    });
  return Selection.match(selection, {
    Film: (s) => pageHref.project(s.film),
    Act: (s) => pageHref.project(s.film),
    // On a film's Scenes a scene is cited on the tape, at the playhead; elsewhere, as its lab.
    Scene: (s) =>
      Option.match(
        Option.orElse(
          Option.map(Place.decode(Places.scene, href), (v) => v.hash.t),
          () => Option.map(Place.decode(Places.scenes, href), (v) => v.hash.t),
        ),
        {
          onNone: () => pageHref.labScene(s.film, s.scene),
          onSome: (t) => pageHref.scene(s.film, s.scene, t),
        },
      ),
    Cue: (s) => inLab(s.scene, { cue: s.name }),
    Knob: (s) => inLab(s.scene, { knob: s.name }),
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
    Version: (s) => pageHref.set(s.folder, s.point, s.version),
    Point: (s) => pageHref.project(s.film, s.point),
    Variant: (s) => pageHref.choices(s.film, s.point, s.variant),
    Beat: () => href,
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
    Note: (s) => `note ${s.id}`,
    Folder: (s) => `folder ${s.folder}`,
    Set: (s) => `set ${s.point}`,
    Version: (s) => `version ${s.version} of ${s.point}`,
    Point: (s) => s.point,
    Variant: (s) => `${s.variant} of ${s.point}`,
    Beat: (s) => `beat ${s.beat}`,
  });
