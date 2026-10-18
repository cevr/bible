// The landing, drawn to its Board (`court.back`, `court.beside`, `court.you`,
// `court.how`): the cold open's court in its layout and light, the same
// bench, the same places, the same framing (CRAFT rules 4 and 8). On `back`
// the accused stands in the dock in white, the stain gone; on `charge` the
// camera drifts to the prosecutor's table, empty, and no one comes. The
// verse is its full-screen card (`justifieth`); back from it Christ stands
// beside him in the dock, a gold seed in His hand for him. On `seed` the
// camera goes down to the crack at the dock's foot, where a green blade
// comes up; on `takes` it is close on the accused's face, his head up, the
// seed in his open hand. On `you` Christ turns to us and holds His hand out
// with the same seed. The three gifts light one by one in the picture (the
// seed in his hand, the robe on him, the blade at his feet); on `leaves`
// the dry fig leaves on the floor by the dock, then the seed again; on
// `how` the camera opens to the whole court and the bench glows warm across
// the floor to the dock, held through the breath after the last word. The
// words on screen are the verse's card alone (CRAFT rule 1).

import { type Box, drawing, fullCard, knobCamera, multiplane, shotPath } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, reachAbout } from '@bible/film/style';
import { CARD_STYLE } from '../card.ts';
import { HANDS, LANDING_RIGS, courtFigures, courtShadows, restPose } from '../court-cast.ts';
import { BLADE_AT, PLACE, REST, REST_POINT, backWall, benchWarm, floor } from '../court-set.ts';
import { LIGHT } from '../light.ts';
import { blade, figLeaf, glow } from '../props.ts';
import { JUDGE_KNOBS } from '../rigs/judge-rig.ts';

// ─── the faces ───────────────────────────────────────────────────────────────

/** In white, quiet, not yet sure: the brows a little up. */
const QUIET: Expression = { ...EASE, browTilt: 0.18, browY: -0.5, mouth: 0.2 };
/** No one comes: the brows lift, the start of a smile. */
const RELIEF: Expression = { ...EASE, browY: -1.6, browTilt: 0.2, eyes: 1.08, mouth: 0.8 };
/** Looking up at Christ beside him: open, smiling. */
const GLAD: Expression = { ...EASE, browY: -2, browTilt: 0.16, eyes: 1.1, mouth: 1.4 };
/** The seed in his open hand, his head up: wonder and joy. */
const JOY: Expression = {
  ...EASE,
  browY: -2.6,
  browTilt: 0.14,
  eyes: 1.18,
  eyeW: 1.05,
  mouth: 1.8,
};

/** Christ: kind, the brows easy, the smile court-12 draws in His beard. */
const KIND: Expression = { ...EASE, browY: -0.8, browTilt: 0.1, mouth: 3 };
/** Christ to us: the brows lifting as He offers, the smile a little wider. */
const OFFER: Expression = { ...EASE, browY: -1.8, browTilt: 0.16, eyes: 1.05, mouth: 3.6 };

/** The judge in the landing: kind, smiling down at the dock. */
const BENCH_KIND: Expression = { ...EASE, browY: -1, browTilt: 0.12, mouth: 1 };
/** In the bench's glow: the smile full. */
const BENCH_GLAD: Expression = { ...EASE, browY: -1.6, browTilt: 0.14, eyes: 1.05, mouth: 1.6 };

// ─── where things go ─────────────────────────────────────────────────────────

/** How far the lead stands off his `cold` place, Board pixels: left, to make room for Christ (`court.beside`). */
const LEAD_DX = -28;
/** The lead's feet in the landing. */
const LEAD_AT: Pt = [PLACE.lead[0] + LEAD_DX, PLACE.lead[1]];

/** Where the lead looks, from his feet: at us, the empty table, Christ, the blade, his seed, the leaves, the bench. */
const LEAD_GAZE = {
  us: [0, -300],
  table: [492, -125],
  christ: [177, -373],
  blade: [104, 120],
  seed: [72, -150],
  leaves: [-60, 160],
  bench: [1044, -529],
} as const satisfies Record<string, Pt>;

/** Where Christ looks, from His feet: at the lead, and at us (His eyes in their sockets). */
const CHRIST_GAZE = {
  lead: [-202, -315],
  us: [-21, -382],
} as const satisfies Record<string, Pt>;

