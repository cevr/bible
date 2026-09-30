// The look pass's measures, on thumbs made by hand: how much of a scene holds
// still, the light of each act against its target, the largest face, and the
// chapters the acts name.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import type { FaceMark, HandMark, Look, Timed } from '../core/schema.ts';
import {
  type Drawn,
  FACE_SHARE,
  HAND_JUMP,
  type HandFrame,
  HELD_MAX,
  SIZE_JUMP,
  THUMB_BYTES,
  actSpans,
  actsOf,
  chapterTime,
  chapters,
  colourScript,
  farHands,
  handJumps,
  handSpans,
  heldSeconds,
  heldShares,
  hiddenHands,
  lookFindings,
  lookLines,
  lookSamples,
  sceneLooks,
  smallFaces,
} from './look.ts';
import { holdScenes, holdTimings } from './testing.ts';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAME = { width: WIDTH, height: HEIGHT };
const thumb = (grey: number) => new Uint8Array(THUMB_BYTES).fill(grey);
const face = (scene: string, size: number, alpha = 1): FaceMark => ({
  scene,
  x: 960,
  y: 400,
  size,
  alpha,
});

// Three spoken scenes: `held` never changes, `brief` flips black and white
// each sample, `ambient` is the paper's grey. Each declares one face.
const placed = Result.getOrThrow(layout(holdScenes, holdTimings));
const samples = lookSamples(placed, FPS, 1_000_000);
const drawn = samples.map((s, k): Drawn => {
  if (s.scene === 'held') return { thumb: thumb(128), faces: [face('held', 400)], hands: [] };
  if (s.scene === 'brief')
    return { thumb: thumb((k % 2) * 255), faces: [face('brief', 100)], hands: [] };
  return { thumb: thumb(200), faces: [face('ambient', 500, 0.2)], hands: [] };
});
const looks = sceneLooks(placed, samples, drawn, FRAME);
const lookOf = (scene: string) => looks.find((l) => l.scene === scene);

describe('heldSeconds', () => {
  test('a second holds when both of its steps change less than the threshold', () => {
    const same = [thumb(10), thumb(10), thumb(11), thumb(11), thumb(11)].map((t) =>
      Float32Array.from(t),
    );
    expect(heldSeconds(same)).toEqual([true, true]);
  });

  test('one still step of two does not hold the second: the smaller step decides', () => {
    const greys = [0, 0, 0].map((g) => new Float32Array(4).fill(g));
    greys[1] = new Float32Array(4).fill(50);
    expect(heldSeconds(greys)).toEqual([false]);
  });
});

describe('HeldShare', () => {
  test('a spoken scene that never changes is held for all its seconds, from its start', () => {
    const held = lookOf('held');
    expect(held?.seconds).toBeGreaterThan(2);
    expect(held?.held).toBe(held?.seconds);
    const found = heldShares(looks);
    expect(found.map((f) => f.scene)).toEqual(['held', 'ambient']);
    expect(found[0]?.share).toBe(1);
    expect(found[0]?.max).toBe(HELD_MAX);
    expect(found[0]?.from).toBe(held?.start);
    expect((found[0]?.to ?? 0) - (found[0]?.from ?? 0)).toBe(held?.seconds ?? -1);
    expect(found[0]?.message).toContain('longest held run');
  });

  test('the fix it names is a motion that clears the rule, never the drift that is only texture', () => {
    const message = heldShares(looks)[0]?.message ?? '';
    expect(message).toContain('slide a plane');
    expect(message).toContain('push on the turn');
    expect(message).toContain('pin a motion to a mark');
    expect(message).toContain('cut');
    expect(message).not.toContain('drift the camera');
    expect(message).toContain('drift is texture and never clears it');
  });

  test('a scene that changes every sample holds for none', () => {
    expect(lookOf('brief')?.held).toBe(0);
  });

  test('a scene the voice does not speak in is not judged', () => {
    const silent: ReadonlyArray<Timed> = [{ id: 'quiet', min: 6 }];
    const quiet = Result.getOrThrow(layout(silent, { voice: '', scenes: {} }));
    const at = lookSamples(quiet, FPS, 1_000_000);
    const still = sceneLooks(
      quiet,
      at,
      at.map(() => ({ thumb: thumb(90), faces: [], hands: [] })),
      FRAME,
    );
    expect(still[0]?.judged).toBe(false);
    expect(heldShares(still)).toEqual([]);
    expect(smallFaces(still, HEIGHT)).toEqual([]);
  });
});

