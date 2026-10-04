// What a press on a cue's bar grabs, and where a drag of it lands: its body
// moves the offset, its edges set start or end; a bar too short to hold two
// edges and a body is all body (alt grabs its end). Edges snap to words,
// marks and other cues within a few pixels, else move by whole frames; shift
// places them freely. A drag that ends where it began writes nothing. A cue
// the lab may not write says why before any drag starts.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { ResolvedCue, SceneSource } from '../../core/schema.ts';
import {
  type CueGrip,
  EDGE_PX,
  type KnobGrip,
  cueRefusal,
  dragCue,
  dragKnob,
  dragModeAt,
  knobRefusal,
  snapEdge,
  wroteNote,
} from './grip.ts';

describe('dragModeAt', () => {
  test('a long bar: left edge, body, right edge', () => {
    expect(dragModeAt(2, 100, false)).toBe('start');
    expect(dragModeAt(50, 100, false)).toBe('move');
    expect(dragModeAt(97, 100, false)).toBe('end');
  });

  test('a short bar is all body, wherever it is pressed', () => {
    const width = EDGE_PX * 3 - 1;
    for (const x of [0, width / 2, width - 1]) expect(dragModeAt(x, width, false)).toBe('move');
  });

  test('alt on a short bar grabs its end', () => {
    expect(dragModeAt(EDGE_PX, EDGE_PX * 2, true)).toBe('end');
  });
});

describe('snapEdge', () => {
  const near = { targets: [1.5], perSec: 100, fps: 30 };
  test('lands on a target within the snap distance', () => {
    expect(snapEdge(1, 0.46, near, false)).toBe(1.5);
  });
  test('else moves by whole frames', () => {
    expect(snapEdge(1, 0.21, near, false)).toBeCloseTo(1.2, 9);
  });
  test('shift places it freely', () => {
    expect(snapEdge(1, 0.46, near, true)).toBeCloseTo(1.46, 9);
  });
});

const rise: ResolvedCue = { start: 1, end: 1.6, dur: 0.6, ease: 'inOutCubic', stagger: 0 };

const grip = (edge: CueGrip['edge']): CueGrip => ({
  _tag: 'CueGrip',
  scene: 'one',
  cue: 'rise',
  edge,
  x0: 500,
  perSec: 100,
  fps: 30,
  span: { mark: 'rise', dur: 0.6 },
  timeline: { rise: { mark: 'rise', dur: 0.6 }, fall: { mark: 'fall', dur: 0.4 } },
  cue0: rise,
  targets: [4],
});

describe('dragCue', () => {
  test('its body moves the offset, and the edit shows it', () => {
    const dragged = dragCue(grip('move'), { x: 520, y: 0, shift: false });
    expect(dragged.write).toEqual(
      Option.some({ _tag: 'CueWrite', scene: 'one', cue: 'rise', patch: { offset: 0.2 } }),
    );
    expect(dragged.scene).toBe('one');
    expect(dragged.edit.timeline?.['rise']).toEqual({ mark: 'rise', offset: 0.2, dur: 0.6 });
    expect(dragged.edit.timeline?.['fall']).toEqual({ mark: 'fall', dur: 0.4 });
  });

  test('its right edge sets the dur', () => {
    const dragged = dragCue(grip('end'), { x: 510, y: 0, shift: false });
    expect(dragged.write).toEqual(
      Option.some({ _tag: 'CueWrite', scene: 'one', cue: 'rise', patch: { dur: 0.7 } }),
    );
  });

  test('back where it began writes nothing', () => {
    expect(dragCue(grip('move'), { x: 500, y: 0, shift: false }).write).toEqual(Option.none());
  });
});

const source = (over: Partial<SceneSource> = {}): SceneSource => ({
  scene: 'one',
  file: 'scenes/one.ts',
  cues: [
    {
      name: 'rise',
      offset: 'absent',
      dur: 'computed',
      until: 'absent',
      ease: 'literal',
      stagger: 'absent',
    },
  ],
  knobs: [],
  refused: [],
  ...over,
});

describe('cueRefusal', () => {
  test('a field the lab may write: none', () => {
    expect(cueRefusal(Option.some(source()), '', 'rise', 'move')).toEqual(Option.none());
  });
  test('a computed field is named', () => {
    expect(cueRefusal(Option.some(source()), '', 'rise', 'end')).toEqual(
      Option.some('cannot drag rise: its dur is computed in the source'),
    );
  });
  test('a timeline the lab will not write gives its reason', () => {
    const refused = source({
      refused: [{ field: 'timeline', reason: 'the registry overrides it' }],
    });
    expect(cueRefusal(Option.some(refused), '', 'rise', 'move')).toEqual(
      Option.some('cannot drag rise: the registry overrides it'),
    );
  });
  test('no source: the reason it could not be read', () => {
    expect(cueRefusal(Option.none(), 'SceneNotFound: no file', 'rise', 'move')).toEqual(
      Option.some('cannot edit: SceneNotFound: no file'),
    );
    expect(cueRefusal(Option.none(), '', 'rise', 'move')).toEqual(
      Option.some('cannot edit: no source for this scene'),
    );
  });
});