/** The lead's hands on the dock's rail, moved with him. */
const LEAD_HANDS: readonly [Pt, Pt] = [
  [HANDS.lead[0][0] + LEAD_DX, HANDS.lead[0][1]],
  [HANDS.lead[1][0] + LEAD_DX, HANDS.lead[1][1]],
];
/** His near hand lifted open before him, the seed on it (`takes`), and his shoulder it swings from. */
const LEAD_OPEN: Pt = [338, 556];
const LEAD_SHOULDER: Pt = [318, 500];

/** Christ's near hand held out to the lead with the seed, and to us (`you`), and the shoulder it swings from. */
const CHRIST_OFFER: Pt = [384, 560];
const CHRIST_TO_US: Pt = [430, 478];
const CHRIST_SHOULDER: Pt = [420, 450];
/** How much bigger His hand reads held out toward us. */
const REACH = 1.6;

/** A seed sits on a hand this far above its centre. */
const ON_HAND = 17;

/** The dry fig leaves on the floor by the dock: each its place and turn. */
const LEAVES = [
  [150, 868, 0.15],
  [222, 884, -0.25],
  [262, 916, 0.35],
] as const;

/** The court's pose (scratch: rewritten each frame). */
const POSE = (() => {
  const p = restPose();
  p.prosecutor.shown = 0;
  p.stack = 0;
  p.laid = 0;
  p.lead.dx = LEAD_DX;
  p.lead.numbers.stain = 0;
  p.lead.numbers.robe = 1;
  return p;
})();