describe('FaceSmall', () => {
  test('a face under a third of the frame, or one barely seen, never reaches human scale', () => {
    const found = smallFaces(looks, HEIGHT);
    expect(found.map((f) => [f.scene, f.largest])).toEqual([
      ['brief', 100],
      ['ambient', 0],
    ]);
    expect(found[0]?.min).toBeCloseTo(HEIGHT * FACE_SHARE);
  });

  test('a face whose centre is off the frame is not seen, however large', () => {
    // `held` again, its big face pushed past each edge in turn; `brief` keeps
    // its small one inside. A face centred on the frame's very edge still counts.
    const off = [
      [-1, 400],
      [WIDTH + 1, 400],
      [960, -1],
      [960, HEIGHT + 1],
    ] as const;
    const shifted = samples.map((s, k): Drawn => {
      const at = off[k % off.length] ?? off[0];
      if (s.scene === 'held')
        return {
          thumb: thumb(128),
          faces: [{ ...face('held', 400), x: at[0], y: at[1] }],
          hands: [],
        };
      if (s.scene === 'brief')
        return { thumb: thumb((k % 2) * 255), faces: [face('brief', 100)], hands: [] };
      return { thumb: thumb(200), faces: [face('ambient', 500, 0.2)], hands: [] };
    });
    const seen = sceneLooks(placed, samples, shifted, FRAME);
    expect(seen.map((l) => [l.scene, l.face])).toEqual([
      ['held', 0],
      ['brief', 100],
      ['ambient', 0],
    ]);
    expect(smallFaces(seen, HEIGHT).map((f) => f.scene)).toEqual(['held', 'brief', 'ambient']);
    const atEdge = sceneLooks(
      placed,
      samples,
      samples.map((): Drawn => ({
        thumb: thumb(1),
        faces: [{ ...face('held', 400), x: WIDTH, y: HEIGHT }],
        hands: [],
      })),
      FRAME,
    );
    expect(atEdge.find((l) => l.scene === 'held')?.face).toBe(400);
  });
});

describe('ColourScript', () => {
  const look: Look = {
    acts: [
      { from: 'held', name: 'open', luma: [100, 140] },
      { from: 'brief', name: 'valley', luma: [0, 50], dark: 0.1, saturation: [0, 0.1] },
    ],
  };
  const acts = Result.getOrThrow(actSpans(look, placed));

  test('each act spans its scene to the next act', () => {
    expect(acts.map((a) => a.scenes)).toEqual([['held'], ['brief', 'ambient']]);
    expect(acts[1]?.start).toBe(lookOf('brief')?.start);
  });

  test('an act warns for each measure outside its target, and only those', () => {
    const found = colourScript(acts, looks);
    expect(found.map((f) => [f.act, f.measure])).toEqual([
      ['valley', 'luma'],
      ['valley', 'dark'],
    ]);
    expect(found[1]?.message).toContain('dark');
  });

  test('an act that names a scene the film lacks fails', () => {
    const wrong = actSpans({ acts: [{ from: 'nowhere', name: 'x' }] }, placed);
    expect(Result.isFailure(wrong) && wrong.failure._tag).toBe('UnknownScene');
  });

  test('no declared look means no acts', () => {
    expect(Result.getOrThrow(actsOf(Option.none(), placed))).toEqual([]);
  });

  test('the look pass reports every finding as a warning', () => {
    const jumps = handJumps(popping);
    const far = farHands(outOfReach);
    const hidden = hiddenHands(behind);
    const found = lookFindings({ looks, height: HEIGHT, jumps, far, hidden }, acts);
    expect(found.map((r) => r.finding._tag)).toEqual([
      'HeldShare',
      'HeldShare',
      'FaceSmall',
      'FaceSmall',
      'ColourScript',
      'ColourScript',
      'HandJump',
      'HandFar',
      'HandHidden',
    ]);
    expect(found.every((r) => r.level === 'warning')).toBe(true);
  });

  test('the look-book prints a line per scene, per act and for the film', () => {
    const lines = lookLines(looks, acts);
    expect(lines).toHaveLength(looks.length + acts.length + 1);
    expect(lines[0]).toContain('held=100%');
    expect(lines[looks.length + 1]).toContain('target=luma 0–50, saturation 0–0.1, dark ≤10%');
    expect(lines.at(-1)).toMatch(/^film held=/);
  });
});

