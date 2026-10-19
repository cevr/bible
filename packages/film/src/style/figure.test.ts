import { describe, expect, expectTypeOf, test } from 'bun:test';
import { Record as Rec } from 'effect';
import { DIRECTION } from './house.ts';
import { figure, isComposed } from './figure.ts';
import { overridesIn } from './override.ts';
import { paper } from './paper.ts';
import { ARM_SIDES, Arm } from './parts/arm.ts';
import { Beard } from './parts/beard.ts';
import { Robe, Tunic } from './parts/body.ts';
import { Ear } from './parts/ear.ts';
import { Sandals, Shoes, StubLegs } from './parts/feet.ts';
import { Hair } from './parts/hair.ts';
import { Hands } from './parts/hands.ts';
import { Headcloth } from './parts/headcloth.ts';
import { Head } from './parts/head.ts';
import { KitA, tracedKit } from './parts/kit.ts';
import { OpenMouth } from './parts/mouth.ts';
import { Bands } from './parts/over.ts';
import { Stance } from './parts/stance.ts';
import { GivenRobe, type State, Stain } from './parts/states.ts';
import { Stature } from './parts/stature.ts';
import { FIGURE_TIMELINES, HAND_TIMELINES, drawFigure, drawHand } from './rig/draw.ts';
import { FACE, type FaceKnob, type Pt, ellipse, kitMarks, figure as rigOf } from './rig/parts.ts';
import { fragment, ids } from './rig/rml.ts';
import { roundedPolygon, tucked, tuckedRimmed } from './rig/shapes.ts';

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

