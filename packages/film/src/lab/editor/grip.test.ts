// What a press on a cue's bar grabs, and where a drag of it lands: its body
// moves the offset, its edges set start or end; a bar too short to hold two
// edges and a body is all body (alt grabs its end). Edges snap to words,
// marks and other cues within a few pixels, else move by whole frames; shift
// places them freely, or with snapping off snaps them. A drag that ends where
// it began writes nothing. A cue the lab may not write says why before any
// drag starts. An `until` cue's end is a field of its own, written as its
// right edge's drag writes it.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { SceneEdit } from '../../canvas/film.ts';
import { ChangeId, RequestId, type ResolvedCue, type SceneSource } from '../../core/schema.ts';
import { dragFields, dragPatch } from '../../core/timeline.ts';
import {
  type CueGrip,
  CueWrite,
  EDGE_PX,
  EDGE_TOUCH_PX,
  type KnobGrip,
  type Write,
  cueRefusal,
  dragCue,
  dragKnob,
  dragModeAt,
  edgeFor,
  fieldsOf,
  knobRefusal,
  cueSaidText,
  joined,
  placesFreely,
  type SourceKnown,
  snapEdge,
  stripWindow,
  wroteNote,
} from './grip.ts';

/** A source the lab has read. */
const read = (source: SceneSource): SourceKnown => ({
  source: Option.some(source),
  reading: false,
  error: '',
});

/** No source, for `error` (the server's reason). */
const unread = (error: string): SourceKnown => ({ source: Option.none(), reading: false, error });

/** A source still being read. */
const READING: SourceKnown = { source: Option.none(), reading: true, error: '' };

describe('joined', () => {
  const write = (patch: CueWrite['patch'], said: NonNullable<CueWrite['said']>) =>
    CueWrite.make({ scene: 'one', cue: 'rise', patch, said });
  const saidOf = (earlier: CueWrite, later: CueWrite) =>
    Option.map(
      Option.filter(joined(earlier, later), (w): w is CueWrite => w._tag === 'CueWrite'),
      cueSaidText,
    );

  test('a field moved twice says its move from the first before to the last after', () => {
    expect(
      saidOf(
        write({ offset: 0.1 }, { offset: { before: '0', after: '0.1', unit: 's' } }),
        write({ offset: 0.2 }, { offset: { before: '0.1', after: '0.2', unit: 's' } }),
      ),
    ).toEqual(Option.some('cue rise offset 0 → 0.2 s'));
  });

  test('a dur after an until says the dur alone, as the patch writes it alone', () => {
    expect(
      saidOf(
        write({ until: 'fall' }, { until: { before: 'its dur', after: 'mark {fall}', unit: '' } }),
        write({ dur: 1 }, { dur: { before: '0.6', after: '1', unit: 's' } }),
      ),
    ).toEqual(Option.some('cue rise dur 0.6 → 1 s'));
  });
});

