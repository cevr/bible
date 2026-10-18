import { describe, expect, test } from 'bun:test';
import { DIRECTION } from './house.ts';
import { figure } from './figure.ts';
import { paper } from './paper.ts';
import { Tunic } from './parts/body.ts';
import { StubLegs } from './parts/feet.ts';
import { Hands } from './parts/hands.ts';
import { Head } from './parts/head.ts';
import { KitA } from './parts/kit.ts';
import { Stance } from './parts/stance.ts';
import { GivenRobe, Stain } from './parts/states.ts';
import { Stature } from './parts/stature.ts';
import { drawFigure } from './rig/draw.ts';
import { FACE, figure as rigOf } from './rig/parts.ts';
import { fragment, ids } from './rig/rml.ts';

// A figure composed of the house's parts, each checked as it is made: the
// refusals name the rule a part breaks (`rules.ts`).

const SKIN = paper({ color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb' }, 'skin');
const WHITE = paper({ color: '#fcfbfc', shade: '#dcd9ec', light: '#ffffff' }, 'white');

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
});
