import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { layout } from './layout.ts';
import { attr, elements, keys, only, toNode, unrecorded } from './rive-testing.ts';
import { riveDocument } from './rive.ts';
import { sceneClient, storyboardElements, storyboardRml } from './storyboard.ts';

const placed = Arr.getUnsafe(
  layout([{ id: 'seed', say: 'A {fall}seed falls, and {grow}grows.', lead: 1 }], unrecorded),
  0,
);

const board = storyboardElements({
  beat: { id: 'seed', picture: 'A seed falls into the ground.' },
  placed,
  client: 5,
  font: '7:1',
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
});

const frame = (mark: string) =>
  Math.round((placed.speechStart + (placed.voice.marks.get(mark) ?? Number.NaN)) * 60);

describe('sceneClient', () => {
  test('is fixed by the beat id, and clear of the editor and the Film', () => {
    expect(sceneClient('seed')).toBe(sceneClient('seed'));
    expect(sceneClient('seed')).not.toBe(sceneClient('sower'));
    for (const beat of ['a', 'seed', 'righteousness-by-faith'])
      expect(sceneClient(beat)).toBeGreaterThanOrEqual(100_000);
  });
});

describe('storyboardElements', () => {
  test("reads back as the beat's scene: a nestable storyboard with an Event per mark on its voice's clock", () => {
    const nodes = board.map(toNode);
    const doc = riveDocument({
      problems: [],
      artboards: [Arr.getUnsafe(nodes, 0)],
      roots: [Arr.getUnsafe(nodes, 1)],
    });
    const scene = Option.getOrThrow(Option.fromNullishOr(doc.boards.get('seed')));
    expect(scene.storyboard).toBe(true);
    expect(scene.component).toBe(true);
    expect(Option.map(scene.main, (m) => m.frames)).toEqual(
      Option.some(Math.round(placed.dur * 60)),
    );
    expect(scene.events.map((e) => [e.name, Math.round(e.at * 60)])).toEqual([
      ['fall', frame('fall')],
      ['grow', frame('grow')],
    ]);
    expect(scene.unkeyed).toEqual([]);
  });

  test("shows each mark's label from its word until the next mark's", () => {
    const label = only(board, 'Text', { name: 'Mark fall' });
    const opacity = only(board, 'KeyedObject', { objectId: String(attr(label, 'id')) });
    expect(keys(Arr.getUnsafe(opacity.children, 0))).toEqual([
      { frame: 0, value: 0, interpolation: 'hold' },
      { frame: frame('fall'), value: 1, interpolation: 'hold' },
      { frame: frame('grow'), value: 0, interpolation: 'hold' },
    ]);
  });

  test("every id is its own, in the scene's client space", () => {
    const ids = board
      .flatMap(elements)
      .flatMap((e) => e.attrs.filter(([k]) => k === 'id').map(([, v]) => String(v)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('5:'))).toBe(true);
  });

  test('prints as one fragment', () => {
    const rml = storyboardRml({
      beat: { id: 'seed', picture: 'Quotes " and <tags> & lines\nescape.' },
      placed,
      client: 5,
      font: '7:1',
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
    });
    expect(rml.startsWith('<Rive version="1" kind="fragment">\n')).toBe(true);
    expect(rml).toContain('text="Quotes &quot; and &lt;tags&gt; &amp; lines&#10;escape."');
  });
});