describe('wroteNote', () => {
  const result = { scene: 'one', file: 'scenes/one.ts', target: 'cue rise offset', findings: [] };
  test('a write names the file and what changed', () => {
    const write = { _tag: 'CueWrite' as const, scene: 'one', cue: 'rise', patch: { offset: 0.2 } };
    expect(wroteNote(write, result)).toBe('wrote scenes/one.ts: cue rise offset');
    expect(wroteNote(write, { ...result, unresolved: 'no layout' })).toBe(
      'wrote scenes/one.ts: cue rise offset (not resolved: no layout)',
    );
  });
  test('an undo or redo names what it put back', () => {
    const undo = { _tag: 'StepWrite' as const, verb: 'undo' as const, request: 'undo-1' };
    expect(wroteNote(undo, { ...result, target: 'undo cue rise offset' })).toBe(
      'undid cue rise offset in scenes/one.ts',
    );
    const redo = { _tag: 'StepWrite' as const, verb: 'redo' as const, request: 'redo-1' };
    expect(wroteNote(redo, { ...result, target: 'redo cue rise offset' })).toBe(
      'redid cue rise offset in scenes/one.ts',
    );
  });
});

// A knob's handle dragged: the pointer moves in screen pixels, the knob by the
// same move taken back through the transform it is drawn under, to whole
// units. A camera's target the camera sits on cannot leave the centre, so its
// drag moves the picture with the pointer: the target moves against it.
const knobGrip = (mode: KnobGrip['mode'], m: KnobGrip['m'], inv: KnobGrip['inv']): KnobGrip => ({
  _tag: 'KnobGrip',
  scene: 'three',
  knob: 'face',
  mode,
  from: [400, 200],
  m,
  inv,
  // The overlay at (10, 20) on screen, drawn at half the film's pixels.
  frame: { left: 10, top: 20, sx: 2, sy: 2 },
  start: [400, 200],
  knobs: { face: [400, 200], faceZoom: 2 },
});

describe('dragKnob', () => {
  test('a point follows the pointer through its transform, to whole units', () => {
    const grip = knobGrip('point', [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]);
    const dragged = dragKnob(grip, { x: 10 + 215.2, y: 20 + 95, shift: false });
    expect(dragged.write).toEqual(
      Option.some({ _tag: 'KnobWrite', scene: 'three', knob: 'face', value: [430, 190] }),
    );
    expect(dragged.edit.knobs).toEqual({ face: [430, 190], faceZoom: 2 });
  });

  test("a camera's target the camera sits on moves the picture with the pointer", () => {
    const grip = knobGrip('picture', [2, 0, 0, 2, -480, -220], [0.5, 0, 0, 0.5, 240, 110]);
    // 40 frame pixels right: the target moves 20 world units left.
    const dragged = dragKnob(grip, { x: 10 + 220, y: 20 + 100, shift: false });
    expect(dragged.write).toEqual(
      Option.some({ _tag: 'KnobWrite', scene: 'three', knob: 'face', value: [380, 200] }),
    );
  });

  test('back where it began writes nothing', () => {
    const grip = knobGrip('point', [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]);
    expect(dragKnob(grip, { x: 10 + 200, y: 20 + 100, shift: false }).write).toEqual(Option.none());
  });
});

describe('knobRefusal', () => {
  const source = (over: Partial<SceneSource> = {}): SceneSource => ({
    scene: 'one',
    file: 'scenes/one.ts',
    cues: [],
    knobs: [
      { name: 'spot', state: 'literal' },
      { name: 'size', state: 'computed' },
    ],
    refused: [],
    ...over,
  });
  test('a literal knob: none', () => {
    expect(knobRefusal(Option.some(source()), '', 'spot')).toEqual(Option.none());
  });
  test('a computed knob, or a knobs object the lab will not write, says why', () => {
    expect(knobRefusal(Option.some(source()), '', 'size')).toEqual(
      Option.some('cannot move size: it is computed in the source'),
    );
    const refused = source({ refused: [{ field: 'knobs', reason: 'they are spread in' }] });
    expect(knobRefusal(Option.some(refused), '', 'spot')).toEqual(
      Option.some('cannot move spot: they are spread in'),
    );
  });
  test('no source: the reason it could not be read', () => {
    expect(knobRefusal(Option.none(), 'no file', 'spot')).toEqual(
      Option.some('cannot edit: no file'),
    );
  });
});