/** A plain lead's parts, its states written as `states`, as their list is typed. */
const leadOf = <const S extends ReadonlyArray<State>>(states: S) => ({
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
    // Its type names the same numbers, read off its parts' types.
    expectTypeOf(Rec.keys(lead.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'lean' | 'tilt' | 'nod' | 'faceY' | 'stain' | 'robe'>
    >();
    // His eyes on us at rest: the face's place on his head, from the head's centre.
    expect(lead.knobs.gazeY).toBe(-288);
    expect(lead.knobs.stain).toBe(1);
    expect(lead.knobs.robe).toBe(0);
  });

  test('a figure with no states has no state numbers', () => {
    const bare = figure(leadOf([]));
    expect(Object.keys(bare.knobs)).toEqual([...Object.keys(FACE), 'lean', 'tilt', 'nod', 'faceY']);
    expectTypeOf(Rec.keys(bare.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'lean' | 'tilt' | 'nod' | 'faceY'>
    >();
  });

  test('it is frozen through: a change made in it throws, so it stays the figure its parts were checked as', () => {
    const lead = figure(leadOf([robe, stain]));
    const head = lead.head;
    expect(() => Object.assign(lead, { head: { ...head, y: 0 } })).toThrow(TypeError);
    expect(() => Object.assign(lead.head, { y: 0 })).toThrow(TypeError);
    expect(() => Object.assign(lead.concept.image, { file: 'images/other.png' })).toThrow(
      TypeError,
    );
    expect(() => Object.assign(lead.knobs, { stain: 0 })).toThrow(TypeError);
    expect(() => Object.assign(lead.concept.box, [1])).toThrow(TypeError);
    expect(lead.head).toBe(head);
    expect(lead.head.y).toBe(-300);
    expect(lead.concept.image).toEqual({ set: 'concepts', file: 'images/lead.png' });
    expect(lead.concept.box).toEqual([0, 0, 100, 200]);
    expect(lead.knobs.stain).toBe(1);
    expect(isComposed(lead)).toBe(true);
  });

  test('its numbers, as typed, are never more than its parts add: a part typed wider than its kind adds none', () => {
    /** A head and states as a slot types them: either kind of head, and any list of states. */
    const anyHead = (head: Head): Head => head;
    const anyStates = (states: ReadonlyArray<State>) => states;
    const wide = figure({
      ...leadOf([]),
      head: anyHead(leadOf([]).head),
      states: anyStates([stain, robe]),
    });
    expect(Object.keys(wide.knobs)).toEqual([
      ...Object.keys(FACE),
      'lean',
      'tilt',
      'nod',
      'faceY',
      'stain',
      'robe',
    ]);
    expectTypeOf(Rec.keys(wide.knobs)).toEqualTypeOf<Array<FaceKnob | 'lean' | 'tilt' | 'nod'>>();
  });

  test('its states lie in one order whatever order they are written in', () => {
    const drawn = (states: ReadonlyArray<typeof stain | typeof robe>) =>
      fragment(drawFigure(rigOf(ids(), 'Lead', 1, 0, DIRECTION), figure(leadOf(states))));
    expect(drawn([stain, robe])).toBe(drawn([robe, stain]));
  });

  test('a state of one kind laid twice is refused', () => {
    expect(() => figure(leadOf([robe, robe]))).toThrow(/figure refused: .*laid twice/);
  });

  test('an arm is given in its sleeve by its side: a slot or a side the figure lacks is refused', () => {
    const armed = { ...leadOf([]), arm: { reach: 1 } };
    expect(() => figure(armed)).toThrow(/figure refused: [^]*at \["arm"\]/);
    const sided = { ...leadOf([]), arms: { far: sleeve, left: sleeve } };
    expect(() => figure(sided)).toThrow(/figure refused: [^]*at \["arms"\]\["left"\]/);
  });

  test('a part spread with a field its kind lacks is refused by its rule as the figure is composed', () => {
    const inked = { ...leadOf([]).body, ink: '#000000' };
    expect(() => figure({ ...leadOf([]), body: inked })).toThrow(/body refused by InteriorInk/);
  });
});

/** A head traced from a concept: an ellipse a hair off a circle stands in for the trace. */
const traced = (y: number, neck: number) =>
  Head.Traced({
    view: 'threeQuarter',
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

/** A beard cut in a traced head, and the lip in it under the mouth line. */
const BEARD = ellipse(0, 35, 40, 22, 12);
const LIP = ellipse(0, 30, 9, 3, 8);
const beard = Beard({ outline: BEARD, paper: HAIR, lip: { outline: LIP, paper: FLAT } });

/** A headcloth cut in a traced head: the cloth over the crown, the band across the brow with its light, the edge down the near cheek. */
const CLOTH = ellipse(0, -30, 56, 40, 12);
const BAND: Pt[] = [
  [-50, -22],
  [50, -22],
  [50, -12],
  [-50, -12],
];
const BAND_LIT: Pt[] = [
  [-50, -22],
  [-30, -22],
  [-30, -12],
  [-50, -12],
];
const EDGE = ellipse(-46, 12, 6, 30, 10);
const headcloth = Headcloth({
  outline: CLOTH,
  paper: WHITE,
  band: { outline: BAND, paper: FLAT, tones: [{ pts: BAND_LIT, color: '#d4965b' }] },
  edge: { outline: EDGE, paper: HAIR },
});

/** A far arm in its sleeve, traced raised: its pivot inside the robe, turned down 1.2 at rest, the light laid on it. */
const SLEEVE: Pt[] = [
  [20, -300],
  [60, -320],
  [120, -430],
  [100, -440],
  [10, -330],
];
const SLEEVE_LIT: Pt[] = [
  [60, -320],
  [120, -430],
  [110, -435],
];
const sleeve = Arm({
  pivot: [30, -290],
  rest: 1.2,
  outline: SLEEVE,
  paper: FLAT,
  tones: [{ pts: SLEEVE_LIT, color: '#efca9a' }],
});

/** The plain lead's arms hanging at his sides at rest: each pivot inside his tunic and its sleeve, the far one lit. */
const HANGING: Pt[] = [
  [20, -215],
  [50, -220],
  [80, -100],
  [60, -95],
];
const HANGING_LIT: Pt[] = [
  [50, -220],
  [80, -100],
  [70, -98],
];
const hanging = {
  near: Arm({
    pivot: [-30, -200],
    rest: 0,
    outline: [
      [-50, -220],
      [-20, -215],
      [-60, -95],
      [-80, -100],
    ],
    paper: FLAT,
  }),
  far: Arm({
    pivot: [30, -200],
    rest: 0,
    outline: HANGING,
    paper: FLAT,
    tones: [{ pts: HANGING_LIT, color: '#efca9a' }],
  }),
};

/** A seated tunic down behind its bench, and a near arm resting in its lap: its pivot inside the tunic and its sleeve. */
const seatedTunic = Tunic({
  neck: 28,
  hem: 300,
  half: { neck: 40, hem: 200 },
  radius: 10,
  bow: 0,
  paper: SKIN,
});
const RESTING: Pt[] = [
  [-50, 65],
  [-20, 70],
  [-70, 205],
  [-90, 200],
];
const resting = Arm({ pivot: [-30, 80], rest: 0, outline: RESTING, paper: FLAT });

/** Sandals: each bare foot cut from its corners, a strap across the near one. */
const NEAR_FOOT: Pt[] = [
  [-60, -1],
  [-60, -8],
  [-20, -16],
  [-18, -1],
];
const FAR_FOOT: Pt[] = [
  [18, -1],
  [18, -16],
  [60, -8],
  [60, -1],
];
const STRAP: Pt[] = [
  [-50, -16],
  [-44, -16],
  [-36, -4],
  [-42, -4],
];
const sandals = Sandals({
  paper: SKIN,
  near: { corners: NEAR_FOOT, radii: [2], tones: [{ pts: STRAP, color: '#6b4430' }] },
  far: { corners: FAR_FOOT, radii: [2] },
  sole: '#43291c',
});

/** A standing figure with a traced head, its hair and ear cut inside it, an open mouth, a cut robe and shoes. */
const standingOf = () => ({
  concept: CONCEPT,
  art: { width: 300, height: 600, feet: [150, 580] as const },
  stature: Stature.Canon(),
  stance: Stance.Standing({ breath: { period: 4.5, trunk: 1.008, neck: -2.5 } }),
  head: traced(-400, -330),
  hair: Hair.Traced({ outline: ellipse(0, -40, 50, 25, 12), paper: HAIR }),
  ear: Ear.Round({ at: [40, 10], r: [8, 12], paper: FLAT }),
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

/** A seated figure, its origin its body's middle at its head's height: a traced head, a cut robe down behind its bench, and bands on it. */
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
    const standing = figure(standingOf());
    expect(Object.keys(standing.knobs)).toEqual([
      ...Object.keys(FACE),
      'shout',
      'lean',
      'tilt',
      'nod',
    ]);
    expectTypeOf(Rec.keys(standing.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'shout' | 'lean' | 'tilt' | 'nod'>
    >();
  });

  test("a seated figure's gaze is measured from its origin, its body's middle at its head's height", () => {
    const judge = figure(seatedOf());
    expect(Object.keys(judge.knobs)).toEqual([...Object.keys(FACE), 'lean', 'tilt', 'nod']);
    expectTypeOf(Rec.keys(judge.knobs)).toEqualTypeOf<Array<FaceKnob | 'lean' | 'tilt' | 'nod'>>();
    expect([judge.knobs.gazeX, judge.knobs.gazeY]).toEqual([-900, 160]);
  });

  test('plays the timelines the house names: a figure its breath and its boil, standing or seated, and a hand its boil', () => {
    const timelines = (rml: string) =>
      Array.from(rml.matchAll(/<LinearAnimation [^>]*\bname="([^"]+)"/g), (m) => m[1]);
    expect(timelines(drawnOf(figure(standingOf())))).toEqual([...FIGURE_TIMELINES]);
    expect(timelines(drawnOf(figure(seatedOf())))).toEqual([...FIGURE_TIMELINES]);
    const hand = fragment(drawHand(rigOf(ids(), 'Hand', 1, 0, DIRECTION), SKIN));
    expect(timelines(hand)).toEqual([...HAND_TIMELINES]);
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

  test('a beard, hair, a headcloth, an ear or an open mouth on a round head is refused: each is cut inside a traced head', () => {
    const { hair, ear, mouth } = standingOf();
    for (const cut of [{ beard }, { hair }, { headcloth }, { ear }, { mouth }])
      expect(() => figure({ ...leadOf([]), ...cut })).toThrow(
        /figure refused: .*a round head takes no beard, hair, headcloth, ear or open mouth/,
      );
  });

  test('a given robe over a cut robe is refused', () => {
    expect(() => figure({ ...standingOf(), states: [robe] })).toThrow(
      /figure refused: .*a given robe is laid over a tunic only, not a CutRobe/,
    );
  });

  test("a seated figure's head off its origin is refused", () => {
    expect(() => figure(seatedOf(10))).toThrow(
      /figure refused: .*a seated figure's origin is at its head's height: its head's y is 10/,
    );
  });

  test('a seated figure has no feet', () => {
    // @ts-expect-error a seated figure's feet are hidden behind what it sits at: it takes none
    expect(() => figure({ ...seatedOf(), feet: shoes })).toThrow(
      /figure refused: Expected no excess property\s+at \["feet"\]/,
    );
  });
});

/** The outline `key` is printed with in `rml`: its vertices' places, in order. */
const printed = (rml: string, key: string): Pt[] =>
  Array.from(
    rml.matchAll(new RegExp(`<\\w+Vertex x="([^"]+)" y="([^"]+)"[^>]* name="${key}\\.\\d+"`, 'g')),
    (m): Pt => [Number(m[1]), Number(m[2])],
  );

/** `v` as the project prints it, to a millionth (a negative zero prints as 0). */
const millionth = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/** `pts` as the project prints them. */
const toMillionth = (pts: ReadonlyArray<Pt>): Pt[] =>
  pts.map(([x, y]): Pt => [millionth(x), millionth(y)]);

/** The id the project gives the node or shape `key`, by its number. */
const idNumber = (rml: string, key: string) =>
  Number(rml.match(new RegExp(`name="${key}" id="\\d+:(\\d+)"`))?.[1]);

/** Where each of `keys` is first named in `rml`. */
const placesOf = (rml: string, keys: ReadonlyArray<string>) =>
  keys.map((key) => rml.indexOf(`name="${key}"`));

describe('a bearded head, and the parts of a head turned and of bare feet', () => {
  test('a bearded head lays its open mouth and its face kit over every part cut from it, the kit made first', () => {
    const rml = drawnOf(figure({ ...standingOf(), beard }));
    const places = placesOf(rml, ['shout', 'face', 'lip', 'beard', 'ear', 'hair', 'headPaper']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(idNumber(rml, 'face')).toBeLessThan(idNumber(rml, 'neck'));
  });

  test('a head with no beard lays its open mouth and its face kit under its hair and its ear, made after its neck', () => {
    const rml = drawnOf(figure(standingOf()));
    const places = placesOf(rml, ['ear', 'hair', 'shout', 'face', 'headPaper']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(idNumber(rml, 'face')).toBeGreaterThan(idNumber(rml, 'neck'));
  });

  test("each paper of a bearded head is tucked under those laid over it, its rimmed paper its rim's width and more", () => {
    const ear = ellipse(40, 10, 8, 12, 10);
    const hair = ellipse(0, -40, 50, 25, 12);
    const head = ellipse(0, 0, 50, 60, 12);
    const rimmed = paper({ color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb', rim: 4 }, 'skin');
    const { _tag, ...traced } = standingOf().head;
    const rml = drawnOf(
      figure({
        ...standingOf(),
        head: Head.Traced({ ...traced, paper: rimmed }),
        beard,
        ear: Ear.Traced({ outline: ear, paper: FLAT }),
      }),
    );
    expect(printed(rml, 'lip')).toEqual(toMillionth(tucked(LIP, [])));
    expect(printed(rml, 'beard')).toEqual(toMillionth(tucked(BEARD, [LIP])));
    expect(printed(rml, 'ear')).toEqual(toMillionth(tucked(ear, [LIP, BEARD])));
    expect(printed(rml, 'hair')).toEqual(toMillionth(tucked(hair, [LIP, BEARD, ear])));
    expect(printed(rml, 'headPaper')).toEqual(
      toMillionth(tuckedRimmed(head, [LIP, BEARD, ear, hair], 2 + 4)),
    );
  });

  test("a traced head's rim is its own paper's alone: every part cut in it is drawn with none", () => {
    const rimmed = paper({ color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb', rim: 4 }, 'skin');
    const { _tag, ...traced } = standingOf().head;
    const ears = Ear.Both({
      near: ellipse(-45, 10, 6, 10, 10),
      far: ellipse(45, 10, 6, 10, 10),
      paper: FLAT,
    });
    for (const cut of [{ beard, headcloth, ear: ears }, {}]) {
      const rml = drawnOf(
        figure({ ...standingOf(), head: Head.Traced({ ...traced, paper: rimmed }), ...cut }),
      );
      const head = rml.slice(rml.indexOf('name="headCut"'), rml.indexOf('name="headCutInk"'));
      expect(Array.from(head.matchAll(/name="(\w+)Rim"/g), (m) => m[1])).toEqual(['headPaper']);
    }
  });

  test('a head with no beard lays its papers as they are cut, untucked', () => {
    const rml = drawnOf(figure(standingOf()));
    expect(printed(rml, 'hair')).toEqual(toMillionth(ellipse(0, -40, 50, 25, 12)));
    expect(printed(rml, 'headPaper')).toEqual(toMillionth(ellipse(0, 0, 50, 60, 12)));
  });

  test('a kit turned on its head turns about its place, and its open mouth turns with it', () => {
    const turn = 0.3;
    const face = KitA({ x: -8, y: 8, scale: 1.3, rotation: turn, gaze: [-300, 40] });
    const rml = drawnOf(figure({ ...standingOf(), face }));
    expect(rml).toContain('<Node x="-8" y="8" rotation="0.3" name="faceTurn">');
    expect(rml).toContain('<Node x="8" y="-8" name="faceAt">');
    const [dx, dy] = kitMarks().mouth.map((v) => v * 1.3);
    const shout = rml.match(/<Node x="([^"]+)" y="([^"]+)" rotation="0.3" name="shout">/);
    expect(Number(shout?.[1])).toBeCloseTo(
      -8 + (dx ?? 0) * Math.cos(turn) - (dy ?? 0) * Math.sin(turn),
      5,
    );
    expect(Number(shout?.[2])).toBeCloseTo(
      8 + (dx ?? 0) * Math.sin(turn) + (dy ?? 0) * Math.cos(turn),
      5,
    );
  });

  test('a kit not turned has no turn, and nor has its open mouth', () => {
    const rml = drawnOf(figure(standingOf()));
    expect(rml).not.toContain('name="faceTurn"');
    expect(rml).toMatch(/<Node x="[^"]+" y="[^"]+" name="shout">/);
  });

  test('both ears of a head turned to us are cut as two papers, the near one first', () => {
    const ears = Ear.Both({
      near: ellipse(-45, 10, 6, 10, 10),
      far: ellipse(45, 10, 6, 10, 10),
      paper: FLAT,
    });
    const rml = drawnOf(figure({ ...standingOf(), ear: ears }));
    const places = placesOf(rml, ['earNear', 'earFar']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(rml).not.toContain('name="ear"');
  });

  test('sandals: each bare foot cut from its corners, the near one first, its strap and then its sole laid on it', () => {
    const rml = drawnOf(figure({ ...standingOf(), feet: sandals }));
    const places = placesOf(rml, ['footNear', 'footFar']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(printed(rml, 'footNear')).toEqual(toMillionth(roundedPolygon(NEAR_FOOT, [2])));
    expect(printed(rml, 'footNearTone0')).toEqual(STRAP);
    expect(rml).toMatch(/name="footNearTone0"[^]*?colorValue="FF6B4430"/);
    // Each sole runs 4 units past its foot's heel and toe, from 6.5 above the ground to 4 below it.
    expect(printed(rml, 'footNearTone1')).toEqual([
      [-64, -6.5],
      [-14, -6.5],
      [-14, 4],
      [-64, 4],
    ]);
    expect(rml).toMatch(/name="footNearTone1"[^]*?colorValue="FF43291C"/);
    expect(printed(rml, 'footFarTone0')).toEqual([
      [14, -6.5],
      [64, -6.5],
      [64, 4],
      [14, 4],
    ]);
  });

  test('a headcloth is cut under a beard and an ear and over the hair: its band, then its edge, then its cloth, the band lit by its tones', () => {
    const rml = drawnOf(figure({ ...standingOf(), beard, headcloth }));
    const places = placesOf(rml, [
      'lip',
      'beard',
      'ear',
      'band',
      'clothEdge',
      'cloth',
      'hair',
      'headPaper',
    ]);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(printed(rml, 'bandTone0')).toEqual(BAND_LIT);
    expect(rml).toMatch(/name="bandTone0"[^]*?colorValue="FFD4965B"/);
  });

  test("a kit's eyes lean inside its turn where the concept leans them, and no other mark of it does", () => {
    const face = KitA({
      x: -8,
      y: 8,
      scale: 1.3,
      rotation: 0.3,
      eyeLean: -0.175,
      gaze: [-300, 40],
    });
    const rml = drawnOf(figure({ ...standingOf(), face }));
    for (const eye of ['eyeL', 'eyeR'])
      expect(rml).toMatch(new RegExp(`<Shape [^>]*name="${eye}" [^>]*rotation="-0.175"`));
    expect(rml.match(/rotation="-0.175"/g)).toHaveLength(2);
    expect(rml.indexOf('name="faceTurn"')).toBeLessThan(rml.indexOf('name="eyeL"'));
    // A kit whose concept leans no eye leans none.
    expect(drawnOf(figure(standingOf()))).not.toMatch(/<Shape [^>]*name="eyeL" [^>]*rotation=/);
  });

  test('a traced robe is cut as traced, its colour laid on it in order, and its trunk breathes from its hem', () => {
    const outline: Pt[] = [
      [-40, -330],
      [40, -330],
      [85, -20],
      [0, -15],
      [-85, -20],
    ];
    const vest: Pt[] = [
      [-40, -330],
      [-10, -330],
      [-20, -100],
      [-60, -100],
    ];
    const tunic = Robe.Traced({
      outline,
      hem: -15,
      paper: SKIN,
      tones: [{ pts: vest, color: '#714b38' }],
    });
    const rml = drawnOf(figure({ ...standingOf(), body: tunic }));
    expect(printed(rml, 'robe')).toEqual(outline);
    expect(printed(rml, 'robeTone0')).toEqual(vest);
    expect(rml).toMatch(/name="robeTone0"[^]*?colorValue="FF714B38"/);
    expect(rml).toContain('<Node y="-15" name="trunk"');
    expect(rml).toContain('<Node y="15" name="robeSide">');
    // Checked again as its kind when a figure takes it.
    const inked = { ...tunic, ink: '#000000' };
    expect(() => figure({ ...standingOf(), body: inked })).toThrow(/body refused by InteriorInk/);
  });

  test('a cut robe lays its colour on it, clipped to it, in order', () => {
    const { _tag, ...cut } = standingOf().body;
    const sash: Pt[] = [
      [-20, -320],
      [0, -320],
      [60, -40],
      [40, -40],
    ];
    const robed = Robe.Cut({ ...cut, tones: [{ pts: sash, color: '#dca561' }] });
    const rml = drawnOf(figure({ ...standingOf(), body: robed }));
    expect(printed(rml, 'robeTone0')).toEqual(sash);
    expect(rml).toMatch(/name="robeTone0"[^]*?colorValue="FFDCA561"/);
  });

  test("marks traced in a concept's pixels place the kit at the eyes' middle, each mark in the eye line's frame, to a hundredth", () => {
    const marks = {
      eyes: [
        [90, 100],
        [110, 100],
      ],
      eye: [10, 16],
      brows: [
        [
          [85, 90],
          [95, 88],
        ],
        [
          [105, 88],
          [117, 90],
        ],
      ],
      brow: 4,
      mouth: [
        [95, 120],
        [105, 120],
      ],
      mouthLine: 3,
    } as const;
    const panel = { scale: 0.5, head: [100, 110] as const };
    expect(tracedKit(marks, panel, 0.5)).toEqual({
      x: 0,
      y: -5,
      scale: 1,
      rotation: 0,
      shape: {
        eyes: [-5, 5],
        eyeY: 0,
        eye: [5, 8],
        turn: 0.5,
        brows: [-5, 5.5],
        browY: -5.5,
        // Each brow's half-length, averaged: 2.55 and 3.04.
        browHalf: 2.8,
        brow: 2,
        mouth: [0, 10],
        mouthHalf: 2.5,
        mouthLine: 1.5,
      },
    });
    // An eye line tipped 10 px over 20 turns the kit 0.46 radians, the eyes level in its frame.
    const tipped = tracedKit(
      {
        ...marks,
        eyes: [
          [90, 100],
          [110, 110],
        ],
      },
      panel,
      0.5,
    );
    expect([tipped.rotation, ...tipped.shape.eyes, tipped.shape.eyeY]).toEqual([
      0.46, -5.59, 5.59, 0,
    ]);
  });
});

describe('an arm in its sleeve', () => {
  /** The id of the number `node`'s turn is bound to (`rig.bind`), in `rml`. */
  const boundIn = (rml: string, node: string) =>
    rml.match(
      new RegExp(`name="${node}"[^>]*>\\s*<DataBindContext sourcePathIds="[^"-]+-([^"]+)"`),
    )?.[1];
  /** The id of the view model's number named `knob`, in `rml`. */
  const numberIn = (rml: string, knob: string) =>
    rml.match(new RegExp(`<ViewModelPropertyNumber name="${knob}" id="([^"]+)"/>`))?.[1];
  /** The colours of the shape `key`'s paper, in `rml`, in order. */
  const paperIn = (rml: string, key: string) =>
    Array.from(
      rml
        .match(
          new RegExp(
            `<Shape name="${key}" id="[^"]+">(?:(?!</Shape>)[^])*?<Fill name="Paper">((?:(?!</Fill>)[^])*)</Fill>`,
          ),
        )?.[1]
        ?.matchAll(/colorValue="([^"]+)"/g) ?? [],
      (m) => m[1],
    );

  test("adds its side's number after the stance's, at its rest", () => {
    const armed = figure({ ...standingOf(), arms: { far: sleeve } });
    expect(Object.keys(armed.knobs)).toEqual([
      ...Object.keys(FACE),
      'shout',
      'lean',
      'tilt',
      'nod',
      'farArm',
    ]);
    expectTypeOf(Rec.keys(armed.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'shout' | 'lean' | 'tilt' | 'nod' | 'farArm'>
    >();
    expect(armed.knobs.farArm).toBe(1.2);
    const both = figure({ ...standingOf(), arms: { far: sleeve, near: sleeve } });
    expect(Object.keys(both.knobs).slice(-2)).toEqual(['nearArm', 'farArm']);
    expectTypeOf(Rec.keys(both.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'shout' | 'lean' | 'tilt' | 'nod' | 'nearArm' | 'farArm'>
    >();
  });

  test('an arm whose side is typed as one that may be missing adds no number to the type', () => {
    /** Arms as the slot types them: either side may be missing. */
    const anyArms = (arms: { readonly near?: Arm; readonly far?: Arm }) => arms;
    const wide = figure({ ...standingOf(), arms: anyArms({ far: sleeve }) });
    expect(Object.keys(wide.knobs).at(-1)).toBe('farArm');
    expectTypeOf(Rec.keys(wide.knobs)).toEqualTypeOf<
      Array<FaceKnob | 'shout' | 'lean' | 'tilt' | 'nod'>
    >();
  });

  test('lies behind its garment, cut in one outline with it, and turns about its pivot by its number', () => {
    const rml = drawnOf(figure({ ...standingOf(), arms: { far: sleeve } }));
    const places = placesOf(rml, ['robeCut', 'robe', 'farSleeveArm', 'farSleeve', 'robeCutInk']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(rml).toMatch(
      /<Node x="30" y="-290" name="farSleeveArm" id="[^"]+">\s*<DataBindContext sourcePathIds="[^"]+" propertyKey="15"\/>\s*<Node x="-30" y="290" name="farSleeveAt">/,
    );
    expect(numberIn(rml, 'farArm')).toBeDefined();
    expect(boundIn(rml, 'farSleeveArm')).toBe(numberIn(rml, 'farArm'));
    expect(printed(rml, 'farSleeve')).toEqual(SLEEVE);
    expect(printed(rml, 'farSleeveTone0')).toEqual(SLEEVE_LIT);
    // The cut's line runs round the garment; the sleeve inks its own, hidden under the garment's paper inside it.
    expect(rml).toContain('name="robeCutInkrobe.0"');
    expect(rml).not.toContain('name="robeCutInkfarSleeve.0"');
    expect(rml).toMatch(
      /<Shape name="farSleeve" id="[^"]+">(?:(?!<\/Shape>)[^])*?<Stroke [^>]*name="Ink">/,
    );
  });

  test('turned about a point outside its garment is refused, on either side and on any garment', () => {
    const astray = Arm({
      pivot: [400, 0],
      rest: 0,
      outline: [
        [380, -20],
        [420, -20],
        [420, 60],
        [380, 60],
      ],
      paper: FLAT,
    });
    expect(() => figure({ ...standingOf(), arms: { far: astray } })).toThrow(
      /arms\.far refused: [^]*its pivot \(400, 0\) lies outside its garment's outline/,
    );
    expect(() => figure({ ...standingOf(), arms: { near: astray } })).toThrow(/arms\.near refused/);
    // The sleeve's pivot lies inside the cut robe, but above the plain lead's tunic.
    expect(() => figure({ ...leadOf([]), arms: { far: sleeve } })).toThrow(
      /arms\.far refused: [^]*its pivot \(30, -290\) lies outside/,
    );
  });

  test('is frozen with its figure: a change made in it throws, and it stays as composed', () => {
    const armed = figure({ ...standingOf(), arms: { far: sleeve } });
    const far = armed.arms.far;
    expect(far).toBeDefined();
    expect(() => Object.assign(armed.arms, { near: sleeve })).toThrow(TypeError);
    expect(() => Object.assign(far ?? {}, { rest: 0 })).toThrow(TypeError);
    expect(() => Object.assign(far?.outline ?? [], [[0, 0]])).toThrow(TypeError);
    expect(armed.arms.near).toBeUndefined();
    expect(far?.rest).toBe(1.2);
    expect(far?.outline).toEqual(SLEEVE);
  });

  test('the near arm lies in front of the far one, each turned by its own number, and a figure with none draws its garment uncut', () => {
    const rml = drawnOf(figure({ ...standingOf(), arms: { far: sleeve, near: sleeve } }));
    const places = placesOf(rml, ['nearSleeveArm', 'farSleeveArm']);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(numberIn(rml, 'nearArm')).toBeDefined();
    expect(numberIn(rml, 'nearArm')).not.toBe(numberIn(rml, 'farArm'));
    expect(boundIn(rml, 'nearSleeveArm')).toBe(numberIn(rml, 'nearArm'));
    expect(boundIn(rml, 'farSleeveArm')).toBe(numberIn(rml, 'farArm'));
    expect(drawnOf(figure(standingOf()))).not.toContain('name="robeCut"');
  });

  test("a given robe on a figure with arms is cut with each sleeve again, in its paper, turned by that arm's number, standing or seated", () => {
    const lead = figure({ ...leadOf([robe]), arms: hanging });
    expect(isComposed(lead)).toBe(true);
    const rml = drawnOf(lead);
    // The robe and its sleeves, cut in one outline, over the garment and its own.
    const places = placesOf(rml, [
      'robePaperCut',
      'robePaper',
      'nearRobeSleeveArm',
      'nearRobeSleeve',
      'farRobeSleeveArm',
      'farRobeSleeve',
      'robePaperCutInk',
      'tunicCut',
      'tunic',
      'nearSleeveArm',
      'farSleeveArm',
      'tunicCutInk',
    ]);
    expect(places.every((at) => at >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    for (const side of ARM_SIDES) {
      // Each sleeve of the robe is its arm's, turned by its arm's number, in the robe's paper and none of the arm's.
      expect(boundIn(rml, `${side}RobeSleeveArm`)).toBe(numberIn(rml, `${side}Arm`));
      expect(printed(rml, `${side}RobeSleeve`)).toEqual([...hanging[side].outline]);
      expect(paperIn(rml, `${side}RobeSleeve`)).toEqual(paperIn(rml, 'robePaper'));
      expect(paperIn(rml, `${side}RobeSleeve`)).not.toEqual(paperIn(rml, `${side}Sleeve`));
      // It inks its own line, hidden under the robe's paper inside it.
      expect(rml).toMatch(
        new RegExp(
          `<Shape name="${side}RobeSleeve" id="[^"]+">(?:(?!</Shape>)[^])*?<Stroke [^>]*name="Ink">`,
        ),
      );
    }
    expect(numberIn(rml, 'nearArm')).not.toBe(numberIn(rml, 'farArm'));
    expect(printed(rml, 'farSleeveTone0')).toEqual(HANGING_LIT);
    expect(rml).not.toContain('name="farRobeSleeveTone0.0"');
    // The robe's line runs round the robe and its sleeves: its paper inside the cut lays none.
    expect(rml).toContain('name="robePaperCutInkrobePaper.0"');
    expect(rml).not.toMatch(
      /<Shape name="robePaper" id="[^"]+">(?:(?!<\/Shape>)[^])*?<Stroke [^>]*name="Ink">/,
    );
    const seated = drawnOf(
      figure({ ...seatedOf(), body: seatedTunic, states: [robe], arms: { near: resting } }),
    );
    expect(boundIn(seated, 'nearRobeSleeveArm')).toBe(numberIn(seated, 'nearArm'));
    expect(printed(seated, 'nearRobeSleeve')).toEqual(RESTING);
    // With no arms the robe is one piece, its line its own.
    const bare = drawnOf(figure(leadOf([robe])));
    expect(bare).not.toContain('name="robePaperCut"');
    expect(bare).toMatch(
      /<Shape name="robePaper" id="[^"]+">(?:(?!<\/Shape>)[^])*?<Stroke [^>]*name="Ink">/,
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

  test('a hand with a thumb is refused by CircleHands', () => {
    const thumbed = { paper: SKIN, share: 0.3, thumb: 1 };
    expect(() => Hands(thumbed)).toThrow(/Hands refused by CircleHands/);
  });

  test('a hand with an ink of its own is refused by InteriorInk, alone and as a figure takes it', () => {
    const inked = { paper: SKIN, share: 0.3, ink: '#000000' };
    expect(() => Hands(inked)).toThrow(/Hands refused by InteriorInk/);
    const inkedHands = { ...leadOf([]).hands, ink: '#000000' };
    expect(() => figure({ ...leadOf([]), hands: inkedHands })).toThrow(
      /hands refused by InteriorInk/,
    );
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

  test("a refusal says its rule's way out: nothing, the owner asked first, or an override", () => {
    const thumbed = { paper: SKIN, share: 0.3, thumb: 1 };
    expect(() => Hands(thumbed)).toThrow(/; nothing frees it\): /);
    const nosed = { x: 0, y: 0, scale: 1, gaze: [0, 0] as const, nose: 1 };
    // No part carries an override of KitA, so the refusal promises none.
    expect(() => KitA(nosed)).toThrow(
      /; no part carries an override of it: only the owner may change it, so ask him first\): /,
    );
    const elsewhere = { ...LOCK, override: { ...OVERRIDE, place: 'judge' } };
    expect(() => figure({ ...leadOf([]), lock: elsewhere })).toThrow(
      /; only an override citing the owner's decision on the figure frees it\): /,
    );
  });

  test('a colour is #rrggbb: a short #rgb is refused, since the house prints six digits', () => {
    expect(() => paper({ color: '#fff', light: '#ffffff' }, 'short')).toThrow(
      /short refused: .*a colour as #rrggbb hex/,
    );
    expect(() => paper({ color: '#ffffff', light: '#fff' }, 'short light')).toThrow(
      /short light refused: /,
    );
  });

  test('hair, an ear or bands laid within an outline with a rimmed paper are refused by InnerRim', () => {
    const outline = ellipse(0, 0, 10, 10, 8);
    expect(() => Hair.Traced({ outline, paper: RIMMED })).toThrow(
      /Hair.Traced refused by InnerRim/,
    );
    expect(() => Ear.Round({ at: [0, 0], r: [8, 12], paper: RIMMED })).toThrow(
      /Ear.Round refused by InnerRim/,
    );
    expect(() => Ear.Traced({ outline, paper: RIMMED })).toThrow(/Ear.Traced refused by InnerRim/);
    expect(() => Ear.Both({ near: outline, far: outline, paper: RIMMED })).toThrow(
      /Ear.Both refused by InnerRim/,
    );
    expect(() =>
      Bands({ x: 0, gap: 3, top: 17, bottom: 25, splay: 4, from: 62, to: 126, paper: RIMMED }),
    ).toThrow(/Bands refused by InnerRim/);
  });

  test('a beard, or the lip in it, with a rim is refused by InnerRim, and with an ink of its own by InteriorInk', () => {
    expect(() => Beard({ outline: BEARD, paper: RIMMED })).toThrow(/Beard refused by InnerRim/);
    expect(() =>
      Beard({ outline: BEARD, paper: HAIR, lip: { outline: LIP, paper: RIMMED } }),
    ).toThrow(/Beard refused by InnerRim/);
    const inked = { outline: LIP, paper: FLAT, ink: '#000000' };
    expect(() => Beard({ outline: BEARD, paper: HAIR, lip: inked })).toThrow(
      /Beard refused by InteriorInk/,
    );
    const inkedBeard = { outline: BEARD, paper: HAIR, ink: '#000000' };
    expect(() => Beard(inkedBeard)).toThrow(/Beard refused by InteriorInk/);
  });

  test('a headcloth, its band or its edge with a rim is refused by InnerRim, and with an ink of its own by InteriorInk', () => {
    const { _tag, ...cloth } = headcloth;
    expect(() => Headcloth({ ...cloth, paper: RIMMED })).toThrow(/Headcloth refused by InnerRim/);
    expect(() => Headcloth({ ...cloth, band: { outline: BAND, paper: RIMMED } })).toThrow(
      /Headcloth refused by InnerRim/,
    );
    expect(() => Headcloth({ ...cloth, edge: { outline: EDGE, paper: RIMMED } })).toThrow(
      /Headcloth refused by InnerRim/,
    );
    const inked = { outline: EDGE, paper: HAIR, ink: '#000000' };
    expect(() => Headcloth({ ...cloth, edge: inked })).toThrow(/Headcloth refused by InteriorInk/);
  });

  test('an arm with an ink of its own is refused by InteriorInk, as a figure takes it too', () => {
    const { _tag, ...arm } = sleeve;
    const inked = { ...arm, ink: '#000000' };
    expect(() => Arm(inked)).toThrow(/Arm refused by InteriorInk/);
    expect(() => figure({ ...standingOf(), arms: { far: { ...sleeve, ink: '#000000' } } })).toThrow(
      /arms.far refused by InteriorInk/,
    );
  });

  test('a sandal takes one radius, or one for each corner', () => {
    const { _tag, ...s } = sandals;
    expect(() => Sandals({ ...s, near: { ...s.near, radii: [1, 2] } })).toThrow(
      /Sandals refused: [^]*2 radii for 4 corners/,
    );
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
        view: 'threeQuarter',
        y: 0,
        neck: 52,
        set: { x: 0, cant: 0 },
        paper: SKIN,
      }),
    ).toThrow(/Head.Traced refused/);
  });

  test('a head in a view no concept shows is refused', () => {
    const { _tag, ...head } = traced(0, 52);
    // @ts-expect-error a traced head shows one of four views: front, three-quarter, side or back
    expect(() => Head.Traced({ ...head, view: 'oblique' })).toThrow(/Head.Traced refused/);
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

  test("a figure's override is found where it lays it, and a figure with none has none", () => {
    expect(overridesIn(figure(leadOf([])))).toEqual([]);
    expect(overridesIn(figure({ ...leadOf([]), lock: { ...LOCK, override: OVERRIDE } }))).toEqual([
      OVERRIDE,
    ]);
  });

  test('an override that frees another figure is refused by FigureLock', () => {
    const elsewhere = { ...LOCK, override: { ...OVERRIDE, place: 'judge' } };
    expect(() => figure({ ...leadOf([]), lock: elsewhere })).toThrow(
      /lock refused by FigureLock, .*: its override frees judge, not lead/,
    );
  });

  test("an override without the owner's words written out is refused by FigureLock, saying where", () => {
    for (const quote of ['', ' padded '])
      expect(() =>
        figure({ ...leadOf([]), lock: { ...LOCK, override: { ...OVERRIDE, quote } } }),
      ).toThrow(
        /^lock refused by FigureLock, .*\): Expected .*\n {2}at \["override"\]\["quote"\]\n/,
      );
  });

  test("a rule with no way out has no override: one laid on a lock is refused by the lock's rule", () => {
    const grey = { ...LOCK, override: { ...OVERRIDE, rule: 'GreyShade' } };
    // @ts-expect-error GreyShade's way is none, so no override of it is a lock's
    expect(() => figure({ ...leadOf([]), lock: grey })).toThrow(
      /^lock refused by FigureLock, .*\): Expected \{ readonly "rule": "FigureLock", \.\.\. \}\n {2}at \["override"\]$/,
    );
  });

  test("a lock's hash is a sha256, and a lock has no field its file lacks", () => {
    expect(() => figure({ ...leadOf([]), lock: { ...LOCK, hash: 'abc' } })).toThrow(
      /lock refused: .*a sha256/,
    );
    const noted = { ...LOCK, note: 'kept' };
    expect(() => figure({ ...leadOf([]), lock: noted })).toThrow(/lock refused: /);
  });
});