describe('stripWindow', () => {
  test('on a phone, a long scene shows 8 s around the playhead, held inside the scene', () => {
    expect(stripWindow(30, 10, true)).toEqual({ from: 6, span: 8 });
    expect(stripWindow(30, 1, true)).toEqual({ from: 0, span: 8 });
    expect(stripWindow(30, 29, true)).toEqual({ from: 22, span: 8 });
  });
  test('a scene of 8 s or less, or any scene on a laptop, shows whole', () => {
    expect(stripWindow(6, 3, true)).toEqual({ from: 0, span: 6 });
    expect(stripWindow(30, 10, false)).toEqual({ from: 0, span: 30 });
  });
});

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

  test("a finger's edges are wider than a mouse's", () => {
    expect(edgeFor('mouse')).toBe(EDGE_PX);
    expect(edgeFor('pen')).toBe(EDGE_PX);
    expect(edgeFor('touch')).toBe(EDGE_TOUCH_PX);
    // 10 px in: the body to a mouse, the start to a finger.
    expect(dragModeAt(10, 100, false, edgeFor('mouse'))).toBe('move');
    expect(dragModeAt(10, 100, false, edgeFor('touch'))).toBe('start');
    expect(dragModeAt(90, 100, false, edgeFor('touch'))).toBe('end');
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

describe('placesFreely', () => {
  test('with snapping on, shift places an edge freely', () => {
    expect(placesFreely(false, true)).toBe(false);
    expect(placesFreely(true, true)).toBe(true);
  });
  test('with snapping off, an edge goes freely, and shift snaps it', () => {
    expect(placesFreely(false, false)).toBe(true);
    expect(placesFreely(true, false)).toBe(false);
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
  test('its body moves the offset, and the edit shows it; the write says it, before → after', () => {
    const dragged = dragCue(grip('move'), { x: 520, y: 0, free: false });
    expect(dragged.write).toEqual(
      Option.some({
        _tag: 'CueWrite',
        scene: 'one',
        cue: 'rise',
        patch: { offset: 0.2 },
        said: { offset: { before: '0', after: '0.2', unit: 's' } },
      }),
    );
    expect(dragged.scene).toBe('one');
    expect(dragged.edit.timeline?.['rise']).toEqual({ mark: 'rise', offset: 0.2, dur: 0.6 });
    expect(dragged.edit.timeline?.['fall']).toEqual({ mark: 'fall', dur: 0.4 });
  });

  test('its right edge sets the dur', () => {
    const dragged = dragCue(grip('end'), { x: 510, y: 0, free: false });
    expect(dragged.write).toEqual(
      Option.some({
        _tag: 'CueWrite',
        scene: 'one',
        cue: 'rise',
        patch: { dur: 0.7 },
        said: { dur: { before: '0.6', after: '0.7', unit: 's' } },
      }),
    );
  });

  test('back where it began writes nothing', () => {
    expect(dragCue(grip('move'), { x: 500, y: 0, free: false }).write).toEqual(Option.none());
  });
});

describe("a cue's fields", () => {
  const span = { mark: 'rise', offset: 0.1, dur: 1 } as const;
  const cue: ResolvedCue = { start: 1.1, end: 2.1, dur: 1, ease: 'inOutCubic', stagger: 0 };
  const commitsOf = (id: string, v: number) => {
    const commits: Array<{ readonly write: Write; readonly edit: SceneEdit }> = [];
    fieldsOf(
      { _tag: 'Cue', scene: 'one', name: 'rise' },
      {
        timeline: { rise: span },
        cues: new Map([['rise', cue]]),
        knobs: {},
        known: { source: Option.none(), reading: false, error: '' },
        fps: 30,
        commit: (write, edit) => void commits.push({ write, edit }),
      },
    )
      .find((f) => f.id === id)
      ?.write(v);
    return commits;
  };

  test('show the span the patch they send makes, rounded as the file holds it', () => {
    for (const [id, v] of [
      ['offset', 0.1 + 0.2],
      ['dur', 0.1 + 0.2],
    ] as const) {
      const [commit] = commitsOf(id, v);
      expect(commit?.write).toMatchObject({ patch: { [id]: 0.3 } });
      expect(commit?.edit.timeline?.['rise']).toEqual({ ...span, [id]: 0.3 });
    }
  });
});

describe("an `until` cue's end field", () => {
  const span = { mark: 'rise', until: 'fall' } as const;
  const cue: ResolvedCue = { start: 1, end: 2.2, dur: 1.2, ease: 'inOutCubic', stagger: 0 };
  const timeline = { rise: span, fall: { mark: 'fall', dur: 0.4 } };
  const literal = {
    name: 'rise',
    offset: 'absent',
    dur: 'absent',
    until: 'literal',
    ease: 'absent',
    stagger: 'absent',
  } as const;
  const fieldsIn = (commits: Array<unknown>) =>
    fieldsOf(
      { _tag: 'Cue', scene: 'one', name: 'rise' },
      {
        timeline,
        cues: new Map([['rise', cue]]),
        knobs: {},
        known: read({
          scene: 'one',
          file: 'scenes/one.ts',
          cues: [literal],
          knobs: [],
          refused: [],
        }),
        fps: 30,
        commit: (write, edit) => void commits.push({ write, edit }),
      },
    );

  test('an end off its mark by code is refused, as its drag writes that offset', () => {
    const computed = fieldsOf(
      { _tag: 'Cue', scene: 'one', name: 'rise' },
      {
        timeline: { ...timeline, rise: { ...span, untilOffset: 0.2 } },
        cues: new Map([['rise', cue]]),
        knobs: {},
        known: read({
          scene: 'one',
          file: 'scenes/one.ts',
          cues: [{ ...literal, untilOffset: 'computed' }],
          knobs: [],
          refused: [],
        }),
        fps: 30,
        commit: () => {},
      },
    );
    expect(computed.find((f) => f.id === 'end')?.refusal).toEqual(
      Option.some('cannot drag rise: its untilOffset is computed in the source'),
    );
    expect(fieldsIn([]).find((f) => f.id === 'end')?.refusal).toEqual(Option.none());
  });

  test('reads where the cue ends, and goes no earlier than its start', () => {
    const fields = fieldsIn([]);
    expect(fields.map((f) => f.id)).toEqual(['offset', 'end']);
    const end = fields.find((f) => f.id === 'end');
    expect(end?.value).toBe(2.2);
    expect(end?.spec.min).toEqual(Option.some(1));
  });

  test("writes the cue as its right edge's drag to the same time does: off the mark, its offset from it", () => {
    const commits: Array<unknown> = [];
    fieldsIn(commits)
      .find((f) => f.id === 'end')
      ?.write(2.5);
    const dragged = dragCue(
      { ...grip('end'), span, timeline, cue0: cue },
      { x: 530, y: 0, free: false },
    );
    expect(commits).toEqual([{ write: Option.getOrThrow(dragged.write), edit: dragged.edit }]);
    expect(dragged.write).toEqual(
      Option.some({
        _tag: 'CueWrite',
        scene: 'one',
        cue: 'rise',
        patch: { untilOffset: 0.3 },
        said: { untilOffset: { before: '0', after: '0.3', unit: 's' } },
      }),
    );
    expect(dragged.edit.timeline?.['rise']).toEqual({
      mark: 'rise',
      until: 'fall',
      untilOffset: 0.3,
    });
  });
});

describe('joined, for an until cue', () => {
  const write = (patch: CueWrite['patch'], said: NonNullable<CueWrite['said']>) =>
    CueWrite.make({ scene: 'one', cue: 'rise', patch, said });

  test("two moves of an until cue's end join into one offset, said from the first before", () => {
    const joint = joined(
      write({ untilOffset: 0.1 }, { untilOffset: { before: '0', after: '0.1', unit: 's' } }),
      write({ untilOffset: 0.3 }, { untilOffset: { before: '0.1', after: '0.3', unit: 's' } }),
    );
    expect(
      Option.map(
        Option.filter(joint, (w): w is CueWrite => w._tag === 'CueWrite'),
        (w) => [w.patch, cueSaidText(w)],
      ),
    ).toEqual(Option.some([{ untilOffset: 0.3 }, 'cue rise untilOffset 0 → 0.3 s']));
  });

  test('a dur after an offset ends the cue by its length: the offset goes with it', () => {
    const joint = joined(
      write({ untilOffset: 0.1 }, { untilOffset: { before: '0', after: '0.1', unit: 's' } }),
      write({ dur: 1 }, { dur: { before: '0.6', after: '1', unit: 's' } }),
    );
    expect(
      Option.map(
        Option.filter(joint, (w): w is CueWrite => w._tag === 'CueWrite'),
        (w) => [w.patch, cueSaidText(w)],
      ),
    ).toEqual(Option.some([{ dur: 1 }, 'cue rise dur 0.6 → 1 s']));
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
  const sized = { at: 'start', dur: 1 } as const;
  test('a field the lab may write: none', () => {
    expect(cueRefusal(read(source()), 'rise', dragFields(sized, 'move'))).toEqual(Option.none());
  });
  test('a computed field is named', () => {
    expect(cueRefusal(read(source()), 'rise', dragFields(sized, 'end'))).toEqual(
      Option.some('cannot drag rise: its dur is computed in the source'),
    );
  });
  test('a span that lands on its anchor is judged by the fields its drag writes', () => {
    const landing = { at: 'start', dur: 1, ends: true } as const;
    const offsetInCode = source({
      cues: [{ ...source().cues[0]!, offset: 'computed', dur: 'literal' }],
    });
    // Its left edge sets the dur alone; its right edge the offset too.
    expect(cueRefusal(read(offsetInCode), 'rise', dragFields(landing, 'start'))).toEqual(
      Option.none(),
    );
    expect(cueRefusal(read(offsetInCode), 'rise', dragFields(landing, 'end'))).toEqual(
      Option.some('cannot drag rise: its offset is computed in the source'),
    );
  });
  test('a span not literal in the source says so', () => {
    expect(cueRefusal(read(source()), 'fall', ['offset'])).toEqual(
      Option.some('cannot drag fall: its span is computed in the source'),
    );
  });
  test('a timeline the lab will not write gives its reason', () => {
    const refused = source({
      refused: [{ field: 'timeline', reason: 'the registry overrides it' }],
    });
    expect(cueRefusal(read(refused), 'rise', ['offset'])).toEqual(
      Option.some('cannot drag rise: the registry overrides it'),
    );
  });
  test('no source: the reason it could not be read', () => {
    expect(cueRefusal(unread('SceneNotFound: no file'), 'rise', ['offset'])).toEqual(
      Option.some('cannot edit: SceneNotFound: no file'),
    );
    expect(cueRefusal(unread(''), 'rise', ['offset'])).toEqual(
      Option.some('cannot edit: no source for this scene'),
    );
  });
  test('a source still being read is pending, never a refusal', () => {
    expect(cueRefusal(READING, 'rise', ['offset'])).toEqual(Option.some('reading the source…'));
  });
});

describe('dragFields', () => {
  const cue: ResolvedCue = { start: 1, end: 2, dur: 1, ease: 'inOutCubic', stagger: 0 };
  const bar = { start: 0.5, end: 2.5 };
  const spans = [
    { at: 'start', offset: 1, dur: 1 },
    { at: 'start', dur: 1, ends: true },
    { mark: 'rise', offset: 1, until: 'fall' },
  ] as const;
  test('names the fields the drag of each edge writes, for each way a span ends', () => {
    for (const span of spans)
      for (const edge of ['move', 'start', 'end'] as const)
        expect(
          `${edge}: ${Object.keys(Option.getOrThrow(dragPatch(span, cue, edge, bar, 1 / 30)))}`,
        ).toBe(`${edge}: ${dragFields(span, edge)}`);
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
  test('a write that changed nothing says the value was already so, not that it moved', () => {
    // Two nudges that cancel, joined while a write was out.
    const write = {
      _tag: 'CueWrite' as const,
      scene: 'one',
      cue: 'rise',
      patch: { offset: 0.433 },
      said: { offset: { before: '0.433', after: '0.433', unit: 's' } },
    };
    const changed = { ...result, change: ChangeId.make('c1') };
    expect(wroteNote(write, changed)).toBe('cue rise offset 0.433 → 0.433 s');
    expect(wroteNote(write, result)).toBe('cue rise offset 0.433 → 0.433 s (already so)');
  });
  test('an undo or redo names what it put back', () => {
    const undo = {
      _tag: 'StepWrite' as const,
      verb: 'undo' as const,
      request: RequestId.make('undo-1'),
      change: Option.none(),
    };
    expect(wroteNote(undo, { ...result, target: 'undo cue rise offset' })).toBe(
      'undid cue rise offset in scenes/one.ts',
    );
    const redo = {
      _tag: 'StepWrite' as const,
      verb: 'redo' as const,
      request: RequestId.make('redo-1'),
      change: Option.none(),
    };
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
    const dragged = dragKnob(grip, { x: 10 + 215.2, y: 20 + 95, free: false });
    expect(dragged.write).toEqual(
      Option.some({
        _tag: 'KnobWrite',
        scene: 'three',
        knob: 'face',
        value: [430, 190],
        said: 'knob face [400, 200] → [430, 190]',
      }),
    );
    expect(dragged.edit.knobs).toEqual({ face: [430, 190], faceZoom: 2 });
  });

  test("a camera's target the camera sits on moves the picture with the pointer", () => {
    const grip = knobGrip('picture', [2, 0, 0, 2, -480, -220], [0.5, 0, 0, 0.5, 240, 110]);
    // 40 frame pixels right: the target moves 20 world units left.
    const dragged = dragKnob(grip, { x: 10 + 220, y: 20 + 100, free: false });
    expect(dragged.write).toEqual(
      Option.some({
        _tag: 'KnobWrite',
        scene: 'three',
        knob: 'face',
        value: [380, 200],
        said: 'knob face [400, 200] → [380, 200]',
      }),
    );
  });

  test('back where it began writes nothing', () => {
    const grip = knobGrip('point', [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]);
    expect(dragKnob(grip, { x: 10 + 200, y: 20 + 100, free: false }).write).toEqual(Option.none());
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
    expect(knobRefusal(read(source()), 'spot')).toEqual(Option.none());
  });
  test('a computed knob, or a knobs object the lab will not write, says why', () => {
    expect(knobRefusal(read(source()), 'size')).toEqual(
      Option.some('cannot move size: it is computed in the source'),
    );
    const refused = source({ refused: [{ field: 'knobs', reason: 'they are spread in' }] });
    expect(knobRefusal(read(refused), 'spot')).toEqual(
      Option.some('cannot move spot: they are spread in'),
    );
  });
  test('no source: the reason it could not be read; pending while it is read', () => {
    expect(knobRefusal(unread('no file'), 'spot')).toEqual(Option.some('cannot edit: no file'));
    expect(knobRefusal(READING, 'spot')).toEqual(Option.some('reading the source…'));
  });
});
