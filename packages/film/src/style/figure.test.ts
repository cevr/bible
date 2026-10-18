import { describe, expect, test } from 'bun:test';
import { DIRECTION } from './house.ts';
import { figure } from './figure.ts';
import { paper } from './paper.ts';
import { Robe, Tunic } from './parts/body.ts';
import { Ear } from './parts/ear.ts';
import { Shoes, StubLegs } from './parts/feet.ts';
import { Hair } from './parts/hair.ts';
import { Hands } from './parts/hands.ts';
import { Head } from './parts/head.ts';
import { KitA } from './parts/kit.ts';
import { OpenMouth } from './parts/mouth.ts';
import { Bands } from './parts/over.ts';
import { Stance } from './parts/stance.ts';
import { GivenRobe, Stain } from './parts/states.ts';
import { Stature } from './parts/stature.ts';
import { drawFigure } from './rig/draw.ts';
import { FACE, ellipse, figure as rigOf } from './rig/parts.ts';
import { fragment, ids } from './rig/rml.ts';

// A figure composed of the house's parts, each checked as it is made: the
// refusals name the rule a part breaks (`rules.ts`).

const SKIN = paper({ color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb' }, 'skin');
const WHITE = paper({ color: '#fcfbfc', shade: '#dcd9ec', light: '#ffffff' }, 'white');
const HAIR = paper({ color: '#433736', shade: '#2e2a2c', light: '#5a4846' }, 'hair');
const FLAT = paper({ color: '#f4aa80', light: '#f4aa80' }, 'flat');
const RIMMED = paper({ color: '#f4aa80', light: '#f4aa80', rim: 2 }, 'rimmed');
const CONCEPT = {
  image: { set: 'concepts', file: 'images/court.png' },
  box: [0, 0, 100, 200] as const,
};

const stain = Stain({
  at: [-6, -168],
  r: [31, 42],
  soak: [[1.03, 0.5]],
  seed: 11,
  paper: '#cf4a44',
});
const robe = GivenRobe(WHITE);

/** A plain lead's parts, its states written as `states`. */
const leadOf = (states: ReadonlyArray<typeof stain | typeof robe>) => ({
  concept: { image: { set: 'concepts', file: 'images/lead.png' }, box: [0, 0, 100, 200] as const },
  art: { width: 360, height: 470, feet: [180, 440] as const },
  stature: Stature.PlainLead(),
  stance: Stance.Standing({ breath: { period: 4, trunk: 1.012, neck: -2 } }),
  head: Head.Round({ y: -300, r: [73, 72], neck: -236, paper: SKIN }),
  face: KitA({ x: 0, y: 12, scale: 1.75, gaze: [0, 12] }),
  body: Tunic({
    neck: -236,
    hem: -42,
    half: { neck: 41, hem: 75 },
    radius: 22,
    bow: 4,
    paper: SKIN,
  }),
  states,
  feet: StubLegs({ x: 23.5, r: 14, paper: SKIN }),
  hands: Hands({ paper: SKIN, share: 0.34 }),
});

describe('a composed figure', () => {
  test("its numbers are its parts', in the house's order: the kit's, the stance's, the head's, the states'", () => {
    const lead = figure(leadOf([robe, stain]));
    expect(Object.keys(lead.knobs)).toEqual([
      ...Object.keys(FACE),
      'lean',
      'tilt',
      'nod',
      'faceY',
      'stain',
      'robe',
    ]);
    // His eyes on us at rest: the face's place on his head, from the head's centre.
    expect(lead.knobs.gazeY).toBe(-288);
    expect(lead.knobs.stain).toBe(1);
    expect(lead.knobs.robe).toBe(0);
  });

  test('a figure with no states has no state numbers', () => {
    expect(Object.keys(figure(leadOf([])).knobs)).not.toContain('stain');
  });

  test('its states lie in one order whatever order they are written in', () => {
    const drawn = (states: ReadonlyArray<typeof stain | typeof robe>) =>
      fragment(drawFigure(rigOf(ids(), 'Lead', 1, 0, DIRECTION), figure(leadOf(states))));
    expect(drawn([stain, robe])).toBe(drawn([robe, stain]));
  });

  test('a state of one kind laid twice is refused', () => {
    expect(() => figure(leadOf([robe, robe]))).toThrow(/figure refused: .*laid twice/);
  });

  test('an arm is refused by CircleHands', () => {
    const armed = { ...leadOf([]), arm: { reach: 1 } };
    expect(() => figure(armed)).toThrow(/figure refused by CircleHands/);
  });

  test('a part spread with a field its kind lacks is refused by its rule as the figure is composed', () => {
    const inked = { ...leadOf([]).body, ink: '#000000' };
    expect(() => figure({ ...leadOf([]), body: inked })).toThrow(/body refused by InteriorInk/);
  });
});

/** A head traced from a concept: an ellipse a hair off a circle stands in for the trace. */
const traced = (y: number, neck: number) =>
  Head.Traced({
    outline: ellipse(0, 0, 50, 60, 12),
    y,
    neck,
    set: { x: 5, cant: 0.2 },
    paper: SKIN,
  });

const shoes = Shoes({
  x: 50,
  w: 50,
  h: 24,
  near: { paper: SKIN, light: { color: '#ffffff', from: 0, to: 7, depth: 5 } },
  far: { paper: SKIN, light: { color: '#ffffff', from: 16, to: 11, depth: 5 } },
});

/** A standing figure with a traced head, its hair and ear cut inside it, an open mouth, a cut robe and shoes. */
const standingOf = () => ({
  concept: CONCEPT,
  art: { width: 300, height: 600, feet: [150, 580] as const },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: { period: 4.5, trunk: 1.008, neck: -2.5 } }),
  head: traced(-400, -330),
  hair: Hair.Traced({ outline: ellipse(0, -40, 50, 25, 12), paper: HAIR }),
  ear: Ear({ at: [40, 10], r: [8, 12], paper: FLAT }),
  face: KitA({ x: -8, y: 8, scale: 1.3, gaze: [-300, 40] }),
  mouth: OpenMouth({ w: 30, h: 20, paper: '#3a2422' }),
  body: Robe.Cut({
    corners: [
      [-40, -330],
      [40, -330],
      [90, -30],
      [-90, -30],
    ],
    radii: [10],
    hem: -30,
    paper: SKIN,
  }),
  feet: shoes,
  hands: Hands({ paper: SKIN, share: 0.44 }),
});

