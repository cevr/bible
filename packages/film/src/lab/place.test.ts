// The lab's place round-trips through its URL: the path names the
// selection's scene, else the playhead's; `#t=` is the frame's time in that
// scene; an old bare `#<seconds>` is film time; anything else opens at the
// start.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { Selection } from '../command/selection.ts';
import { FOLLOW, lineOpen } from './source/open.ts';
import { FOLLOW_TEXT, type TextOpen } from './transcript/open.ts';

/** The Transcript view held on take word `word`. */
const wordOpen = (word: number): TextOpen => ({ _tag: 'Word', word });
import { beatAt, labHref, labHrefWith, labOpensAt, labPlaceOf, selectsCue } from './place.ts';

const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', min: 4 },
      { id: 'b', min: 5 },
    ],
    { voice: '', scenes: {} },
  ),
);
const b = placed[1]?.start ?? Number.NaN;
const none = {
  selection: Option.none(),
  note: Option.none(),
  beat: Option.none(),
  view: 'off' as const,
  loop: Option.none(),
};

describe("the lab's place", () => {
  test('reads the scene, a cue or a knob, the note and the time', () => {
    expect(labPlaceOf('/films/f/lab/b?cue=rise&note=n3#t=1.5')).toEqual({
      root: 'lab',
      scene: Option.some('b'),
      selection: Option.some({ _tag: 'Cue', scene: 'b', name: 'rise' }),
      note: Option.some('n3'),
      beat: Option.none(),
      view: 'off',
      code: Option.none(),
      words: Option.none(),
      mark: Option.none(),
      text: Option.none(),
      t: Option.some(1.5),
      loop: Option.none(),
    });
    expect(labPlaceOf('/films/f/lab/a?knob=spot').selection).toEqual(
      Option.some({ _tag: 'Knob', scene: 'a', name: 'spot' }),
    );
    expect(labPlaceOf('/films/f/lab?note=n1').note).toEqual(Option.some('n1'));
    expect(labPlaceOf('/films/f/play#t=3').scene).toEqual(Option.none());
  });

  test('a path with no scene names the scene under the playhead, its time in that scene', () => {
    expect(labHref('f', placed, none, b + 1)).toBe('/films/f/lab/b#t=1');
    expect(labHref('f', placed, none, 1)).toBe('/films/f/lab/a#t=1');
  });

  test("a selection keeps its scene in the path, the time signed against that scene's start", () => {
    const pick = {
      selection: Option.some({ _tag: 'Cue' as const, scene: 'b', name: 'rise' }),
      note: Option.some('n3'),
      beat: Option.none(),
      view: 'off' as const,
      loop: Option.none(),
    };
    const href = labHref('f', placed, pick, 1);
    expect(href).toBe(`/films/f/lab/b?cue=rise&note=n3#t=${1 - b}`);
    expect(labOpensAt(placed, href)).toBeCloseTo(1, 9);
    expect(labPlaceOf(href).selection).toEqual(pick.selection);
  });

  test("the studio's beat rides in ?beat=: read back, kept by every write, else the path's scene", () => {
    const at = '/films/f/lab/a?beat=b#t=1';
    const listed = ['a', 'b'];
    expect(labPlaceOf(at).beat).toEqual(Option.some('b'));
    expect(beatAt(at, listed)).toEqual(Option.some('b'));
    // With none picked, the studio is on the path's scene.
    expect(beatAt('/films/f/lab/a#t=1', listed)).toEqual(Option.some('a'));
    expect(beatAt('/films/f/lab#t=1', listed)).toEqual(Option.none());
    // Play crossing into b keeps the beat picked in a.
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe('/films/f/lab/b?beat=b#t=0.5');
    expect(labHref('f', placed, none, 1)).not.toContain('beat=');
  });

  test('a beat the film no longer lists reads as absent: the studio is on the path scene, else none', () => {
    const listed = ['a', 'b'];
    // A link made before a scene was renamed: Record opens where the lab is.
    expect(beatAt('/films/f/lab/a?beat=gone#t=1', listed)).toEqual(Option.some('a'));
    expect(beatAt('/films/f/lab/gone#t=1', listed)).toEqual(Option.none());
    expect(beatAt('/films/f/lab?beat=gone#t=1', listed)).toEqual(Option.none());
  });

  test("the compare's mode rides in ?view= (PA-9): read back, kept across a scene boundary, off unwritten", () => {
    expect(labPlaceOf('/films/f/lab/b?view=diff#t=1').view).toBe('diff');
    expect(labPlaceOf('/films/f/lab?view=blink').view).toBe('blink');
    expect(labPlaceOf('/films/f/lab/b?view=sideways').view).toBe('off');
    const wiping = { ...none, view: 'wipe' as const };
    expect(labHref('f', placed, wiping, 1)).toBe('/films/f/lab/a?view=wipe#t=1');
    expect(labPlaceOf(labHref('f', placed, wiping, b + 1)).view).toBe('wipe');
    expect(labHref('f', placed, none, 1)).not.toContain('view=');
  });

  test('the Source view rides in ?code=: read back, kept by every write, shut when the key is absent', () => {
    expect(labPlaceOf('/films/f/lab/b?code=follow#t=1').code).toEqual(Option.some(FOLLOW));
    expect(labPlaceOf('/films/f/lab/b?code=12#t=1').code).toEqual(Option.some(lineOpen(12)));
    expect(labPlaceOf('/films/f/lab/b?code=0#t=1').code).toEqual(Option.none());
    expect(labPlaceOf('/films/f/lab/b#t=1').code).toEqual(Option.none());
    const open = { ...none, code: Option.some(FOLLOW) };
    expect(labHref('f', placed, open, 1)).toBe('/films/f/lab/a?code=follow#t=1');
    // Play crossing into b keeps it open; a write that says nothing of it leaves it as the URL holds it.
    const at = '/films/f/lab/a?code=7#t=1';
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe('/films/f/lab/b?code=7#t=0.5');
    expect(labHrefWith('f', placed, at, { code: Option.none() }, 1)).toBe('/films/f/lab/a#t=1');
    expect(labHref('f', placed, none, 1)).not.toContain('code=');
  });

  test("a talk's words ride in ?words= and the Transcript view in ?text=: read back, kept by every write, the words' section in the path", () => {
    const words = Selection.cases.Words.make({ scene: 'b', from: 3, to: 4 });
    expect(labPlaceOf('/films/f/lab/b?words=3-4&text=follow#t=1')).toMatchObject({
      words: Option.some(words),
      text: Option.some(FOLLOW_TEXT),
    });
    expect(labPlaceOf('/films/f/lab/b?text=12#t=1').text).toEqual(Option.some(wordOpen(12)));
    expect(labPlaceOf('/films/f/lab/b?text=0#t=1').text).toEqual(Option.some(wordOpen(0)));
    expect(labPlaceOf('/films/f/lab/b?text=-1#t=1').text).toEqual(Option.none());
    expect(labPlaceOf('/films/f/lab/b?words=4-3#t=1').words).toEqual(Option.none());
    // Words selected keep their section in the path, as a cue does; the time signed against its start.
    const picked = { ...none, words: Option.some(words), text: Option.some(FOLLOW_TEXT) };
    expect(labHref('f', placed, picked, 1)).toBe(`/films/f/lab/b?words=3-4&text=follow#t=${1 - b}`);
    // A write that says nothing of them keeps them; one that drops them drops them.
    const at = '/films/f/lab/b?words=3-4&text=3#t=1';
    expect(labHrefWith('f', placed, at, {}, b + 2)).toBe('/films/f/lab/b?words=3-4&text=3#t=2');
    expect(labHrefWith('f', placed, at, { words: Option.none(), text: Option.none() }, 1)).toBe(
      '/films/f/lab/a#t=1',
    );
    expect(labHref('f', placed, none, 1)).not.toMatch(/words=|text=/);
  });

  test("words selected in another scene than the cue's or knob's take the path, the cue or knob let go; a cue picked in another scene lets the words go", () => {
    const knobAt = '/films/f/lab/a?knob=zoom&text=follow#t=1';
    const inB = Selection.cases.Words.make({ scene: 'b', from: 3, to: 4 });
    expect(labHrefWith('f', placed, knobAt, { words: Option.some(inB) }, b + 2)).toBe(
      '/films/f/lab/b?words=3-4&text=follow#t=2',
    );
    // Words of the knob's own scene sit beside it.
    const inA = Selection.cases.Words.make({ scene: 'a', from: 1, to: 1 });
    expect(labHrefWith('f', placed, knobAt, { words: Option.some(inA) }, 1)).toBe(
      '/films/f/lab/a?knob=zoom&words=1-1&text=follow#t=1',
    );
    // A cue picked in another scene: the path is its scene, and the words go with the old one.
    const wordsAt = '/films/f/lab/b?words=3-4&text=follow#t=1';
    const rise = Selection.cases.Cue.make({ scene: 'a', name: 'rise' });
    expect(labHrefWith('f', placed, wordsAt, { selection: Option.some(rise) }, 1)).toBe(
      '/films/f/lab/a?cue=rise&text=follow#t=1',
    );
  });

  test('the A–B loop rides in #loop= in film seconds: read back, kept across a scene boundary, none unwritten or ill-formed', () => {
    const looping = { ...none, loop: Option.some({ from: 1.5, to: b + 2 }) };
    const href = labHref('f', placed, looping, 1);
    expect(href).toBe(`/films/f/lab/a#t=1&loop=1.5,${b + 2}`);
    expect(labPlaceOf(href).loop).toEqual(looping.loop);
    // The path moves to the next scene; the loop's film seconds stay as they were.
    expect(labPlaceOf(labHref('f', placed, looping, b + 1)).loop).toEqual(looping.loop);
    expect(labHref('f', placed, none, 1)).not.toContain('loop=');
    // A blank end (`,2`, `%20,2`, `1,`) is no point, never 0.
    for (const bad of ['3,1', '2,2', '1', '1,2,3', 'a,b', ',', ',2', '%20,2', '1,', '1,%20'])
      expect(labPlaceOf(`/films/f/lab/a#t=1&loop=${bad}`).loop).toEqual(Option.none());
    // A link from before the key reads as no loop, its time as before.
    expect(labPlaceOf('/films/f/lab/a#t=1')).toMatchObject({
      t: Option.some(1),
      loop: Option.none(),
    });
  });

  test('a write keeps what the URL holds beside the change it makes', () => {
    const at = `/films/f/lab/b?cue=rise&view=wipe#t=0&loop=1,2`;
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe(
      `/films/f/lab/b?cue=rise&view=wipe#t=0.5&loop=1,2`,
    );
    expect(labHrefWith('f', placed, at, { loop: Option.none() }, b)).toBe(
      `/films/f/lab/b?cue=rise&view=wipe#t=0`,
    );
  });

  test('crossing into the next scene rebases the path and the time in one write', () => {
    const before = labHref('f', placed, none, b - 0.5);
    const after = labHref('f', placed, none, b + 0.5);
    expect(labPlaceOf(before).scene).toEqual(Option.some('a'));
    expect(labPlaceOf(after)).toMatchObject({ scene: Option.some('b'), t: Option.some(0.5) });
  });

  test('opens at the time it names, an old bare hash as film time, else the scene start', () => {
    expect(labOpensAt(placed, '/films/f/lab/b#t=2')).toBe(b + 2);
    expect(labOpensAt(placed, '/films/f/lab#t=2')).toBe(2);
    expect(labOpensAt(placed, '/films/f/lab/b?cue=rise#6.25')).toBe(6.25);
    expect(labOpensAt(placed, '/films/f/lab/b')).toBe(b);
    expect(labOpensAt(placed, '/films/f/lab')).toBe(0);
    expect(labOpensAt(placed, '/films/f/lab/gone#t=2')).toBe(2);
  });

  test('names a cue only when its scene and name match', () => {
    const sel = Option.some({ _tag: 'Cue' as const, scene: 'one', name: 'rise' });
    expect(selectsCue(sel, 'one', 'rise')).toBe(true);
    expect(selectsCue(sel, 'two', 'rise')).toBe(false);
    expect(selectsCue(Option.none(), 'one', 'rise')).toBe(false);
  });
});

