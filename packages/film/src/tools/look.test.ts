// The look pass's measures, on thumbs made by hand: how much of a scene holds
// still, the light of each act against its target, the largest face, and the
// chapters the acts name.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import type { FaceMark, Look, Timed } from '../core/schema.ts';
import {
  type Drawn,
  FACE_SHARE,
  HELD_MAX,
  THUMB_BYTES,
  actSpans,
  actsOf,
  chapterTime,
  chapters,
  colourScript,
  heldSeconds,
  heldShares,
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
const placed = layout(holdScenes, holdTimings);
const samples = lookSamples(placed, FPS, 1_000_000);
const drawn = samples.map((s, k): Drawn => {
  if (s.scene === 'held') return { thumb: thumb(128), faces: [face('held', 400)] };
  if (s.scene === 'brief') return { thumb: thumb((k % 2) * 255), faces: [face('brief', 100)] };
  return { thumb: thumb(200), faces: [face('ambient', 500, 0.2)] };
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
    const quiet = layout(silent, { voice: '', scenes: {} });
    const at = lookSamples(quiet, FPS, 1_000_000);
    const still = sceneLooks(
      quiet,
      at,
      at.map(() => ({ thumb: thumb(90), faces: [] })),
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
        return { thumb: thumb(128), faces: [{ ...face('held', 400), x: at[0], y: at[1] }] };
      if (s.scene === 'brief') return { thumb: thumb((k % 2) * 255), faces: [face('brief', 100)] };
      return { thumb: thumb(200), faces: [face('ambient', 500, 0.2)] };
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
    const found = lookFindings({ looks, height: HEIGHT }, acts);
    expect(found.map((r) => r.finding._tag)).toEqual([
      'HeldShare',
      'HeldShare',
      'FaceSmall',
      'FaceSmall',
      'ColourScript',
      'ColourScript',
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
  const laid = layout(three, { voice: '', scenes: {} });
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
    const four = layout([...three, { id: 'd', min: 12 }], { voice: '', scenes: {} });
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
    const tight = layout(short, { voice: '', scenes: {} });
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