describe('chapters', () => {
  const three: ReadonlyArray<Timed> = [
    { id: 'a', min: 12 },
    { id: 'b', min: 12 },
    { id: 'c', min: 12 },
  ];
  const laid = Result.getOrThrow(layout(three, { voice: '', scenes: {} }));
  const named = (look: Look) => chapters('f', Result.getOrThrow(actSpans(look, laid)), laid);

  test('a chapter starts at mm:ss, or h:mm:ss past an hour', () => {
    expect(chapterTime(0)).toBe('00:00');
    expect(chapterTime(65.9)).toBe('01:05');
    expect(chapterTime(3725)).toBe('1:02:05');
  });

  test('each act that names a chapter gives one line at its first scene', () => {
    const lines = Result.getOrThrow(
      named({
        acts: [
          { from: 'a', name: 'one', chapter: 'Who?' },
          { from: 'b', name: 'two', chapter: 'Why?' },
          { from: 'c', name: 'three', chapter: 'How?' },
        ],
      }),
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('00:00 Who?');
    expect(lines[1]).toMatch(/^00:1\d Why\?$/);
  });

  test('YouTube refuses fewer than three chapters, a first past 00:00, or one under 10 s', () => {
    const tooFew = named({ acts: [{ from: 'a', name: 'one', chapter: 'Who?' }] });
    expect(Result.isFailure(tooFew) && tooFew.failure.reason).toContain('YouTube needs 3');
    const four = Result.getOrThrow(
      layout([...three, { id: 'd', min: 12 }], { voice: '', scenes: {} }),
    );
    const lateActs = Result.getOrThrow(
      actSpans(
        {
          acts: [
            { from: 'a', name: 'zero' },
            { from: 'b', name: 'one', chapter: 'Who?' },
            { from: 'c', name: 'two', chapter: 'Why?' },
            { from: 'd', name: 'three', chapter: 'How?' },
          ],
        },
        four,
      ),
    );
    const late = chapters('f', lateActs, four);
    expect(Result.isFailure(late) && late.failure.reason).toContain('not 00:00');
    const short: ReadonlyArray<Timed> = [
      { id: 'a', min: 12 },
      { id: 'b', min: 4 },
      { id: 'c', min: 12 },
    ];
    const tight = Result.getOrThrow(layout(short, { voice: '', scenes: {} }));
    const acts = Result.getOrThrow(
      actSpans(
        {
          acts: [
            { from: 'a', name: 'one', chapter: 'Who?' },
            { from: 'b', name: 'two', chapter: 'Why?' },
            { from: 'c', name: 'three', chapter: 'How?' },
          ],
        },
        tight,
      ),
    );
    const brief = chapters('f', acts, tight);
    expect(Result.isFailure(brief) && brief.failure.reason).toContain('"Why?" runs under 10s');
  });
});

// Hands, as a kit's person declares them: one hand 44 px long, its shoulder
// fixed on screen unless moved, floating 60 px to the side of it at rest, a
// reach of 240 px.
const REST = { x: 1020, y: 520 } as const;
const handAt = (reach: number, over: Partial<HandMark> = {}): HandMark => ({
  scene: 'held',
  side: 'near',
  x: REST.x,
  y: REST.y,
  sx: 960,
  sy: 520,
  tx: REST.x,
  ty: REST.y,
  size: 44,
  radius: 240,
  reach,
  inside: false,
  over: true,
  alpha: 1,
  ...over,
});
/** A hand `reach` of the way along an arc round its shoulder from its rest (0°) to straight up (−90°), 150 px out. */
const onArc = (reach: number, over: Partial<HandMark> = {}): HandMark => {
  const a = (-Math.PI / 2) * reach;
  const r = 60 + 90 * reach;
  return handAt(reach, {
    x: 960 + r * Math.cos(a),
    y: 520 + r * Math.sin(a),
    tx: 960,
    ty: 370,
    ...over,
  });
};
/** Frames `from`, `from + 1`… of `scene`, one per entry of `hands`, at 30 fps. */
const run = (scene: string, from: number, hands: ReadonlyArray<ReadonlyArray<HandMark>>) =>
  hands.map((h, k): HandFrame => ({ scene, frame: from + k, T: (from + k) / FPS, hands: h }));
// A hand that goes from its rest to its work in one frame, at frame 11.
const popping = run('held', 10, [[onArc(0)], [onArc(1)], [onArc(1)]]);
// A hand at work on a target 1.4 times its figure's reach from its shoulder.
const outOfReach = run('held', 10, [
  [handAt(1, { x: 960 + 336, tx: 960 + 336 })],
  [handAt(1, { x: 960 + 336, tx: 960 + 336 })],
]);
// A far hand at work inside the garment and drawn behind it.
const behind = run('held', 10, [
  [handAt(1, { side: 'far', inside: true, over: false })],
  [handAt(1, { side: 'far', inside: true, over: false })],
]);

describe('HandJump', () => {
  test('a hand that goes from its rest to its work in one frame jumps', () => {
    const [jump, ...rest] = handJumps(popping);
    expect(rest).toEqual([]);
    expect(jump).toMatchObject({ scene: 'held', side: 'near', what: 'place', max: HAND_JUMP });
    // From 60 px out at 0° to 150 px out at −90°: 174 px, about 4 of its lengths.
    expect(jump?.by).toBeCloseTo(Math.hypot(60, 150) / 44, 6);
    expect(jump?.T).toBeCloseTo(11 / FPS, 9);
  });

  test('a hand that grows or shrinks in one frame jumps', () => {
    const [jump, ...rest] = handJumps(run('held', 0, [[handAt(0)], [handAt(0, { size: 20 })]]));
    expect(rest).toEqual([]);
    expect(jump).toMatchObject({ what: 'size', max: SIZE_JUMP });
    expect(jump?.by).toBeCloseTo(24 / 44, 6);
  });

  test('a hand eased over a cue never jumps, however fast its middle', () => {
    // Its whole way in half a second, eased in and out.
    const eased = Array.from({ length: 16 }, (_, k) => [
      onArc(0.5 - 0.5 * Math.cos((k / 15) * Math.PI)),
    ]);
    expect(handJumps(run('held', 0, eased))).toEqual([]);
  });

  test('a camera move carries a hand with its shoulder: no jump', () => {
    const moved = run('held', 0, [
      [onArc(1)],
      [onArc(1, { sx: 975, sy: 535, x: 975, y: 385, tx: 975, ty: 385 })],
    ]);
    expect(handJumps(moved)).toEqual([]);
  });

  test('a zoom, or the whole figure popping in, scales the hand with its shoulder and reach: no jump', () => {
    // Everything doubled about a point under the shoulder, in one frame: the
    // hand 105 px out goes 210 px out, more than its length's 1.5 on screen.
    const k = 2;
    const about = (h: HandMark): HandMark => ({
      ...h,
      x: 960 + (h.x - 960) * k,
      y: 540 + (h.y - 540) * k,
      sx: 960 + (h.sx - 960) * k,
      sy: 540 + (h.sy - 540) * k,
      tx: 960 + (h.tx - 960) * k,
      ty: 540 + (h.ty - 540) * k,
      size: h.size * k,
      radius: h.radius * k,
    });
    expect(handJumps(run('held', 0, [[onArc(0.5)], [about(onArc(0.5))]]))).toEqual([]);
    // The hand alone grown as much is a jump.
    const grown = run('held', 0, [[onArc(0.5)], [onArc(0.5, { size: 44 * 1.4 })]]);
    expect(handJumps(grown).map((j) => j.what)).toEqual(['size']);
  });

  test('frames that are not adjacent, or not of one scene, are never compared', () => {
    const apart: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [onArc(0)] },
      { scene: 'held', frame: 15, T: 0.5, hands: [onArc(1)] },
    ];
    expect(handJumps(apart)).toEqual([]);
    const cut: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [onArc(0)] },
      { scene: 'brief', frame: 1, T: 1 / FPS, hands: [onArc(1, { scene: 'brief' })] },
    ];
    expect(handJumps(cut)).toEqual([]);
  });

  test('a hand of another person, or of the other side, is not the same hand', () => {
    const elsewhere = run('held', 0, [[onArc(0)], [onArc(1, { sx: 400 })]]);
    expect(handJumps(elsewhere)).toEqual([]);
    const other = run('held', 0, [[onArc(0)], [onArc(1, { side: 'far' })]]);
    expect(handJumps(other)).toEqual([]);
  });

  test('a hand that jumps while nobody sees it is no jump', () => {
    expect(
      handJumps(run('held', 0, [[onArc(0, { alpha: 0 })], [onArc(1, { alpha: 0.1 })]])),
    ).toEqual([]);
  });
});

