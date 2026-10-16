// What the host lays round the figures (CRAFT 12), under every option.
// `direction-options.test.ts` tells the whole property.

import { describe, expect, test } from 'bun:test';
import { GAVEL_REST } from '../../../righteousness-by-faith/court.ts';
import { ramps } from '../../palette.ts';
import { riveAccused } from './accused.ts';
import { DIRECTION, type Direction, K1, inkOf, propsOf } from './direction.ts';
import { judgeOf, riveJudge, underHand } from './judge.ts';
import { SHADED, A0, derived, shown } from './test/direction-rigs.ts';
import {
  type Laid,
  laidBy,
  SWINGS,
  LEANS,
  type Mutation,
  blackMiddleStop,
} from './test/direction-host.ts';

/**
 * What laid a paint, which says what it may be (CRAFT 12: an ink may line a
 * piece, never shade it): a `line` is one opaque flat colour, as the kit lays
 * an ink line (`ink.ts` fills the line's outline) and a paper's flat face; a
 * `wash` is a gradient, a see-through fill or a pre-blended face; a `shadow`
 * is what a paint casts (`shadowColor`).
 */
type Role = 'line' | 'wash' | 'shadow';

/** The role of what laid `l`. */
const roleOf = (l: Laid): Role => (l.kind === 'shadow' ? 'shadow' : l.flat ? 'line' : 'wash');

/**
 * The kit's own shading, which the host lays round the Rive figures and no
 * ramp derives: the look's one named exception to "every colour is a base or
 * derived from one", each with its reason and the roles it may take.
 *
 * Why it stays: these are the engine's (`packages/film/src/canvas`), and the
 * court's scenery lays the same ones under every piece it cuts. Derived here
 * alone, the frame would hold two shadow styles. The `shade` unit owns them
 * and changes them together with the canvas looks; that change flips this
 * entry.
 */
const KIT_SHADING: ReadonlyMap<string, { readonly why: string; readonly as: ReadonlyArray<Role> }> =
  new Map([
    [
      '#281c10',
      {
        why: 'the kit’s warm dark, rgba(40, 28, 16, …): the cast shadow under each cut piece (`cutout`) and the contact shadow under a figure’s feet (`ground`); a shadow or a wash, never a solid piece',
        as: ['wash', 'shadow'],
      },
    ],
    [
      '#fbf6ea',
      {
        why: 'the kit’s paper core: the cream a cut or torn piece’s rim shows, laid flat',
        as: ['line'],
      },
    ],
  ]);

/**
 * The colours the host may lay round the figures under `d`, posed, by what
 * laid them: each paper it cuts (the sheet he reads, the gavel) or casts on
 * (the hand's receivers) as a line or a wash; that paper's shade as any; the
 * props' inks as a line only; the kit's named shading as its entry says.
 */
const hostColours = (
  d: Direction,
  swing: number,
  lean: number,
): Record<Role, ReadonlySet<string>> => {
  const props = propsOf(d);
  const papers = underHand(d, swing, lean, props).map((s) => s.paper);
  const shades = papers.map((p) => derived(p).shade);
  const kit = (role: Role) =>
    [...KIT_SHADING].flatMap(([c, { as }]) => (as.includes(role) ? [c] : []));
  const low = (cs: ReadonlyArray<string>) => new Set(cs.map((c) => c.toLowerCase()));
  return {
    line: low([...papers, ...shades, props.sheetInk, props.gavelInk, ...kit('line')]),
    wash: low([...papers, ...shades, ...kit('wash')]),
    shadow: low([...shades, ...kit('shadow')]),
  };
};

/** Why what the host laid is not what it may lay: each colour outside its role's allowance, and each paint with no colour to read, once. */
const hostFaults = (laid: ReadonlyArray<Laid>, allowed: Record<Role, ReadonlySet<string>>) => [
  ...new Set(
    laid.flatMap((l) =>
      l.colours.length === 0
        ? [`${l.kind}: no colour to read`]
        : l.colours.flatMap((c) =>
            allowed[roleOf(l)].has(c)
              ? []
              : [
                  `${roleOf(l)} ${shown(c)}: not a base, a derived colour, an ink line or the kit’s named shading in that role`,
                ],
          ),
    ),
  ),
];

/** The accused's host: the contact shadow under the rig (`riveAccused`), the same under every option. */
const accusedHost = (as: Mutation = (f) => f) => laidBy((f) => riveAccused(as(f)));

/** A black contact shadow laid where the kit's lies: a solid black-alpha ellipse's box under the feet. */
const blackGround: Mutation = (f) => {
  f.ctx.save();
  f.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  f.ctx.fillRect(-50, -6, 100, 12);
  f.ctx.restore();
  return f;
};

