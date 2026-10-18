import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { ActName } from '../core/address-schema.ts';
import { beatSelection, pageHref, panelSelection } from '../core/api.ts';
import { Selection, citeOf, selectionOf, selectionText, wordsIn } from './selection.ts';

const OPENING = ActName.make('opening');

const { Mark, Words, Note, Point, Folder, Set, Version, Variant, Act, Film, Beat, Panel, Scene } =
  Selection.cases;

describe("a selection in the pages' URLs", () => {
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

  test("cites a beat, a panel, a beat's words and a note on the studio it is on, at its playhead", () => {
    const here = pageHref.studio('f', { sel: beatSelection('one') }, Option.some(1.5));
    expect(citeOf(Beat.make({ beat: 'two' }), here)).toBe(
      pageHref.studio('f', { sel: beatSelection('two') }, Option.some(1.5)),
    );
    expect(citeOf(Panel.make({ panel: 'two.rise' }), here)).toBe(
      pageHref.studio('f', { sel: panelSelection('two.rise') }, Option.some(1.5)),
    );
    expect(citeOf(Words.make({ scene: 'law', from: 3, to: 4 }), here)).toBe(
      pageHref.studio('f', { sel: beatSelection('law'), words: '3-4' }, Option.some(1.5)),
    );
    expect(citeOf(Note.make({ id: 'n7' }), here)).toBe(
      pageHref.studio('f', { sel: beatSelection('one'), note: 'n7' }, Option.some(1.5)),
    );
  });

  test("reads a talk's words (`<a>-<b>`), first to last; anything else selects nothing", () => {
    expect(wordsIn('law', '3-4')).toEqual(
      Option.some(Words.make({ scene: 'law', from: 3, to: 4 })),
    );
    for (const bad of ['4-3', '3', 'a-b', '-1-2', ''])
      expect(wordsIn('law', bad)).toEqual(Option.none());
    expect(selectionText(Words.make({ scene: 'law', from: 3, to: 4 }))).toBe('words 3–4 of law');
    expect(selectionText(Words.make({ scene: 'law', from: 2, to: 2 }))).toBe('word 2 of law');
  });

  test('every selection round-trips through its citation where the places have a key for it', () => {
    const here = pageHref.home();
    for (const s of [
      Folder.make({ folder: 'renders' }),
      Set.make({ folder: 'renders', point: 'cold' }),
      Version.make({ folder: 'renders', point: 'cold', version: 'b' }),
      Scene.make({ film: 'f', scene: 'two' }),
    ]) {
      expect(selectionOf(citeOf(s, here))).toEqual(Option.some(s));
    }
  });

  test("cites a mark on the studio, its beat selected, whose Words read the beat's line", () => {
    expect(citeOf(Mark.make({ scene: 'one', name: 'fall' }), pageHref.studio('f'))).toBe(
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

  test('reads as a person names it', () => {
    expect(selectionText(Beat.make({ beat: 'cold' }))).toBe('beat cold');
    expect(selectionText(Version.make({ folder: 'r', point: 'cold', version: 'b' }))).toBe(
      'option b of cold',
    );
  });
});
