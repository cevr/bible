// The cold open, drawn to its Board (`cold.evidence`, `cold.did`,
// `cold.cover`, try 3 each): the v3 court in the house look, lit as the
// panels light it, the plain lead in the dock with the scarlet stain, the
// prosecutor at his table, the judge at his bench, each a Rive rig
// (`court-cast.ts`). One continuous camera travel over the court, every leg
// pinned to a mark, no cut but the cards' (IDEA register, CRAFT rule 5): on
// `evidence` the prosecutor lifts each sheet at the lead before he lays it
// on the stack, the camera drifting in; on `did` it pushes to the lead's face
// as his head drops; on `judge` it travels to the bench as the judge leans
// over and takes up the gavel; it falls on `righteous`, the hard cut to the
// card "Righteous." (`verdict`); back on `seal`, close on the lead, the gold
// wax seal floats down over the stain; on `cover` it opens to the lead and
// the prosecutor as he throws up his hands and shouts; from `bible` one slow
// push onto the seal, which glints on "justifies"; on `which` it pulls back
// to the gavel hanging above its block, then in on the lead's doubt; on
// `asked` Job 9:2 turns in on its page out of the court's light, its phrase
// highlighted as it is said, and on `job` the highlight floods out into the
// card (`job`). The words on screen are the two cards and the verse alone
// (CRAFT rule 1).

import {
  type Box,
  at,
  drawing,
  fullCard,
  knobCamera,
  multiplane,
  pushInto,
  rounded,
  shotPath,
  verse,
  write,
} from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, reachAbout } from '@bible/film/style';
import { CARD_STYLE, VERSE_STYLE } from '../card.ts';
import { LIGHT } from '../light.ts';
import {
  COURT_RIGS,
  GAVEL_REST,
  HANDS,
  courtFigures,
  courtShadows,
  restPose,
  stainAt,
} from '../court-cast.ts';
import { BLOCK, REST, REST_POINT, STACK, backWall, floor } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { JUDGE_KNOBS } from '../rigs/judge-rig.ts';
import { LEAD_KNOBS } from '../rigs/lead-rig.ts';
import { PROSECUTOR_KNOBS } from '../rigs/prosecutor-rig.ts';

// ─── the faces ───────────────────────────────────────────────────────────────

/** The lead watching the evidence pile up: the inner brows up, the mouth's corners down. */
const WORRY: Expression = { ...EASE, browTilt: 0.3, browY: -1, mouth: -0.9 };
/** "He did it": brows low and worried, lids heavy, the mouth turned down. */
const SHAME: Expression = { ...EASE, browY: 2.5, browTilt: 0.3, eyes: 0.6, mouth: -1.6 };
/** The judge leans over: eyes up and wide, the brows' inner ends high. */
const FEAR: Expression = {
  ...EASE,
  browY: -2.5,
  browTilt: 0.36,
  eyes: 1.2,
  eyeW: 0.92,
  mouth: -1.3,
};
/** The seal comes down on him: eyes round, brows high and level, an "oh". */
const AMAZED: Expression = {
  ...EASE,
  browY: -3,
  browTilt: 0.06,
  eyes: 1.45,
  eyeW: 1.2,
  mouthLine: 0,
  mouthOpen: 0.75,
};
/** Looking at the seal on him: puzzled, a little hopeful. */
const PUZZLED: Expression = { ...EASE, browY: -1.2, browTilt: 0.3, eyes: 1.05, mouth: -0.3 };
/** "He justifies the ungodly": he looks up at us, the brows lifting, the start of a smile. */
const WONDER: Expression = { ...EASE, browY: -2, browTilt: 0.22, eyes: 1.12, mouth: 0.7 };

/** The prosecutor at his work: stern (his rig's rest). */
const STERN: Expression = {
  browY: PROSECUTOR_KNOBS.browY,
  browTilt: PROSECUTOR_KNOBS.browTilt,
  eyes: PROSECUTOR_KNOBS.eyes,
  eyeW: PROSECUTOR_KNOBS.eyeW,
  mouth: PROSECUTOR_KNOBS.mouth,
  mouthLine: 1,
  mouthOpen: 0,
};
/** Making his case at the lead: the brows knit low, the mouth hard (face-study, Kit A's anger). */
const ACCUSE: Expression = { ...STERN, browY: 2.8, browTilt: -0.35, mouth: -1.5 };
/** "That's not justice": brows knit hard, eyes wide; the mouth is his rig's shout (`shout`). */
const OUTRAGE: Expression = {
  ...EASE,
  browY: 0.5,
  browTilt: -0.34,
  eyes: 1.15,
  mouthLine: 0,
  mouthOpen: 0,
};