describe('HandFar', () => {
  test('a hand at work past its figure’s reach is far, once per scene and side, with the worst', () => {
    const [far, ...rest] = farHands(outOfReach);
    expect(rest).toEqual([]);
    expect(far).toMatchObject({ scene: 'held', side: 'near', frames: 2 });
    expect(far?.worst).toBeCloseTo(1.4, 9);
    expect(far?.from).toBeCloseTo(10 / FPS, 9);
    expect(far?.to).toBeCloseTo(11 / FPS, 9);
  });

  test('on its way out the target already counts; at rest, within reach or unseen it does not', () => {
    const fine = run('held', 0, [
      [handAt(0, { tx: 960 + 400 })],
      [handAt(1, { x: 960 + 230, tx: 960 + 230 })],
      [handAt(1, { x: 960 + 336, tx: 960 + 336, alpha: 0.2 })],
      [handAt(1, { x: 960 + 336, tx: 960 + 336, scene: 'brief' })],
    ]);
    expect(farHands(fine)).toEqual([]);
    const going = farHands(run('held', 0, [[handAt(0.3, { tx: 960 + 336 })]]));
    expect(going).toHaveLength(1);
  });
});

describe('handSpans', () => {
  test('the frames between two samples across which a hand travels are drawn, each once', () => {
    const coarse: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [onArc(0)] },
      { scene: 'held', frame: 15, T: 0.5, hands: [onArc(0.4)] },
      { scene: 'held', frame: 30, T: 1, hands: [onArc(1)] },
      { scene: 'held', frame: 45, T: 1.5, hands: [onArc(1)] },
    ];
    const spans = handSpans(coarse, FPS);
    expect(spans.map((s) => s.frame)).toEqual(Array.from({ length: 31 }, (_, k) => k));
    expect(spans.every((s) => s.scene === 'held')).toBe(true);
    expect(spans[30]?.T).toBeCloseTo(1, 9);
  });

  test('a hand at work whose target changes between two samples is drawn across it', () => {
    const coarse: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [onArc(1)] },
      { scene: 'held', frame: 15, T: 0.5, hands: [onArc(1, { x: 1100, tx: 1100 })] },
    ];
    expect(handSpans(coarse, FPS)).toHaveLength(16);
  });

  test('a hand that comes at work between two samples (its person entering) is drawn too', () => {
    const coarse: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [] },
      { scene: 'held', frame: 15, T: 0.5, hands: [onArc(1)] },
    ];
    expect(handSpans(coarse, FPS)).toHaveLength(16);
  });

  test('hands held at rest or at work, bobbing with the breath, or samples of two scenes, draw nothing more', () => {
    const still: ReadonlyArray<HandFrame> = [
      { scene: 'held', frame: 0, T: 0, hands: [onArc(1)] },
      { scene: 'held', frame: 15, T: 0.5, hands: [onArc(1)] },
      { scene: 'held', frame: 30, T: 1, hands: [handAt(0)] },
      { scene: 'held', frame: 45, T: 1.5, hands: [handAt(0, { y: REST.y + 2 })] },
      { scene: 'brief', frame: 60, T: 2, hands: [handAt(0, { scene: 'brief' })] },
    ];
    // Only its way back to rest, between frames 15 and 30, is drawn.
    expect(handSpans(still, FPS).map((s) => s.frame)).toEqual(
      Array.from({ length: 16 }, (_, k) => 15 + k),
    );
  });
});

describe('HandHidden', () => {
  test('an acting hand inside its body and drawn behind it is hidden, once per scene and side', () => {
    const [hidden, ...rest] = hiddenHands(behind);
    expect(rest).toEqual([]);
    expect(hidden).toMatchObject({ scene: 'held', side: 'far', frames: 2 });
    expect(hidden?.from).toBeCloseTo(10 / FPS, 9);
    expect(hidden?.to).toBeCloseTo(11 / FPS, 9);
  });

  test('a hand drawn over its body, outside it, still on its way or barely seen is not hidden', () => {
    const fine = run('held', 0, [
      [handAt(1, { inside: true, over: true })],
      [handAt(1, { inside: false, over: false })],
      [handAt(0.3, { inside: true, over: false })],
      [handAt(0.7, { inside: true, over: false })],
      [handAt(1, { inside: true, over: false, alpha: 0.2 })],
      [handAt(1, { inside: true, over: false, scene: 'brief' })],
    ]);
    expect(hiddenHands(fine)).toEqual([]);
  });
});
