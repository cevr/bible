import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { Places, pageHref } from '../core/api.ts';
import { Place } from '@bible/url-state';
import {
  Selection,
  citeOf,
  cueOf,
  knobOf,
  labKeysOf,
  selectionOf,
  selectionText,
} from './selection.ts';

const { Cue, Knob, Note, Point, Folder, Set, Version, Variant, Act, Film, Beat, Scene } =
  Selection.cases;

describe("a selection in the pages' URLs", () => {
  test('reads the lab scene keys as a cue, a knob or a note, cue first', () => {
    expect(selectionOf(pageHref.labScene('f', 'one', { cue: 'rise' }))).toEqual(
      Option.some(Cue.make({ scene: 'one', name: 'rise' })),
    );
    expect(selectionOf(pageHref.labScene('f', 'one', { knob: 'size' }))).toEqual(
      Option.some(Knob.make({ scene: 'one', name: 'size' })),
    );
    expect(selectionOf(pageHref.labScene('f', 'one', { note: 'n7' }))).toEqual(
      Option.some(Note.make({ id: 'n7' })),
    );
    expect(selectionOf(pageHref.labScene('f', 'one', { cue: 'rise', note: 'n7' }))).toEqual(
      Option.some(Cue.make({ scene: 'one', name: 'rise' })),
    );
    expect(selectionOf(pageHref.labScene('f', 'one'))).toEqual(Option.none());
  });

  test("reads a project's card, a folder and a comparison set", () => {
    expect(selectionOf(pageHref.project('f', 'cold'))).toEqual(
      Option.some(Point.make({ film: 'f', point: 'cold' })),
    );
    expect(selectionOf(pageHref.project('f'))).toEqual(Option.none());
    expect(selectionOf(pageHref.set('renders', 'cold'))).toEqual(
      Option.some(Set.make({ folder: 'renders', point: 'cold' })),
    );
    expect(selectionOf(pageHref.folder('renders'))).toEqual(
      Option.some(Folder.make({ folder: 'renders' })),
    );
    expect(selectionOf(pageHref.home())).toEqual(Option.none());
  });

  test("reads a film's Scenes path's scene as the scene selected, and cites it there at the playhead", () => {
    const at = pageHref.scene('f', 'two', Option.some(42));
    expect(selectionOf(at)).toEqual(Option.some(Scene.make({ film: 'f', scene: 'two' })));
    expect(selectionOf(pageHref.scenes('f'))).toEqual(Option.none());
    // On the Scenes, another scene is cited on the tape, at the same film time.
    expect(citeOf(Scene.make({ film: 'f', scene: 'one' }), at)).toBe(
      pageHref.scene('f', 'one', Option.some(42)),
    );
    // Elsewhere a scene is cited as its lab.
    expect(citeOf(Scene.make({ film: 'f', scene: 'one' }), pageHref.project('f'))).toBe(
      pageHref.labScene('f', 'one'),
    );
  });

  test('cites a lab selection on the page it is on, keeping the time in the same scene', () => {
    const here = pageHref.labScene('f', 'one', {}, Option.some(1.5));
    const rise = citeOf(Cue.make({ scene: 'one', name: 'rise' }), here);
    expect(rise).toBe(pageHref.labScene('f', 'one', { cue: 'rise' }, Option.some(1.5)));
    expect(selectionOf(rise)).toEqual(Option.some(Cue.make({ scene: 'one', name: 'rise' })));
    expect(Option.map(Place.decode(Places.labScene, rise), (v) => v.hash.t)).toEqual(
      Option.some(Option.some(1.5)),
    );
    // Another scene's knob drops this scene's time.
    expect(citeOf(Knob.make({ scene: 'two', name: 'size' }), here)).toBe(
      pageHref.labScene('f', 'two', { knob: 'size' }),
    );
    expect(selectionOf(citeOf(Note.make({ id: 'n7' }), here))).toEqual(
      Option.some(Note.make({ id: 'n7' })),
    );
    expect(selectionOf(citeOf(Note.make({ id: 'n7' }), pageHref.lab('f')))).toEqual(
      Option.some(Note.make({ id: 'n7' })),
    );
  });

  test("cites the studio's beat in the lab's scene at its time (?beat=), else in the beat's own scene", () => {
    const here = pageHref.labScene('f', 'one', {}, Option.some(1.5));
    expect(citeOf(Beat.make({ beat: 'two' }), here)).toBe(
      pageHref.labScene('f', 'one', { beat: 'two' }, Option.some(1.5)),
    );
    expect(citeOf(Beat.make({ beat: 'two' }), pageHref.lab('f', Option.some(9)))).toBe(
      pageHref.labScene('f', 'two', { beat: 'two' }),
    );
    // A cue picked wins the URL's selection over the beat, as it does over a note.
    expect(selectionOf(pageHref.labScene('f', 'one', { cue: 'rise', beat: 'two' }))).toEqual(
      Option.some(Cue.make({ scene: 'one', name: 'rise' })),
    );
  });

  test('every selection round-trips through its citation where the places have a key for it', () => {
    const here = pageHref.labScene('f', 'one');
    for (const s of [
      Cue.make({ scene: 'one', name: 'rise' }),
      Knob.make({ scene: 'one', name: 'size' }),
      Note.make({ id: 'n7' }),
      Beat.make({ beat: 'two' }),
      Point.make({ film: 'f', point: 'cold' }),
      Folder.make({ folder: 'renders' }),
      Set.make({ folder: 'renders', point: 'cold' }),
      Version.make({ folder: 'renders', point: 'cold', version: 'b' }),
      Variant.make({ film: 'f', point: 'score', variant: 'piano' }),
    ]) {
      expect(selectionOf(citeOf(s, here))).toEqual(Option.some(s));
    }
  });

  test("reads a set's and Choices' `?inspect=` as the version or the variant whose sheet is open; none open, as before", () => {
    expect(selectionOf('/sets/r/cold?view=wipe&other=b&inspect=b')).toEqual(
      Option.some(Version.make({ folder: 'r', point: 'cold', version: 'b' })),
    );
    expect(selectionOf('/sets/r/cold?view=wipe&other=b')).toEqual(
      Option.some(Set.make({ folder: 'r', point: 'cold' })),
    );
    expect(selectionOf('/films/f/choices?point=score&inspect=piano&heard=score')).toEqual(
      Option.some(Variant.make({ film: 'f', point: 'score', variant: 'piano' })),
    );
    // A card in focus with no sheet open is the choice point itself (US2-2).
    expect(selectionOf('/films/f/choices?point=score')).toEqual(
      Option.some(Point.make({ film: 'f', point: 'score' })),
    );
    expect(selectionOf('/films/f/choices')).toEqual(Option.none());
  });

  test("reads the project's `?point=` as the page does: an act's sheet, the film's, a scene's render (H-10)", () => {
    expect(selectionOf('/films/f/project?point=render%3Aact%3Aopening')).toEqual(
      Option.some(Act.make({ film: 'f', act: 'opening' })),
    );
    expect(selectionOf('/films/f/project?point=render%3Afilm')).toEqual(
      Option.some(Film.make({ film: 'f' })),
    );
    expect(selectionOf('/films/f/project?point=render%3Ascenes%3Aroof')).toEqual(
      Option.some(Point.make({ film: 'f', point: 'render:scenes:roof' })),
    );
  });

  test('cites a version and a variant with their sheets open; one with no key of its own by the place it is on', () => {
    const here = pageHref.home();
    expect(citeOf(Version.make({ folder: 'r', point: 'cold', version: 'b' }), here)).toBe(
      '/sets/r/cold?inspect=b',
    );
    expect(citeOf(Variant.make({ film: 'f', point: 'score', variant: 'piano' }), here)).toBe(
      '/films/f/choices?point=score&inspect=piano',
    );
    expect(citeOf(Beat.make({ beat: 'b1' }), here)).toBe(here);
  });

  test("cites a choice's card on Choices, and a part's render, an act and the film by their project sheets (H-10, US2-2)", () => {
    const here = pageHref.home();
    expect(citeOf(Point.make({ film: 'f', point: 'score' }), here)).toBe(
      '/films/f/choices?point=score',
    );
    expect(citeOf(Point.make({ film: 'f', point: 'render:scenes:roof' }), here)).toBe(
      '/films/f/project?point=render%3Ascenes%3Aroof',
    );
    expect(
      citeOf(Variant.make({ film: 'f', point: 'render:scenes:roof', variant: 'main' }), here),
    ).toBe('/films/f/project?point=render%3Ascenes%3Aroof');
    expect(citeOf(Act.make({ film: 'f', act: 'opening' }), here)).toBe(
      '/films/f/project?point=render%3Aact%3Aopening',
    );
    expect(citeOf(Film.make({ film: 'f' }), here)).toBe('/films/f/project?point=render%3Afilm');
    for (const s of [
      Act.make({ film: 'f', act: 'opening' }),
      Film.make({ film: 'f' }),
      Point.make({ film: 'f', point: 'score' }),
      Point.make({ film: 'f', point: 'render:scenes:roof' }),
    ])
      expect(selectionOf(citeOf(s, here))).toEqual(Option.some(s));
  });

  test('a version or a variant cited on its own page keeps how the page shows it and when (US2-4)', () => {
    const set = '/sets/r/cold?view=moments&m=2#t=12.5';
    expect(citeOf(Version.make({ folder: 'r', point: 'cold', version: 'b' }), set)).toBe(
      '/sets/r/cold?view=moments&m=2&inspect=b#t=12.5',
    );
    // Another set's version opens at its own defaults.
    expect(citeOf(Version.make({ folder: 'r', point: 'warm', version: 'b' }), set)).toBe(
      '/sets/r/warm?inspect=b',
    );
    const choices = '/films/f/choices?point=look&heard=score&variant=ensemble#t=3';
    expect(citeOf(Variant.make({ film: 'f', point: 'score', variant: 'piano' }), choices)).toBe(
      '/films/f/choices?point=score&inspect=piano&heard=score&variant=ensemble#t=3',
    );
    expect(citeOf(Point.make({ film: 'f', point: 'score' }), choices)).toBe(
      '/films/f/choices?point=score&heard=score&variant=ensemble#t=3',
    );
    const project = '/films/f/project?point=render%3Afilm&picture=p2#t=4';
    expect(citeOf(Act.make({ film: 'f', act: 'opening' }), project)).toBe(
      '/films/f/project?point=render%3Aact%3Aopening&picture=p2#t=4',
    );
  });

  test("writes a cue's or a knob's lab keys", () => {
    expect(labKeysOf(cueOf('one', 'rise'))).toEqual({ cue: 'rise' });
    expect(labKeysOf(knobOf('one', 'size'))).toEqual({ knob: 'size' });
  });

  test('reads as a person names it', () => {
    expect(selectionText(cueOf('cold', 'slam'))).toBe('cue slam in cold');
    expect(selectionText(Version.make({ folder: 'r', point: 'cold', version: 'b' }))).toBe(
      'version b of cold',
    );
  });
});