/** The judge at rest: stern (his rig's rest). */
const BENCH_FACE: Expression = {
  browY: JUDGE_KNOBS.browY,
  browTilt: JUDGE_KNOBS.browTilt,
  eyes: JUDGE_KNOBS.eyes,
  eyeW: JUDGE_KNOBS.eyeW,
  mouth: JUDGE_KNOBS.mouth,
  mouthLine: 1,
  mouthOpen: 0,
};
/** He gives the verdict and keeps it through the uproar: grave and sure, the brows easing. */
const VERDICT_FACE: Expression = { ...EASE, browY: 0.5, browTilt: 0, eyes: 1.05, mouth: -0.2 };

// ─── where things go ─────────────────────────────────────────────────────────

/** Where the lead looks, from his feet: at us, at the stack, down at his chest, at the judge. */
const LEAD_GAZE = {
  us: [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY],
  stack: [STACK[0] - 293, STACK[1] - 725 - 60],
  chest: [-10, -150],
  judge: [1300 - 293, 200 - 725],
} as const;

/**
 * The prosecutor's near shoulder, from which his hand swings; where it takes
 * up each sheet (his far side); and where he holds it up at the lead before
 * he lays it on the stack.
 */
const PROS_SHOULDER = [700, 340] as const;
const PROS_PICK = [816, 520] as const;
const PROS_RAISE = [606, 438] as const;
/** His hands thrown up on `cover`. */
const PROS_UP = [
  [612, 352],
  [858, 372],
] as const;

/** The judge's near shoulder, and the gavel raised, struck on its block, and hanging on `which`. */
const JUDGE_SHOULDER = [1215, 300] as const;
const GAVEL_UP = { grip: [1168, 292], rot: Math.PI / 2 + 0.1 } as const;
const GAVEL_STRUCK = { grip: [BLOCK[0] + 66, BLOCK[1] - 14], rot: -0.2 } as const;
/** Held still in the air, its head a hand's breadth above the block. */
const GAVEL_HANGS = { grip: [1140, 296], rot: -0.12 } as const;

/** Where the seal starts, above the frame, before it floats down. */
const SEAL_FROM = { dx: -40, dy: -420, rot: -0.6 } as const;

/** Job 9:2 on its page (`cold.asked`), the phrase the card floods from. */
const VERSE = {
  ref: 'Job 9:2',
  text: 'I know it is so of a truth: but how should man be just with God?',
  phrase: 'how should man be just with God?',
} as const;
/** The page Job's verse is set on, frame px: the whole frame and a margin, and where its text starts. */
const PAGE = { w: 2000, h: 1160, text: { x: 370, y: 540 } } as const;

/** A sheet's swing, as shares of its stagger: picked up, lifted at the lead, held there, laid on the stack. */
const SWING = { pick: 0.15, up: 0.35, hold: 0.5, laid: 0.62 } as const;

/** How far `k` is through `from..to`, held to 0..1. */
const share = (k: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (k - from) / (to - from)));

/** Of the sheets' swings `ks`: how many are laid on the stack, and the share of the one in hand (0: none). */
const swingOf = (ks: ReadonlyArray<number>) => ({
  laid: ks.filter((k) => k >= SWING.laid).length,
  swing: ks.find((k) => k > 0 && k < 1) ?? 0,
});

