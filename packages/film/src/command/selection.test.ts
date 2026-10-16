import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { ActName } from '../core/address-schema.ts';
import { Places, beatSelection, pageHref } from '../core/api.ts';
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

const OPENING = ActName.make('opening');

const {
  Cue,
  Knob,
  Mark,
  Words,
  Note,
  Point,
  Folder,
  Set,
  Version,
  Variant,
  Act,
  Film,
  Beat,
  Scene,
} = Selection.cases;

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

  test('reads a folder and a comparison set', () => {
    expect(selectionOf(pageHref.set('renders', 'cold'))).toEqual(
      Option.some(Set.make({ folder: 'renders', point: 'cold' })),
    );
    expect(selectionOf(pageHref.folder('renders'))).toEqual(
      Option.some(Folder.make({ folder: 'renders' })),
    );
    expect(selectionOf(pageHref.home())).toEqual(Option.none());
  });

  test("reads the studio's beat as the scene selected, and cites a scene on the studio, at its playhead there", () => {
    const at = pageHref.studio('f', { sel: beatSelection('two') }, Option.some(42));
    expect(selectionOf(at)).toEqual(Option.some(Scene.make({ film: 'f', scene: 'two' })));
    expect(selectionOf(pageHref.studio('f'))).toEqual(Option.none());
    // On the studio, another scene is cited with its beat selected, at the same film time.
    expect(citeOf(Scene.make({ film: 'f', scene: 'one' }), at)).toBe(
      pageHref.studio('f', { sel: beatSelection('one') }, Option.some(42)),
    );
    // Elsewhere a scene is cited on its film's studio, at the studio's own start.
    expect(citeOf(Scene.make({ film: 'f', scene: 'one' }), pageHref.home())).toBe(
      pageHref.studio('f', { sel: beatSelection('one') }),
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

  test('cites a line of the code as the Source view held on it, at the time of the scene', () => {
    const here = pageHref.labScene('f', 'one', {}, Option.some(1.5));
    const line = Selection.cases.Line.make({ scene: 'one', line: 42 });
    expect(citeOf(line, here)).toBe(
      pageHref.labScene('f', 'one', { code: '42' }, Option.some(1.5)),
    );
    expect(selectionText(line)).toBe('line 42 of one');
  });

  test("reads a talk's words (?words=<a>-<b>) and cites them selected, the Transcript view held on the first", () => {
    const here = pageHref.labScene('f', 'law', {}, Option.some(1.5));
    const words = Selection.cases.Words.make({ scene: 'law', from: 3, to: 4 });
    expect(selectionOf(pageHref.labScene('f', 'law', { words: '3-4' }))).toEqual(
      Option.some(words),
    );
    expect(citeOf(words, here)).toBe(
      pageHref.labScene('f', 'law', { words: '3-4', text: '3' }, Option.some(1.5)),
    );
    expect(selectionOf(citeOf(words, here))).toEqual(Option.some(words));
    expect(selectionText(words)).toBe('words 3–4 of law');
    expect(selectionText(Selection.cases.Words.make({ scene: 'law', from: 2, to: 2 }))).toBe(
      'word 2 of law',
    );
    // Anything but a range, first to last, selects nothing, and an old link has no key.
    for (const bad of ['4-3', '3', 'a-b', '-1-2', ''])
      expect(selectionOf(pageHref.labScene('f', 'law', { words: bad }))).toEqual(Option.none());
    expect(pageHref.labScene('f', 'law')).toBe('/films/f/lab/law');
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
      Words.make({ scene: 'one', from: 2, to: 5 }),
      Note.make({ id: 'n7' }),
      Beat.make({ beat: 'two' }),
      Folder.make({ folder: 'renders' }),
      Set.make({ folder: 'renders', point: 'cold' }),
      Version.make({ folder: 'renders', point: 'cold', version: 'b' }),
    ]) {
      expect(selectionOf(citeOf(s, here))).toEqual(Option.some(s));
    }
  });

  test("cites a mark on the studio, its beat selected, whose Words read the beat's line", () => {
    expect(citeOf(Mark.make({ scene: 'one', name: 'fall' }), pageHref.labScene('f', 'one'))).toBe(
      pageHref.studio('f', { sel: beatSelection('one') }),
    );
    expect(selectionText(Mark.make({ scene: 'one', name: 'fall' }))).toBe('mark fall in one');
  });

  test("reads a set's `?inspect=` as the version whose sheet is open; none open, as before", () => {
    expect(selectionOf('/sets/r/cold?view=wipe&other=b&inspect=b')).toEqual(
      Option.some(Version.make({ folder: 'r', point: 'cold', version: 'b' })),
    );
    expect(selectionOf('/sets/r/cold?view=wipe&other=b')).toEqual(
      Option.some(Set.make({ folder: 'r', point: 'cold' })),
    );
  });

  test('cites a version with its sheet open; one with no key of its own by the place it is on', () => {
    const here = pageHref.home();
    expect(citeOf(Version.make({ folder: 'r', point: 'cold', version: 'b' }), here)).toBe(
      '/sets/r/cold?inspect=b',
    );
    expect(citeOf(Beat.make({ beat: 'b1' }), here)).toBe(here);
  });

  test("cites a choice, a part's render, an act and the film on the film's studio (H-10, US2-2)", () => {
    const here = pageHref.home();
    for (const s of [
      Point.make({ film: 'f', point: 'score' }),
      Variant.make({ film: 'f', point: 'score', variant: 'piano' }),
      Point.make({ film: 'f', point: 'render:scenes:roof' }),
      Variant.make({ film: 'f', point: 'render:scenes:roof', variant: 'main' }),
      Act.make({ film: 'f', act: OPENING }),
      Film.make({ film: 'f' }),
    ])
      expect(citeOf(s, here)).toBe('/films/f/studio');
  });

  test('a version cited on its own page, or a choice on the studio, keeps how the page shows it and when (US2-4)', () => {
    const set = '/sets/r/cold?view=moments&m=2#t=12.5';
    expect(citeOf(Version.make({ folder: 'r', point: 'cold', version: 'b' }), set)).toBe(
      '/sets/r/cold?view=moments&m=2&inspect=b#t=12.5',
    );
    // Another set's version opens at its own defaults.
    expect(citeOf(Version.make({ folder: 'r', point: 'warm', version: 'b' }), set)).toBe(
      '/sets/r/warm?inspect=b',
    );
    const studio = '/films/f/studio?v=2&sel=beat%3Aone#t=4';
    expect(citeOf(Act.make({ film: 'f', act: OPENING }), studio)).toBe(studio);
    expect(citeOf(Point.make({ film: 'f', point: 'score' }), studio)).toBe(studio);
  });

  test("writes a cue's or a knob's lab keys", () => {
    expect(labKeysOf(cueOf('one', 'rise'))).toEqual({ cue: 'rise' });
    expect(labKeysOf(knobOf('one', 'size'))).toEqual({ knob: 'size' });
  });

  test('reads as a person names it', () => {
    expect(selectionText(cueOf('cold', 'slam'))).toBe('cue slam in cold');
    expect(selectionText(Version.make({ folder: 'r', point: 'cold', version: 'b' }))).toBe(
      'option b of cold',
    );
  });
});