describe("the Script's place", () => {
  const rise = Selection.cases.Cue.make({ scene: 'b', name: 'rise' });
  const fall = Selection.cases.Mark.make({ scene: 'b', name: 'fall' });
  const said = Selection.cases.Words.make({ scene: 'b', from: 2, to: 4 });

  test('reads the beat, its cue, mark, words or note, and the time, on the Script', () => {
    expect(labPlaceOf('/films/f/script/b?cue=rise#t=1.5')).toEqual({
      root: 'script',
      scene: Option.some('b'),
      selection: Option.some(rise),
      note: Option.none(),
      beat: Option.none(),
      view: 'off',
      code: Option.none(),
      words: Option.none(),
      mark: Option.none(),
      text: Option.none(),
      t: Option.some(1.5),
      loop: Option.none(),
    });
    expect(labPlaceOf('/films/f/script/b?mark=fall').mark).toEqual(Option.some(fall));
    expect(labPlaceOf('/films/f/script/b?words=2-4').words).toEqual(Option.some(said));
    expect(labPlaceOf('/films/f/script/b?note=n3').note).toEqual(Option.some('n3'));
    expect(labPlaceOf('/films/f/script?note=n1#t=2')).toMatchObject({
      root: 'script',
      scene: Option.none(),
      note: Option.some('n1'),
      t: Option.some(2),
    });
    // The Lab's own keys mean nothing on the Script.
    expect(labPlaceOf('/films/f/script/b?knob=zoom&view=diff&code=follow')).toMatchObject({
      selection: Option.none(),
      view: 'off',
      code: Option.none(),
    });
  });

  test('a write on the Script prints the Script: the beat under the playhead, the time in it, the Lab-only keys let go', () => {
    expect(labHref('f', placed, none, b + 1, 'script')).toBe('/films/f/script/b#t=1');
    const at = '/films/f/script/a?note=n2#t=1&loop=1,2';
    expect(labHrefWith('f', placed, at, {}, b + 0.5)).toBe(
      '/films/f/script/b?note=n2#t=0.5&loop=1,2',
    );
    const knob = Selection.cases.Knob.make({ scene: 'a', name: 'zoom' });
    const labOnly = {
      ...none,
      selection: Option.some(knob),
      beat: Option.some('a'),
      view: 'diff' as const,
      code: Option.some(FOLLOW),
      text: Option.some(FOLLOW_TEXT),
    };
    expect(labHref('f', placed, labOnly, 1, 'script')).toBe('/films/f/script/a#t=1');
    expect(labOpensAt(placed, '/films/f/script/b#t=2')).toBe(b + 2);
    expect(labOpensAt(placed, '/films/f/script#t=2')).toBe(2);
  });

  test('a cue, a mark or words picked keep their beat in the path, the time signed against its start', () => {
    for (const [pick, key] of [
      [{ selection: Option.some(rise) }, 'cue=rise'],
      [{ mark: Option.some(fall) }, 'mark=fall'],
      [{ words: Option.some(said) }, 'words=2-4'],
    ] as const) {
      const href = labHref('f', placed, { ...none, ...pick }, 1, 'script');
      expect(href).toBe(`/films/f/script/b?${key}#t=${1 - b}`);
      expect(labOpensAt(placed, href)).toBeCloseTo(1, 9);
    }
  });

  test('it selects one thing at a time: a cue, a mark, words or a note picked lets the others go', () => {
    const cueAt = '/films/f/script/b?cue=rise&note=n1#t=1';
    expect(labHrefWith('f', placed, cueAt, { mark: Option.some(fall) }, b + 1)).toBe(
      '/films/f/script/b?mark=fall#t=1',
    );
    expect(labHrefWith('f', placed, cueAt, { words: Option.some(said) }, b + 1)).toBe(
      '/films/f/script/b?words=2-4#t=1',
    );
    const markAt = '/films/f/script/b?mark=fall#t=1';
    expect(labHrefWith('f', placed, markAt, { selection: Option.some(rise) }, b + 1)).toBe(
      '/films/f/script/b?cue=rise#t=1',
    );
    // A note picked lets the pick go, and its path is the beat under the frame; a pick lets the note go.
    const noteAt = '/films/f/script/b?note=n4#t=2';
    expect(labHrefWith('f', placed, markAt, { note: Option.some('n4') }, b + 2)).toBe(noteAt);
    expect(labHrefWith('f', placed, noteAt, { words: Option.some(said) }, b + 2)).toBe(
      '/films/f/script/b?words=2-4#t=2',
    );
    // A pick of none lets everything go; a change of the time keeps the pick.
    expect(labHrefWith('f', placed, markAt, { mark: Option.none() }, 1)).toBe(
      '/films/f/script/a#t=1',
    );
    expect(labHrefWith('f', placed, noteAt, { note: Option.none() }, b + 2)).toBe(
      '/films/f/script/b#t=2',
    );
    expect(labHrefWith('f', placed, markAt, {}, b + 2)).toBe('/films/f/script/b?mark=fall#t=2');
    // A link naming more than one holds one, in the order a path names its beat by (a cue,
    // words, a mark, then a note), and prints it alone as the time moves on.
    const all = '/films/f/script/b?cue=rise&mark=fall&words=2-4&note=n4#t=1';
    expect(labPlaceOf(all)).toMatchObject({
      selection: Option.some(rise),
      mark: Option.none(),
      words: Option.none(),
      note: Option.none(),
    });
    expect(labHrefWith('f', placed, all, {}, b + 2)).toBe('/films/f/script/b?cue=rise#t=2');
    expect(labPlaceOf('/films/f/script/b?mark=fall&words=2-4&note=n4#t=1')).toMatchObject({
      mark: Option.none(),
      words: Option.some(said),
      note: Option.none(),
    });
    expect(labPlaceOf('/films/f/script/b?mark=fall&note=n4#t=1')).toMatchObject({
      mark: Option.some(fall),
      note: Option.none(),
    });
    expect(labHrefWith('f', placed, all, { mark: Option.some(fall) }, b + 1)).toBe(
      '/films/f/script/b?mark=fall#t=1',
    );
  });

  test('a mark picked in another beat takes the path, as words and a cue do', () => {
    const inA = Selection.cases.Mark.make({ scene: 'a', name: 'rise' });
    expect(
      labHrefWith('f', placed, '/films/f/script/b?words=2-4#t=1', { mark: Option.some(inA) }, 1),
    ).toBe('/films/f/script/a?mark=rise#t=1');
  });
});