/** The prosecutor's near hand `swing` through a sheet: to it, up at the lead, held, down on the stack, home. */
const swingHand = (swing: number): Pt => {
  const rest = HANDS.prosecutor[0];
  const onStack: Pt = [STACK[0] + 8, STACK[1] - 30];
  if (swing <= 0) return rest;
  if (swing < SWING.pick)
    return reachAbout(PROS_SHOULDER, rest, PROS_PICK, share(swing, 0, SWING.pick));
  if (swing < SWING.up)
    return reachAbout(PROS_SHOULDER, PROS_PICK, PROS_RAISE, share(swing, SWING.pick, SWING.up));
  if (swing < SWING.hold) return PROS_RAISE;
  if (swing < SWING.laid)
    return reachAbout(PROS_SHOULDER, PROS_RAISE, onStack, share(swing, SWING.hold, SWING.laid));
  return reachAbout(PROS_SHOULDER, onStack, rest, share(swing, SWING.laid, 1));
};

/** The sheets on the stack before the prosecutor lays his three. */
const STACK_BEFORE = 6;
const STACK_LAID = 3;

/** The court's pose (scratch: rewritten each frame). */
const POSE = restPose();

export const cold = drawing({
  timeline: {
    // The camera travels in from a little wider to the evidence panel's framing.
    settle: { mark: 'evidence', ends: true, dur: 3.6, ease: 'inOutSine' },
    // ...and drifts on in toward the dock and the table while the evidence is laid.
    drift: { mark: 'evidence', until: { cue: 'push', edge: 'start' }, ease: 'linear' },
    // The prosecutor lifts each of three sheets at the lead, then lays it on the stack.
    lay: { mark: 'evidence', dur: 3.1, stagger: 0.667, ease: 'inOutSine' },
    accuse: { mark: 'evidence', dur: 0.5 },
    watch: { mark: 'evidence', offset: 0.2, dur: 0.6 },
    bow: { mark: 'did', dur: 0.45, ease: 'outCubic' },
    push: { mark: 'did', offset: -0.2, dur: 0.75 },
    sink: { after: 'push', until: { cue: 'toJudge', edge: 'start' }, ease: 'linear' },
    // To the bench as the judge leans over it, and on in while he raises the gavel.
    toJudge: { mark: 'judge', offset: -0.05, dur: 0.6, ease: 'inOutSine' },
    onJudge: { after: 'toJudge', until: 'righteous', ease: 'linear' },
    lean: { mark: 'judge', dur: 0.55 },
    dread: { mark: 'judge', offset: 0.25, dur: 0.4 },
    reach: { mark: 'judge', offset: 0.35, dur: 0.55 },
    raise: { after: 'reach', dur: 0.7, ease: 'outCubic' },
    strike: { mark: 'righteous', ends: true, dur: 0.2, ease: 'inCubic' },
    // The card: the picture is gone from "Righteous." to the question.
    verdict: { mark: 'righteous', until: { cue: 'float', edge: 'start' }, track: 'card' },
    // Under the card the camera is taken to the lead, so the picture comes back close on him.
    toLead: { mark: 'seal', offset: -0.2, dur: 0.1 },
    onLead: { mark: 'seal', until: { cue: 'toTwo', edge: 'start' }, ease: 'linear' },
    float: { mark: 'seal', dur: 1.1, ease: 'outCubic' },
    press: { after: 'float', dur: 0.22, ease: 'outBack' },
    amaze: { mark: 'seal', offset: 0.3, dur: 0.5 },
    // Open to the lead and the prosecutor as he throws up his hands.
    toTwo: { mark: 'cover', dur: 0.7, ease: 'inOutSine' },
    onTwo: { after: 'toTwo', until: 'bible', ease: 'linear' },
    throw: { mark: 'cover', dur: 0.32, ease: 'outBack' },
    startle: { mark: 'cover', offset: 0.08, dur: 0.4, ease: 'outCubic' },
    calm: { mark: 'cover', offset: 0.6, dur: 0.8 },
    drop: { after: 'calm', offset: 0.8, dur: 0.9 },
    // One slow push from the two of them onto the seal over the stain.
    closer: { mark: 'bible', until: 'which', ease: 'inOutSine' },
    ponder: { mark: 'bible', offset: 0.3, dur: 0.6 },
    // "will not clear the guilty": he winces at it.
    wince: { mark: 'bible', word: 'guilty', dur: 0.4 },
    glint: { mark: 'bible', word: 'justifies', dur: 0.9, ease: 'inOutSine' },
    wonder: { mark: 'bible', word: 'justifies', offset: 0.1, dur: 0.6 },
    // Back to the court and the gavel hanging, then in on the lead under the question.
    out: { mark: 'which', dur: 1.1 },
    hang: { mark: 'which', offset: 0.2, dur: 0.9, ease: 'outCubic' },
    ask: { after: 'out', until: { cue: 'page', edge: 'start' }, ease: 'inOutSine' },
    doubt: { mark: 'which', word: 'guilty', dur: 0.5 },
    page: { mark: 'asked', dur: 0.45, ease: 'outCubic', track: 'verse' },
    sweep: { mark: 'asked', offset: 0.5, until: { cue: 'flood', edge: 'start' }, track: 'verse' },
    flood: { mark: 'job', dur: 0.45, ends: true, track: 'verse' },
    card: { mark: 'job', until: { at: 'end' }, track: 'card' },
  },
  knobs: {
    // Where the opening travel starts: a little wider than the evidence panel.
    openZoom: 1.12,
    // Where the drift over the evidence ends: in toward the dock and the table.
    drift: [600, 488],
    driftZoom: 1.4,
    // Close on the lead's face (`cold.did`): his face at a third of the frame.
    face: [340, 500],
    faceZoom: 2.67,
    // A medium on the bench: the judge's head at about a third of the frame.
    judge: [1236, 318],
    judgeZoom: 2,
    // Back from the card, close on the lead, room above him for the seal to come down.
    lead: [318, 470],
    leadZoom: 1.6,
    // On `cover`: the dock, the table and the bench with the judge, as the kept cover panel frames them.
    two: [800, 440],
    twoZoom: 1.3,
    // In on the seal over his stain (`bible`), his head's top clear of the frame's.
    seal: [292, 505],
    sealZoom: 2.8,
    // In on the lead under the question.
    doubt: [330, 480],
    doubtZoom: 1.4,
  },
  rigs: COURT_RIGS,
  // The court's light, lifted off Job's page as it turns over the court.
  light: (f) => ({
    ...LIGHT.room,
    amount: 1 - f.at('page'),
    vignette: (LIGHT.room.vignette ?? 1) * (1 - f.at('page')),
  }),
  draw: (f): Box | void => {
    const { ctx, w, h } = f;
    const p = POSE;

    // ── the camera: one travel, each leg on its mark, a slow creep between legs so nothing holds
    const shot = (point: 'face' | 'judge' | 'lead' | 'two', zoom: number, creep = 1) =>
      knobCamera(f.knob(point), zoom * creep);
    const cam = shotPath({ ...REST, zoom: f.knob('openZoom') }, [
      [f.at('settle'), REST],
      [f.at('drift'), knobCamera(f.knob('drift'), f.knob('driftZoom'))],
      [f.at('push'), shot('face', f.knob('faceZoom')), pushInto],
      [f.at('sink'), shot('face', f.knob('faceZoom'), 1.06)],
      [f.at('toJudge'), shot('judge', f.knob('judgeZoom'))],
      [f.at('onJudge'), shot('judge', f.knob('judgeZoom'), 1.08)],
      [f.at('toLead'), shot('lead', f.knob('leadZoom'))],
      [f.at('onLead'), shot('lead', f.knob('leadZoom'), 1.08)],
      [f.at('toTwo'), shot('two', f.knob('twoZoom'))],
      [f.at('onTwo'), shot('two', f.knob('twoZoom'), 1.07)],
      [f.at('closer'), knobCamera(f.knob('seal'), f.knob('sealZoom')), pushInto],
      [f.at('out'), REST],
      [f.at('ask'), knobCamera(f.knob('doubt'), f.knob('doubtZoom'))],
    ]);

    // ── the prosecutor: three sheets held up at the lead and laid on the stack; on `cover` he
    // throws up his hands and shouts
    const thrown = f.at('throw') * (1 - f.at('drop'));
    const { laid, swing } = swingOf(
      Array.from({ length: STACK_LAID }, (_, i) => f.stagger('lay', i, STACK_LAID)),
    );
    const near = swingHand(swing);
    // Held up at the lead, the sheet shakes in his hand.
    const shake = swing >= SWING.up && swing < SWING.hold ? 4 * Math.sin(f.t * 19) : 0;
    p.prosecutor.hands[0] = [
      lerp(near[0], PROS_UP[0][0], thrown),
      lerp(near[1] + shake, PROS_UP[0][1], thrown),
    ];
    const far = HANDS.prosecutor[1];
    p.prosecutor.hands[1] = [
      lerp(far[0], PROS_UP[1][0], thrown),
      lerp(far[1], PROS_UP[1][1], thrown),
    ];
    const c = p.prosecutor.carried;
    c.shown = swing >= SWING.pick && swing < SWING.laid ? 1 : 0;
    c.x = near[0] - 6;
    c.y = near[1] + shake + 26;
    c.rot =
      swing < SWING.hold
        ? -0.35 * share(swing, SWING.pick, SWING.up)
        : -0.35 * (1 - share(swing, SWING.hold, SWING.laid));
    p.stack = STACK_BEFORE + laid;
    const pn = p.prosecutor.numbers;
    const accuse = f.at('accuse') * (1 - f.at('lean'));
    acted(pn, STERN, [
      [ACCUSE, accuse],
      [OUTRAGE, thrown],
    ]);
    pn.shout = thrown;
    // His eyes on the lead while he makes his case; to the judge on the verdict, and on the judge
    // still as he throws up his hands (cold.cover). Each frame starts from his rest gaze.
    pn.gazeX = lerp(PROSECUTOR_KNOBS.gazeX, 560, f.at('lean'));
    pn.gazeY = lerp(PROSECUTOR_KNOBS.gazeY, -560, f.at('lean'));
    pn.lean = -0.05 * accuse - 0.04 * thrown;
    pn.tilt = -0.05 * accuse + 0.06 * thrown;
    pn.nod = 2 * accuse * (1 - thrown);

    // ── the judge: leans over, takes up the gavel, strikes; it hangs on `which`
    const lean = f.at('lean');
    const reach = f.at('reach');
    const raise = f.at('raise');
    const strike = f.at('strike');
    const hang = f.at('hang');
    const restGrip = GAVEL_REST.grip;
    const grip: [number, number] = [
      lerp(
        lerp(lerp(restGrip[0], GAVEL_UP.grip[0], raise), GAVEL_STRUCK.grip[0], strike),
        GAVEL_HANGS.grip[0],
        hang,
      ),
      lerp(
        lerp(lerp(restGrip[1], GAVEL_UP.grip[1], raise), GAVEL_STRUCK.grip[1], strike),
        GAVEL_HANGS.grip[1],
        hang,
      ),
    ];
    // It hangs still but for a slow sway.
    const sway = hang * 0.05 * Math.sin(f.t * 1.7);
    p.judge.grip[0] = grip[0];
    p.judge.grip[1] = grip[1];
    p.judge.rot =
      lerp(
        lerp(lerp(GAVEL_REST.rot, GAVEL_UP.rot, raise), GAVEL_STRUCK.rot, strike),
        GAVEL_HANGS.rot,
        hang,
      ) + sway;
    const hand0 = HANDS.judge[0];
    const toGrip = reachAbout(JUDGE_SHOULDER, hand0, restGrip, reach);
    // Once it is in his hand, his hand goes where the grip goes.
    const holding = reach >= 1;
    p.judge.hands[0] = holding ? [grip[0], grip[1]] : toGrip;
    const jn = p.judge.numbers;
    acted(jn, BENCH_FACE, [[VERDICT_FACE, lean]]);
    jn.lean = -0.13 * lean * (1 - 0.6 * f.at('calm'));
    jn.nod = 8 * lean * (1 - f.at('calm'));
    jn.gazeX = lerp(-900, -560, lean);
    jn.gazeY = lerp(160, 420, lean);
    // To the prosecutor as he protests, back to the dock.
    jn.gazeX = lerp(jn.gazeX, -540, f.at('throw') * (1 - f.at('closer')));
    jn.gazeY = lerp(jn.gazeY, 300, f.at('throw') * (1 - f.at('closer')));

    // ── the lead
    const ln = p.lead.numbers;
    const bow = f.at('bow') * (1 - f.at('dread'));
    const startle = f.at('startle');
    acted(ln, EASE, [
      [WORRY, f.at('watch')],
      [SHAME, f.at('bow')],
      [FEAR, f.at('dread')],
      [AMAZED, f.at('amaze')],
      [AMAZED, startle],
      [PUZZLED, f.at('ponder')],
      [SHAME, 0.7 * f.at('wince')],
      [WONDER, f.at('wonder')],
      [PUZZLED, f.at('doubt')],
    ]);
    const look = (axis: 0 | 1) => {
      let g = lerp(LEAD_GAZE.us[axis], LEAD_GAZE.stack[axis], f.at('watch'));
      g = lerp(g, LEAD_GAZE.chest[axis], f.at('bow'));
      g = lerp(g, LEAD_GAZE.judge[axis], f.at('dread'));
      g = lerp(g, LEAD_GAZE.chest[axis], f.at('amaze'));
      g = lerp(g, [-300, -520][axis] ?? 0, startle);
      g = lerp(g, LEAD_GAZE.chest[axis], f.at('ponder'));
      g = lerp(g, LEAD_GAZE.us[axis], f.at('wonder'));
      g = lerp(g, LEAD_GAZE.chest[axis], f.at('doubt'));
      return lerp(g, LEAD_GAZE.judge[axis], f.at('out') * (1 - f.at('doubt')));
    };
    ln.gazeX = look(0);
    ln.gazeY = look(1);
    ln.nod =
      26 * bow +
      6 * f.at('amaze') * (1 - startle) -
      8 * startle * (1 - f.at('ponder')) +
      6 * f.at('ponder') * (1 - f.at('wonder'));
    // Bowed, he looks down at the floor before him.
    ln.gazeY += 280 * bow;
    ln.tilt = 0.06 * bow - 0.1 * startle * (1 - f.at('ponder'));
    ln.lean = -0.03 * startle * (1 - f.at('ponder'));
    // The seal floats down and presses over the stain.
    const s = p.lead.seal;
    const [sx, sy] = stainAt(ln.lean);
    const fl = f.at('float');
    s.shown = fl > 0 ? 1 : 0;
    s.x = sx + SEAL_FROM.dx * (1 - fl) + 10 * Math.sin(fl * Math.PI * 2) * (1 - fl);
    s.y = sy + SEAL_FROM.dy * (1 - fl);
    s.rot = SEAL_FROM.rot * (1 - fl) + 0.15 * Math.sin(fl * Math.PI * 1.5) * (1 - fl);
    s.scale = lerp(1.25, 1, fl) * (1 + 0.1 * Math.sin(Math.PI * f.at('press')));
    s.glint = f.at('glint');

    // ── the frame: the court, until Job's page has turned over it
    const turn = f.at('page');
    if (turn < 1)
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
              courtFigures(f, p);
            },
          },
        ],
        { rest: REST_POINT },
      );

    // ── Job's verse: on `asked` a new page turns over the court from the right, then the verse
    // is set on it, its phrase highlighted as it is said
    if (turn <= 0) return;
    at(ctx, { x: lerp(PAGE.w + 40, 0, turn), y: 0, rot: lerp(0.05, 0, turn) }, () =>
      piece(ctx, rounded(w / 2, h / 2, PAGE.w, PAGE.h, 0), C.cream, f.hand('page'), {
        role: 'scenery',
        kind: 'torn',
        torn: 4,
        shadow: 0,
      }),
    );
    if (turn < 1) return;
    const left = PAGE.text.x;
    write(
      ctx,
      VERSE.ref,
      left,
      PAGE.text.y - 110,
      { family: F.body, size: 34, weight: 600, color: C.inkSoft, tracking: 0.08 },
      f.hand('ref'),
      { boil: 0 },
    );
    const box = verse(
      ctx,
      VERSE,
      VERSE_STYLE,
      { x: left, y: PAGE.text.y, highlight: f.at('sweep') },
      f.hand('verse'),
    );
    return box;
  },
  cards: [
    {
      cue: 'verdict',
      from: 'righteous',
      to: 'seal',
      payoff: 'Righteous',
      draw: (f, words) => fullCard(f, words, CARD_STYLE),
    },
    {
      cue: 'card',
      from: 'job',
      payoff: 'just',
      flood: { cue: 'flood' },
      draw: (f, words) => fullCard(f, words, CARD_STYLE),
    },
  ],
});