/** A seated figure, its head's centre its origin: a traced head, a cut robe down behind its bench, and bands on it. */
const seatedOf = (y = 0) => ({
  concept: CONCEPT,
  art: { width: 460, height: 520, head: [230, 140] as const },
  stature: Stature.Canon(),
  stance: Stance.Seated({ breath: { period: 5, width: 1.008, neck: -2 } }),
  head: traced(y, 52),
  face: KitA({ x: -9.9, y: 8.6, scale: 1.3, gaze: [-900, 160] }),
  body: Robe.Cut({
    corners: [
      [-40, 28],
      [40, 28],
      [200, 300],
      [-200, 300],
    ],
    radii: [10],
    hem: 300,
    paper: SKIN,
  }),
  over: Bands({ x: 3.5, gap: 3, top: 17, bottom: 25, splay: 4, from: 62, to: 126, paper: FLAT }),
  hands: Hands({ paper: SKIN, share: 0.45 }),
});

/** `spec`'s figure drawn alone, as its project's markup. */
const drawnOf = (f: Parameters<typeof drawFigure>[1]) =>
  fragment(drawFigure(rigOf(ids(), 'Figure', 1, 0, DIRECTION), f));

describe('a traced figure, standing or seated', () => {
  test("an open mouth adds `shout`, after the kit's numbers and before the stance's", () => {
    expect(Object.keys(figure(standingOf()).knobs)).toEqual([
      ...Object.keys(FACE),
      'shout',
      'lean',
      'tilt',
      'nod',
    ]);
  });

  test("a seated figure's gaze is measured from its head's centre, its origin", () => {
    const judge = figure(seatedOf());
    expect(Object.keys(judge.knobs)).toEqual([...Object.keys(FACE), 'lean', 'tilt', 'nod']);
    expect([judge.knobs.gazeX, judge.knobs.gazeY]).toEqual([-900, 160]);
  });

  test("a seated figure leans about its garment's hem, and its breath swells the garment's side", () => {
    const rml = drawnOf(figure(seatedOf()));
    expect(rml).toContain('<Node y="300" name="leanPivot"');
    expect(rml).toContain('<Node y="-300" name="upright">');
    expect(rml).toContain('name="robeSide"');
    expect(rml).toContain('name="bandL"');
    expect(rml).not.toContain('name="trunk"');
  });

  test('a standing figure stands on its shoes, under its trunk', () => {
    const rml = drawnOf(figure(standingOf()));
    expect(rml).toContain('<Node y="-30" name="trunk"');
    expect(rml).toContain('name="shoeL"');
    expect(rml).toContain('name="shout"');
    expect(rml).not.toContain('name="leanPivot"');
  });

  test('hair, an ear or an open mouth on a round head is refused: each is cut inside a traced head', () => {
    const { hair, ear, mouth } = standingOf();
    for (const cut of [{ hair }, { ear }, { mouth }])
      expect(() => figure({ ...leadOf([]), ...cut })).toThrow(
        /figure refused: .*a round head takes no hair, ear or open mouth/,
      );
  });

  test('a given robe over a cut robe is refused', () => {
    expect(() => figure({ ...standingOf(), states: [robe] })).toThrow(
      /figure refused: .*a given robe is laid over a tunic only, not a CutRobe/,
    );
  });

  test("a seated figure's head off its origin is refused", () => {
    expect(() => figure(seatedOf(10))).toThrow(
      /figure refused: .*a seated figure's origin is its head's centre: its head's y is 10/,
    );
  });

  test('a seated figure has no feet', () => {
    // @ts-expect-error a seated figure's feet are hidden behind what it sits at: it takes none
    expect(() => figure({ ...seatedOf(), feet: shoes })).toThrow(
      /figure refused: Expected no excess property\s+at \["feet"\]/,
    );
  });
});