/** `a` to `b` by `k`, both points. */
const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export const court = drawing({
  timeline: {
    // From a little wider to the court's own framing, as the cold open began.
    settle: { mark: 'back', dur: 2.2, ease: 'inOutSine' },
    // To the prosecutor's table: empty, no one comes.
    toTable: { mark: 'charge', dur: 1.4, ease: 'inOutSine' },
    eyeTable: { mark: 'charge', offset: 0.1, dur: 0.5 },
    relief: { after: 'eyeTable', offset: 0.9, dur: 0.6 },
    // The verse's card, until Christ is beside him.
    verse: { mark: 'justifieth', until: 'beside', track: 'card' },
    // Under the card the camera is back on the court's framing; it creeps in on the dock.
    toBeside: { mark: 'beside', offset: -0.2, dur: 0.1 },
    onBeside: { after: 'toBeside', until: { cue: 'toCrack', edge: 'start' }, ease: 'linear' },
    lookUp: { mark: 'beside', offset: 0.3, dur: 0.6 },
    offer: { after: 'lookUp', offset: 0.5, dur: 0.9 },
    // Down to the crack at his feet, where the blade comes up.
    toCrack: { mark: 'seed', offset: -0.1, dur: 0.9, ease: 'inOutSine' },
    grow: { mark: 'seed', offset: 0.7, dur: 1.8, ease: 'outCubic' },
    // While the camera is down, the seed passes to his hand.
    given: { after: 'toCrack', offset: 0.4, dur: 0.1 },
    // Close on his face, his head up, the seed in his open hand.
    toFace: { mark: 'takes', offset: -0.15, dur: 0.8, ease: 'inOutSine' },
    onFace: { after: 'toFace', until: { cue: 'toYou', edge: 'start' }, ease: 'linear' },
    lift: { mark: 'takes', dur: 0.7, ease: 'outCubic' },
    joy: { mark: 'takes', offset: 0.2, dur: 0.6 },
    // Christ turns to us and holds His hand out with the same seed.
    toYou: { mark: 'you', offset: -0.2, dur: 0.9, ease: 'inOutSine' },
    onYou: { after: 'toYou', until: { cue: 'toThree', edge: 'start' }, ease: 'linear' },
    turn: { mark: 'you', dur: 0.5 },
    reach: { mark: 'you', offset: 0.3, dur: 0.8, ease: 'outBack' },
    // Back to the dock: the three gifts light one by one.
    toThree: { mark: 'faith', offset: -0.4, dur: 0.9, ease: 'inOutSine' },
    onThree: { after: 'toThree', until: { cue: 'toLeaves', edge: 'start' }, ease: 'linear' },
    withdraw: { mark: 'faith', offset: -0.4, dur: 0.8 },
    faith: { mark: 'faith', dur: 0.7 },
    forgiveness: { mark: 'forgiveness', dur: 0.7 },
    power: { mark: 'power', dur: 0.7 },
    // The fig leaves on the floor by the dock, then the seed again.
    toLeaves: { mark: 'leaves', offset: -0.2, dur: 1, ease: 'inOutSine' },
    stir: { mark: 'leaves', offset: 0.4, until: { cue: 'toSeed', edge: 'start' } },
    toSeed: { mark: 'leaves', word: 'seed', dur: 1, ease: 'inOutSine' },
    // The whole court, the bench glowing warm, held through the breath after the last word.
    toWide: { mark: 'how', offset: -0.6, dur: 1.8, ease: 'inOutSine' },
    hold: { after: 'toWide', until: { at: 'end' }, ease: 'linear' },
    shine: { mark: 'how', dur: 2.2, ease: 'inOutSine' },
  },
  knobs: {
    // Where the opening settle starts: a little wider than the court's framing.
    openZoom: 1.12,
    // On the empty table.
    table: [770, 560],
    tableZoom: 1.6,
    // Where the creep from the court's framing (`court.beside`) ends: in on the dock, Christ beside the accused.
    beside: [520, 540],
    besideZoom: 1.4,
    // Down on the crack at his feet, the blade at a third of the frame's height.
    crack: [400, 800],
    crackZoom: 3.2,
    // Close on his face, the seed in his hand below it.
    face: [320, 470],
    faceZoom: 2.5,
    // Christ to us (`court.you`): His face large, the accused at His side.
    you: [416, 458],
    youZoom: 3.3,
    // The accused whole, from his head to the blade at his feet.
    three: [330, 640],
    threeZoom: 1.9,
    // The leaves on the floor by the dock.
    leaves: [240, 830],
    leavesZoom: 2.6,
    // The seed in his hand again.
    seed: [330, 560],
    seedZoom: 2.3,
  },
  rigs: LANDING_RIGS,
  // The cold open's light: the court as its kept panels light it.
  light: LIGHT.room,
  draw: (f): Box | void => {
    const { ctx, w, h } = f;
    const p = POSE;

    // ── the camera: each leg on its mark, a slow creep between legs so nothing holds
    const shot = (point: 'beside' | 'face' | 'you' | 'three', zoom: number, creep = 1) =>
      knobCamera(f.knob(point), zoom * creep);
    const cam = shotPath({ ...REST, zoom: f.knob('openZoom') }, [
      [f.at('settle'), REST],
      [f.at('toTable'), knobCamera(f.knob('table'), f.knob('tableZoom'))],
      [f.at('toBeside'), REST],
      [f.at('onBeside'), shot('beside', f.knob('besideZoom'))],
      [f.at('toCrack'), knobCamera(f.knob('crack'), f.knob('crackZoom'))],
      [f.at('toFace'), shot('face', f.knob('faceZoom'))],
      [f.at('onFace'), shot('face', f.knob('faceZoom'), 1.05)],
      [f.at('toYou'), shot('you', f.knob('youZoom'))],
      [f.at('onYou'), shot('you', f.knob('youZoom'), 1.04)],
      [f.at('toThree'), shot('three', f.knob('threeZoom'))],
      [f.at('onThree'), shot('three', f.knob('threeZoom'), 1.05)],
      [f.at('toLeaves'), knobCamera(f.knob('leaves'), f.knob('leavesZoom'))],
      [f.at('toSeed'), knobCamera(f.knob('seed'), f.knob('seedZoom'))],
      [f.at('toWide'), REST],
      [f.at('hold'), { ...REST, zoom: (REST.zoom ?? 1) * 1.03 }],
    ]);

    // ── Christ, from `beside`: the seed held out to the lead, then to us
    const here = f.at('toBeside') > 0 ? 1 : 0;
    p.christ.shown = here;
    const offer = f.at('offer');
    const given = f.at('given') >= 1;
    const reach = f.at('reach') * (1 - f.at('withdraw'));
    const offered = offer * (given ? 1 - f.at('lift') : 1);
    let near = reachAbout(CHRIST_SHOULDER, HANDS.christ[0], CHRIST_OFFER, offered);
    near = toward(near, CHRIST_TO_US, Math.min(1, reach));
    p.christ.hands[0] = near;
    p.christ.reach = lerp(1, REACH, reach);
    const cs = p.christ.seed;
    cs.shown = here * (given ? Math.min(1, reach * 3) : offer > 0 ? 1 : 0);
    cs.x = near[0];
    cs.y = near[1] - ON_HAND * p.christ.reach;
    cs.scale = p.christ.reach;
    cs.rot = -0.2;
    const cn = p.christ.numbers;
    const turn = f.at('turn') * (1 - f.at('withdraw'));
    acted(cn, KIND, [[OFFER, turn]]);
    cn.gazeX = lerp(CHRIST_GAZE.lead[0], CHRIST_GAZE.us[0], turn);
    cn.gazeY = lerp(CHRIST_GAZE.lead[1], CHRIST_GAZE.us[1], turn);
    cn.tilt = -0.04 * (1 - turn) + 0.02 * Math.sin(f.t * 0.7);
    cn.lean = -0.03 * offer * (1 - turn);

    // ── the lead: in white; relief when no one comes, glad at Christ, the seed in his open hand
    const ln = p.lead.numbers;
    const lift = f.at('lift');
    acted(ln, QUIET, [
      [RELIEF, f.at('relief')],
      [GLAD, f.at('lookUp')],
      [JOY, f.at('joy')],
    ]);
    const look = (axis: 0 | 1) => {
      let g = lerp(LEAD_GAZE.us[axis], LEAD_GAZE.table[axis], f.at('eyeTable'));
      g = lerp(g, LEAD_GAZE.us[axis], f.at('relief'));
      g = lerp(g, LEAD_GAZE.christ[axis], f.at('lookUp'));
      g = lerp(g, LEAD_GAZE.blade[axis], f.at('toCrack'));
      g = lerp(g, LEAD_GAZE.seed[axis], lift);
      g = lerp(g, LEAD_GAZE.us[axis], f.at('joy'));
      g = lerp(g, LEAD_GAZE.christ[axis], f.at('turn'));
      g = lerp(g, LEAD_GAZE.seed[axis], f.at('faith') * (1 - f.at('forgiveness')));
      g = lerp(g, LEAD_GAZE.blade[axis], f.at('power') * (1 - f.at('toLeaves')));
      g = lerp(g, LEAD_GAZE.leaves[axis], f.at('toLeaves'));
      g = lerp(g, LEAD_GAZE.seed[axis], f.at('toSeed'));
      return lerp(g, LEAD_GAZE.bench[axis], f.at('shine'));
    };
    ln.gazeX = look(0);
    ln.gazeY = look(1);
    // His head up as he takes it.
    ln.nod = 4 * f.at('toCrack') * (1 - lift) - 6 * f.at('joy');
    ln.tilt = 0.05 * f.at('lookUp') * (1 - lift);
    const open = reachAbout(LEAD_SHOULDER, LEAD_HANDS[1], LEAD_OPEN, lift);
    p.lead.hands[0] = LEAD_HANDS[0];
    p.lead.hands[1] = open;
    const ls = p.lead.seed;
    ls.shown = given ? 1 : 0;
    ls.x = open[0];
    ls.y = open[1] - ON_HAND;
    ls.rot = 0.15;

    // ── the judge: kind, his smile full in the bench's glow
    const jn = p.judge.numbers;
    const shine = f.at('shine');
    acted(jn, BENCH_KIND, [[BENCH_GLAD, shine]]);
    jn.gazeX = JUDGE_KNOBS.gazeX;
    jn.gazeY = JUDGE_KNOBS.gazeY;
    jn.lean = -0.04 * shine;
    p.judge.glow = shine;

    // ── the frame
    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        { z: 1.12, draw: () => backWall(ctx) },
        {
          z: 1,
          draw: () => {
            floor(ctx);
            courtShadows(ctx);
            benchWarm(ctx, shine);
            courtFigures(f, p);
            if (here > 0)
              for (const [x, y, rot] of LEAVES)
                figLeaf(ctx, x, y, rot + 0.12 * f.at('stir') * Math.sin(f.t * 5 + x));
            blade(ctx, BLADE_AT[0], BLADE_AT[1], f.at('grow'), 0.04 * Math.sin(f.t * 1.3));
            // The gifts light as they are named, and stay a little lit.
            const kept = (cue: 'faith' | 'forgiveness' | 'power') => {
              const k = f.at(cue);
              return k * (0.45 + 0.55 * Math.sin(Math.PI * k));
            };
            glow(ctx, ls.x, ls.y, 70, '#ffd76a', kept('faith'));
            glow(ctx, LEAD_AT[0], LEAD_AT[1] - 150, 190, '#fff4d6', 0.7 * kept('forgiveness'));
            glow(ctx, BLADE_AT[0], BLADE_AT[1] - 16, 80, '#e2f5a8', kept('power'));
          },
        },
      ],
      { rest: REST_POINT },
    );
  },
  cards: [
    {
      cue: 'verse',
      from: 'justifieth',
      to: 'beside',
      payoff: 'justifieth',
      draw: (f, words) => fullCard(f, words, CARD_STYLE),
    },
  ],
});