/** A cut piece casting a black shadow: an alpha-black layer, which CRAFT 12 forbids. */
const blackShadow: Mutation = (f) => {
  f.ctx.save();
  f.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  f.ctx.shadowBlur = 4;
  f.ctx.shadowOffsetY = 3;
  f.ctx.fillStyle = ramps.paper.base;
  f.ctx.beginPath();
  f.ctx.rect(-20, -40, 40, 30);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** A cut piece casting its shadow in `ink`, half clear: an ink may line a piece, never shade one. */
const inkShadow =
  (ink: string): Mutation =>
  (f) => {
    f.ctx.save();
    f.ctx.shadowColor = `${ink}80`;
    f.ctx.shadowBlur = 4;
    f.ctx.shadowOffsetY = 3;
    f.ctx.fillStyle = ramps.paper.base;
    f.ctx.beginPath();
    f.ctx.rect(-20, -40, 40, 30);
    f.ctx.fill();
    f.ctx.restore();
    return f;
  };

/** The kit's warm dark laid opaque, as a solid piece: it may shadow or wash, never be cut. */
const kitDarkPiece: Mutation = (f) => {
  f.ctx.save();
  f.ctx.fillStyle = 'rgba(40, 28, 16, 1)';
  f.ctx.beginPath();
  f.ctx.rect(-60, -6, 120, 16);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** A face cut in black, filled as the kit fills a pre-blended face: a pattern whose tile holds its one colour. */
const blackFace: Mutation = (f) => {
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext('2d');
  if (t !== null) {
    t.fillStyle = '#000000';
    t.fillRect(0, 0, 8, 8);
  }
  f.ctx.save();
  f.ctx.fillStyle = f.ctx.createPattern(tile, 'repeat') ?? '#000000';
  f.ctx.beginPath();
  f.ctx.rect(-20, -40, 40, 30);
  f.ctx.fill();
  f.ctx.restore();
  return f;
};

/** The centred line under each ink (A0, A0 + B2): the casts show, and B2's ink is black, so a black line is allowed and a black shading still is not. */
const CONTROLLED = [
  ['A0', A0],
  ['A0 + B2', { ...A0, ink: 'black' }],
] as const satisfies ReadonlyArray<readonly [string, Direction]>;

describe('what the host lays round the figures', () => {
  test('every paint is what laid it may be, in every option and pose: a line a paper, its shade, an ink or the kit’s core; a wash a paper, its shade or the kit’s shading; a shadow a shade or the kit’s warm dark', () => {
    const wrong = SHADED.flatMap(([name, d]) =>
      LEANS.flatMap((lean) =>
        SWINGS.flatMap((swing) =>
          hostFaults(
            laidBy((f) => judgeOf(d).over(f, swing, lean, propsOf(d))),
            hostColours(d, swing, lean),
          ).map((f) => `${name} lean ${lean} swing ${swing}: ${f}`),
        ),
      ),
    );
    const accused = hostFaults(accusedHost(), hostColours(K1, GAVEL_REST, 0)).map(
      (f) => `the accused: ${f}`,
    );
    expect([...new Set([...wrong, ...accused])]).toEqual([]);
  });

  test('the kit’s named shading is laid in each role it names, so the exception names nothing stale', () => {
    const laid = [
      ...accusedHost(),
      ...laidBy((f) => riveJudge.over(f, GAVEL_REST, 0, propsOf(DIRECTION))),
    ];
    const missing = [...KIT_SHADING].flatMap(([c, { as }]) =>
      as.flatMap((role) =>
        laid.some((l) => roleOf(l) === role && l.colours.includes(c)) ? [] : [`${c} as a ${role}`],
      ),
    );
    expect(missing).toEqual([]);
  });

  const controls: ReadonlyArray<
    readonly [string, (d: Direction) => ReadonlyArray<Laid>, (d: Direction) => string]
  > = [
    ['a black contact shadow', () => accusedHost(blackGround), () => '#000000'],
    ['a piece casting an alpha-black shadow', () => accusedHost(blackShadow), () => '#000000'],
    [
      'the hand’s cast black part way across',
      (d) => laidBy((f) => judgeOf(d).over(blackMiddleStop(f), GAVEL_REST, 0, propsOf(d))),
      () => '#000000',
    ],
    ['a piece casting its shadow in the ink', (d) => accusedHost(inkShadow(inkOf(d))), inkOf],
    ['the kit’s warm dark as a solid piece', () => accusedHost(kitDarkPiece), () => '#281c10'],
    ['a face cut in black', () => accusedHost(blackFace), () => '#000000'],
  ];
  test.each(
    CONTROLLED.flatMap(([name, d]) =>
      controls.map(([what, laid, wrong]) => [what, name, d, laid, wrong] as const),
    ),
  )('%s fails under %s', (_, __, d, laid, wrong) => {
    expect(hostFaults(laid(d), hostColours(d, GAVEL_REST, 0)).join('; ')).toContain(
      wrong(d).toLowerCase(),
    );
  });
});