describe('the parts', () => {
  test('a shade that is its paper greyed is refused by GreyShade', () => {
    expect(() =>
      paper({ color: '#f7b284', shade: '#8f7a6e', light: '#fbd2b6' }, 'grey skin'),
    ).toThrow(/grey skin refused by GreyShade/);
  });

  test('a shade of black, or of a grey, is refused by GreyShade on a paper of any hue', () => {
    for (const shade of ['#000000', '#808080'] as const)
      for (const color of ['#f7b284', '#ece7fa', '#cf4a44'] as const)
        expect(() => paper({ color, shade, light: '#ffffff' }, 'shaded')).toThrow(
          /shaded refused by GreyShade/,
        );
  });

  test('a paper with an ink of its own is refused by InteriorInk', () => {
    const inked = { color: '#f7b284', shade: '#f0a27c', light: '#fbd2b6', ink: '#000000' } as const;
    expect(() => paper(inked, 'inked skin')).toThrow(/inked skin refused by InteriorInk/);
  });

  test('a hand with any field but its paper and its share is refused by CircleHands', () => {
    const thumbed = { paper: SKIN, share: 0.3, thumb: 1 };
    expect(() => Hands(thumbed)).toThrow(/Hands refused by CircleHands/);
  });

  test('a hand is checked again as a figure takes it', () => {
    const thumbed = { ...leadOf([]).hands, thumb: 1 };
    expect(() => figure({ ...leadOf([]), hands: thumbed })).toThrow(/hands refused by CircleHands/);
  });

  test('a stain with a rim is refused by InnerRim', () => {
    const rimmed = {
      at: [0, 0] as const,
      r: [10, 10] as const,
      soak: [],
      seed: 1,
      paper: '#cf4a44' as const,
      rim: 2,
    };
    expect(() => Stain(rimmed)).toThrow(/Stain refused by InnerRim/);
  });

  test('a face with a mark Kit A lacks is refused by KitA', () => {
    const nosed = { x: 0, y: 0, scale: 1, gaze: [0, 0] as const, nose: 1 };
    expect(() => KitA(nosed)).toThrow(/KitA refused by KitA/);
  });

  test('hair, an ear or bands laid within an outline with a rimmed paper are refused by InnerRim', () => {
    const outline = ellipse(0, 0, 10, 10, 8);
    expect(() => Hair.Traced({ outline, paper: RIMMED })).toThrow(
      /Hair.Traced refused by InnerRim/,
    );
    expect(() => Ear({ at: [0, 0], r: [8, 12], paper: RIMMED })).toThrow(/Ear refused by InnerRim/);
    expect(() =>
      Bands({ x: 0, gap: 3, top: 17, bottom: 25, splay: 4, from: 62, to: 126, paper: RIMMED }),
    ).toThrow(/Bands refused by InnerRim/);
  });

  test('an open mouth with an ink of its own is refused by InteriorInk', () => {
    const inked = { w: 30, h: 20, paper: '#3a2422' as const, ink: '#000000' };
    expect(() => OpenMouth(inked)).toThrow(/OpenMouth refused by InteriorInk/);
  });

  test('a cut robe takes one radius, or one for each corner', () => {
    const { body } = standingOf();
    const { _tag, ...cut } = body;
    expect(() => Robe.Cut({ ...cut, radii: [10, 20] })).toThrow(
      /Robe.Cut refused: .*2 radii for 4 corners/,
    );
    expect(Robe.Cut({ ...cut, radii: [1, 2, 3, 4] }).radii).toEqual([1, 2, 3, 4]);
  });

  test("a shoe's light runs between two of its outline's points", () => {
    const { _tag, ...s } = shoes;
    const lit = (from: number, to: number) => ({ ...s.near, light: { ...s.near.light, from, to } });
    expect(() => Shoes({ ...s, near: lit(3, 3) })).toThrow(
      /Shoes refused: .*from point 3 to itself/,
    );
    expect(() => Shoes({ ...s, near: lit(0, 18) })).toThrow(/Shoes refused/);
    expect(() => Shoes({ ...s, near: lit(0.5, 7) })).toThrow(/Shoes refused/);
  });

  test('an outline of fewer than three points is refused', () => {
    expect(() =>
      Head.Traced({
        outline: [
          [0, 0],
          [1, 1],
        ],
        y: 0,
        neck: 52,
        set: { x: 0, cant: 0 },
        paper: SKIN,
      }),
    ).toThrow(/Head.Traced refused/);
  });
});

