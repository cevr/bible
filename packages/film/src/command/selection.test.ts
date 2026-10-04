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
  sameSelection,
  selectionOf,
  selectionText,
} from './selection.ts';

const { Cue, Knob, Note, Point, Folder, Set, Version, Variant, Act, Film, Beat } = Selection.cases;

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

  test('every selection round-trips through its citation where the places have a key for it', () => {
    const here = pageHref.labScene('f', 'one');
    for (const s of [
      Cue.make({ scene: 'one', name: 'rise' }),
      Knob.make({ scene: 'one', name: 'size' }),
      Note.make({ id: 'n7' }),
      Point.make({ film: 'f', point: 'cold' }),
      Folder.make({ folder: 'renders' }),
      Set.make({ folder: 'renders', point: 'cold' }),
    ]) {
      expect(selectionOf(citeOf(s, here))).toEqual(Option.some(s));
    }
  });

  test('cites a selection with no key of its own by the place it is on, a variant by its card', () => {
    const here = pageHref.home();
    expect(citeOf(Version.make({ folder: 'r', point: 'cold', version: 'b' }), here)).toBe(
      pageHref.set('r', 'cold'),
    );
    expect(citeOf(Variant.make({ film: 'f', point: 'score', variant: 'piano' }), here)).toBe(
      pageHref.choices('f', 'score'),
    );
    expect(citeOf(Act.make({ film: 'f', act: 'one' }), here)).toBe(pageHref.project('f'));
    expect(citeOf(Film.make({ film: 'f' }), here)).toBe(pageHref.project('f'));
    expect(citeOf(Beat.make({ beat: 'b1' }), here)).toBe(here);
  });

  test("writes a cue's or a knob's lab keys", () => {
    expect(labKeysOf(cueOf('one', 'rise'))).toEqual({ cue: 'rise' });
    expect(labKeysOf(knobOf('one', 'size'))).toEqual({ knob: 'size' });
  });

  test('tells two selections of one thing from two of different things', () => {
    expect(sameSelection(cueOf('one', 'rise'), cueOf('one', 'rise'))).toBe(true);
    expect(sameSelection(cueOf('one', 'rise'), knobOf('one', 'rise'))).toBe(false);
    expect(sameSelection(cueOf('one', 'rise'), cueOf('two', 'rise'))).toBe(false);
  });

  test('reads as a person names it', () => {
    expect(selectionText(cueOf('cold', 'slam'))).toBe('cue slam in cold');
    expect(selectionText(Version.make({ folder: 'r', point: 'cold', version: 'b' }))).toBe(
      'version b of cold',
    );
  });
});