/** A lock as its file keeps it, on the plain lead. */
const LOCK = {
  item: 'lead',
  version: 1,
  hash: 'a'.repeat(64),
  ask: 'a92f276635e',
  at: 1792281444576,
  seen: { set: 'concepts', file: 'images/lead.png' },
};

/** An override of the lead's lock, freeing one print of him. */
const OVERRIDE = {
  rule: 'FigureLock' as const,
  place: 'lead',
  frees: 'b'.repeat(64),
  reason: 'a test of the way out',
  quote: 'words a test stands in for',
};

describe('a lock', () => {
  test('a figure carries its lock, and the override that frees a print of it', () => {
    expect(figure({ ...leadOf([]), lock: LOCK }).lock).toEqual(LOCK);
    const freed = { ...LOCK, override: OVERRIDE };
    expect(figure({ ...leadOf([]), lock: freed }).lock).toEqual(freed);
  });

  test('an override that frees another figure is refused by FigureLock', () => {
    const elsewhere = { ...LOCK, override: { ...OVERRIDE, place: 'judge' } };
    expect(() => figure({ ...leadOf([]), lock: elsewhere })).toThrow(
      /lock refused by FigureLock, .*: its override frees judge, not lead/,
    );
  });

  test("an override without the owner's words written out is refused", () => {
    for (const quote of ['', ' padded '])
      expect(() =>
        figure({ ...leadOf([]), lock: { ...LOCK, override: { ...OVERRIDE, quote } } }),
      ).toThrow(/lock refused: /);
  });

  test('a rule with no way out has no override', () => {
    const grey = { ...LOCK, override: { ...OVERRIDE, rule: 'GreyShade' } };
    // @ts-expect-error GreyShade's way is none, so no override of it is a lock's
    expect(() => figure({ ...leadOf([]), lock: grey })).toThrow(/lock refused: /);
  });

  test("a lock's hash is a sha256, and a lock has no field its file lacks", () => {
    expect(() => figure({ ...leadOf([]), lock: { ...LOCK, hash: 'abc' } })).toThrow(
      /lock refused: .*a sha256/,
    );
    const noted = { ...LOCK, note: 'kept' };
    expect(() => figure({ ...leadOf([]), lock: noted })).toThrow(/lock refused: /);
  });
});
