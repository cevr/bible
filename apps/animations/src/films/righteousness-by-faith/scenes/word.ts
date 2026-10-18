// The word, drawn to its Board (`word.all`, `word.short`, `word.fig`, try 4
// each): a page turns over `title`'s court from the right, as `cold` turns
// Job's page, and on it the accused stands alone in the warm peach light,
// the gold wax seal still pressed over his stain, its R and ribbon tail
// showing; on the act's question his brows go up. On `right` a straight gold
// line draws itself along the page under his feet; on `measure` it rises and
// folds into two small stone tablets, standing upright, and on `all` their
// ten lines light gold one by one as he leans in, his face at a third of the
// frame. On `short` the tablets grow as tall as a doorway and he, beside
// them, comes up short, his head well under their top. On `cover` they
// settle back and he presses a hand over the stain; on `fig` fig leaves drift
// down and he pins them over it one by one, a patchwork round the gold seal,
// the blot's edge showing between them. On `going` the leaves curl and drop
// off, and he gives us a look. The narration is on no card here and in no
// letter of the picture (CRAFT rule 1): the one letter on the page is the R in
// the seal's wax; title's name, on its wall, goes under the page in the
// turn's first half second.

import {
  type Hand,
  type Hex,
  type Light,
  type TextStyle,
  at,
  camera,
  drawing,
  knobCamera,
  mix,
  pushInto,
  pushOn,
  rounded,
  shotPath,
  write,
} from '@bible/film/canvas';
import { type Key, lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, boilTime, reachAbout } from '@bible/film/style';
import {
  COURT_RIGS,
  type CourtFrame,
  type CourtPose,
  type SealPose,
  courtFigures,
  courtShadows,
  living,
  restPose,
  seal,
} from '../court-cast.ts';
import { contact, widePews, wideRoom } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { LIGHT } from '../light.ts';
import {
  PAGE,
  TABLET,
  type TabletsPose,
  cast,
  goldLine,
  leaf,
  shafts,
  standingTablets,
  tabletEdgeAt,
  tabletsAt,
} from '../page-set.ts';
import { LIFT } from '../palette.ts';
import { LEAD, LEAD_KNOBS } from '../rigs/lead-rig.ts';
import { TITLE } from '../script.ts';
import { title } from './title.ts';

// ─── title's last frame, under the turning page ──────────────────────────────

/** How far each group stands off its `cold` place in title's wide, Board pixels. */
interface Spread {
  readonly lead: Pt;
  readonly prosecutor: Pt;
  readonly judge: Pt;
}

/** The cast in title's wide: where the Board's pixels sit on its floor, at what size, spread how. */
interface Wide {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly spread: Spread;
}

/** The film's name on its strip: the strip's centre and size, frame px, and its type. */
interface Strip {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly style: TextStyle;
}

// title's last frame, as title.ts stages it: its `CAST`, `NAME` and `POSE`,
// which it keeps to itself, so these are its numbers. The page turns over
// this frame, so the cut from `title` is not seen.
const TITLE_CAST: Wide = {
  x: 425,
  y: 315,
  scale: 0.6,
  spread: { lead: [0, 0], prosecutor: [98, 27], judge: [258, 60] },
};
const TITLE_NAME: Strip = {
  x: 990,
  y: 200,
  w: 1000,
  h: 140,
  style: { family: F.display, size: 82, weight: 700, color: C.cream, align: 'center' },
};
const TITLE_POSE: CourtPose = (() => {
  const p = restPose();
  p.stack = 1;
  Object.assign(p.lead.numbers, { gazeX: 520, browTilt: 0.3, browY: -1, mouth: -0.6 });
  Object.assign(p.prosecutor.numbers, {
    gazeX: -520,
    browY: 0.6,
    browTilt: -0.34,
    eyes: 1.1,
    mouthLine: 0,
    mouthOpen: 0,
    shout: 0.75,
    lean: -0.05,
    tilt: -0.05,
  });
  p.prosecutor.hands[0] = [598, 430];
  Object.assign(p.judge.numbers, { browY: 1.6, browTilt: -0.3, mouth: -1 });
  return p;
})();
/** title's light: the court's, with a little of the film's vignette. */
const TITLE_LIGHT: Light = { ...LIGHT.room, vignette: 0.1 };

/**
 * title's court as its last frame draws it, in the frame's pixels: pulled
 * back to its panel's framing, the film's name settled on its strip, the
 * strip torn as title tore it (`hands`, title's own).
 */
const titleCourt = (f: CourtFrame, w: number, h: number, hands: (key: string) => Hand) => {
  const { ctx } = f;
  const n = TITLE_NAME;
  ctx.save();
  ctx.translate(w / 2, h * 0.55);
  ctx.scale(w / 1920, w / 1920);
  ctx.translate(-960, -594);
  wideRoom(ctx);
  at(ctx, { x: TITLE_CAST.x, y: TITLE_CAST.y, scale: TITLE_CAST.scale }, () => {
    courtShadows(ctx, TITLE_CAST.spread);
    courtFigures(f, TITLE_POSE, TITLE_CAST.spread);
  });
  widePews(ctx);
  piece(ctx, rounded(n.x, n.y, n.w, n.h, 0), C.ink, hands('strip'), {
    role: 'scenery',
    kind: 'torn',
    torn: 5,
    shadow: 0.3,
    alpha: 1,
  });
  write(ctx, TITLE, n.x, n.y + 28, n.style, hands('title'), { alpha: 1, boil: 0 });
  ctx.restore();
};

// ─── the page ────────────────────────────────────────────────────────────────

/** A sheet's size, frame px. */
interface Sheet {
  readonly w: number;
  readonly h: number;
}
/** The page that turns over the court: the whole frame and a margin, as cold's page for Job's verse. */
const SHEET: Sheet = { w: 2000, h: 1160 };

/** A light of `color` falling to `edge` at the corners, both raised by the ground's lift, as light.ts's `lit` raises the acts' lights. */
const raisedLight = (color: Hex, edge: Hex): Light => {
  const raised = mix(color, '#ffffff', LIFT / 2);
  return { color: raised, edge: mix(edge, raised, LIFT) };
};

/**
 * The page's own light, not its act's: the kept panels (word.all,
 * word.short, word.fig) lay a warm peach afternoon on the page, the sun at
 * the upper left, where the seed act's hazed noon (`LIGHT.haze`) is a cool
 * blue-grey that would grey the Board's peach. The peach is the page's paper
 * (`PAGE`); the light over it is a warm white, so the lead keeps his lilac
 * as the panels keep it, its corners falling to a faint rose, with a little
 * of the film's vignette.
 */
const PEACH: Light = { ...raisedLight('#fffaf4', '#f9ecec'), vignette: 0.1 };

// ─── the lead on the page ────────────────────────────────────────────────────

/** Where he stands on the page, his feet, in the Board's pixels at his own size (word.all's, scaled to him). */
const LEAD_AT: Pt = [500, 820];

/** His hands' size against the hand rig's: court-cast's for him (0.34 of his head across), which it keeps to itself. */
const HAND_SCALE = 1.08;

/** A pair of places on him, from his feet: on his far side (the page's left) and his near side. */
interface Sides {
  readonly far: Pt;
  readonly near: Pt;
}
/** Where his hands float at rest beside him (word.all), and the shoulders they swing from. */
const HAND_REST: Sides = { far: [-85, -108], near: [95, -105] };
const SHOULDER: Sides = { far: [-45, -222], near: [45, -222] };
/** How far his hands bob with his breath, Board pixels. */
const BOB = 2;

/** Where he looks, from his feet. */
interface Gazes {
  /** At us. */
  readonly us: Pt;
  /** Up and away, wondering. */
  readonly aside: Pt;
  /** At the floor by his feet, where the line draws itself. */
  readonly floor: Pt;
  /** At the tablets beside him. */
  readonly tablets: Pt;
  /** Up at their top, on `short`. */
  readonly top: Pt;
  /** Down at his chest, at the stain. */
  readonly chest: Pt;
}
const GAZE: Gazes = {
  us: [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY],
  aside: [230, -430],
  floor: [160, 20],
  tablets: [330, -170],
  top: [430, -690],
  chest: [-10, -150],
};

/** "So is God's verdict a cover-up?": the brows go up, asking. */
const ASKING: Expression = { ...EASE, browY: -2.4, browTilt: 0.18, eyes: 1.1, mouth: -0.2 };
/** "What does the word mean?": puzzled, wondering. */
const WONDERING: Expression = { ...EASE, browY: -1.2, browTilt: 0.3, eyes: 1.05, mouth: -0.3 };
/** Watching the line draw itself: intent. */
const INTENT: Expression = { ...EASE, browY: -0.8, browTilt: 0.16, eyes: 1.12, mouth: 0 };
/** The lines lit: wonder, the start of hope. */
const LIT_UP: Expression = {
  ...EASE,
  browY: -2.2,
  browTilt: 0.24,
  eyes: 1.18,
  eyeW: 1.05,
  mouth: 0.5,
};
/** "So how do we measure up?": sober, looking at himself. */
const SOBER: Expression = { ...EASE, browY: -0.6, browTilt: 0.3, eyes: 0.95, mouth: -0.6 };
/** "We all come up short.": worried, looking up at them. */
const DWARFED: Expression = { ...EASE, browY: -1.8, browTilt: 0.38, eyes: 1.12, mouth: -1.1 };
/** "And we do what Adam and Eve did": caught, a glance at us. */
const CAUGHT: Expression = { ...EASE, browY: 0.6, browTilt: 0.28, eyes: 0.85, mouth: -0.8 };
/** Covering up: busy, a little sheepish. */
const BUSY: Expression = { ...EASE, browY: -0.4, browTilt: 0.26, eyes: 0.95, mouth: -0.5 };
/** "And how is that going?": a level look at us, the lids heavy. */
const LEVEL: Expression = { ...EASE, browY: 1.4, browTilt: 0.02, eyes: 0.7, mouth: -0.2 };

/** His numbers (scratch: every one he moves is rewritten each frame). */
const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
/** The seal pressed over his stain, as `cold` left it (scratch: its place rewritten each frame). */
const SEAL: SealPose = { x: 0, y: 0, rot: 0, scale: 1, shown: 1, glint: 0 };

// ─── the law beside him ──────────────────────────────────────────────────────

/** Where the tablets stand: the left one's bottom-left corner, on the floor beside him (word.all). */
const TABLETS_AT: Pt = [671, 820];
/** How tall the tablets stand on `short`: as tall as a doorway, 685 against his 373 (word.short). */
const DOORWAY = 2.43;

/** The gold line's run: along the floor, how thick it is, and how high it rises before it folds. */
interface LineRun {
  readonly from: number;
  readonly to: number;
  readonly y: number;
  readonly width: number;
  readonly rise: number;
}
/** Under his feet from behind his heels out to where the tablets' far side will stand. */
const LINE: LineRun = {
  from: LEAD_AT[0] - 150,
  to: TABLETS_AT[0] + 2 * TABLET.w + TABLET.gap,
  y: LEAD_AT[1] + 2,
  width: 10,
  rise: 22,
};
/** How many points each half of the line folds with. */
const FOLD_POINTS = 64;

/** The tablets (scratch: their size, stone and lines rewritten each frame). */
const TABS: TabletsPose = tabletsAt(TABLETS_AT[0], TABLETS_AT[1]);

/** `p`, from his feet, turned with him as he leans `lean`: where it is on the page. */
export const onHim = (p: Pt, lean: number): Pt => {
  const c = Math.cos(lean);
  const s = Math.sin(lean);
  return [LEAD_AT[0] + p[0] * c - p[1] * s, LEAD_AT[1] + p[0] * s + p[1] * c];
};

// ─── the fig leaves ──────────────────────────────────────────────────────────

/** A pinned leaf's cues: its fall, his hand's reach to its pin, his hand's press on it. */
interface LeafCues {
  readonly fall: 'fall1' | 'fall2' | 'fall3' | 'fall4';
  readonly pin: 'pin1' | 'pin2' | 'pin3' | 'pin4';
  readonly push: 'push1' | 'push2' | 'push3' | 'push4';
}

/** Where a leaf's veins meet, and its turn (0: its tip up). */
interface Place {
  readonly at: Pt;
  readonly rot: number;
}

/**
 * A leaf coming down: where it starts on the page, the point its path bends
 * toward (so it comes down beside him and in from the side, never across his
 * face), how far it sways, how many half sways it makes, its turn at the
 * start.
 */
interface Drift {
  readonly from: Pt;
  readonly bend: Pt;
  readonly sway: number;
  readonly sways: number;
  readonly spin: number;
}

/** The point `t` along the curve from `a` bent toward `b` to `c`, one axis. */
const bent = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;

/** A leaf he pins: its cues, its drift down, its pin (from the stain's middle), where it lies once it drops (from his feet). */
interface Pinned {
  readonly cues: LeafCues;
  readonly drift: Drift;
  readonly pin: Place;
  readonly fallen: Place;
}

/**
 * The four leaves he pins, one on each of "leaves", "excuses", "coat" and
 * "stain", as word.fig lays them: a patchwork round the seal, upper left,
 * upper right, lower left, lower right, each tip out from it, the blot's edge
 * showing between them. Each starts above the frame.
 */
const PINNED: ReadonlyArray<Pinned> = [
  {
    cues: { fall: 'fall1', pin: 'pin1', push: 'push1' },
    drift: { from: [330, 220], bend: [380, 640], sway: 30, sways: 3, spin: 0.9 },
    pin: { at: [-29, -24], rot: -0.85 },
    fallen: { at: [-66, 6], rot: -1.4 },
  },
  {
    cues: { fall: 'fall2', pin: 'pin2', push: 'push2' },
    drift: { from: [690, 215], bend: [640, 640], sway: -28, sways: 3, spin: -1 },
    pin: { at: [25, -24], rot: 0.8 },
    fallen: { at: [70, 8], rot: 1.1 },
  },
  {
    cues: { fall: 'fall3', pin: 'pin3', push: 'push3' },
    drift: { from: [300, 230], bend: [370, 650], sway: 32, sways: 4, spin: 1.2 },
    pin: { at: [-29, 28], rot: -2.3 },
    fallen: { at: [-108, 10], rot: 2.3 },
  },
  {
    cues: { fall: 'fall4', pin: 'pin4', push: 'push4' },
    drift: { from: [700, 225], bend: [640, 660], sway: -30, sways: 4, spin: -1.3 },
    pin: { at: [24, 30], rot: 2.35 },
    fallen: { at: [112, 6], rot: -2.6 },
  },
];

/** A leaf that drifts past him to the floor: its drift, where it lies on the page, and the shares of `stray` it falls through. */
interface Stray {
  readonly drift: Drift;
  readonly lies: Place;
  readonly from: number;
  readonly to: number;
}
/** The two word.fig drifts past him: one by his far side, one between him and the tablets. */
const STRAYS: ReadonlyArray<Stray> = [
  {
    drift: { from: [330, 225], bend: [300, 560], sway: 30, sways: 5, spin: 0.6 },
    lies: { at: [292, 828], rot: -1.2 },
    from: 0,
    to: 0.85,
  },
  {
    drift: { from: [700, 225], bend: [680, 560], sway: -30, sways: 4, spin: -0.5 },
    lies: { at: [640, 832], rot: 1.3 },
    from: 0.15,
    to: 1,
  },
];

/** Where each leaf lies once it has dropped, on the page: the four he pinned, at his feet, then the two that drifted past him. */
const FALLEN: ReadonlyArray<Place> = [
  ...PINNED.map((p): Place => ({
    at: [LEAD_AT[0] + p.fallen.at[0], LEAD_AT[1] + p.fallen.at[1]],
    rot: p.fallen.rot,
  })),
  ...STRAYS.map((s) => s.lies),
];

/**
 * The page as this scene's last frame leaves it, where `seed` opens: the
 * sheet and its light; where he stands, his hands' rests, their bob and
 * their size; his last look (`LEVEL`, his eyes on us); where the tablets
 * stand; and where each leaf lies, dry and flat.
 */
export const LAST_FRAME = {
  sheet: SHEET,
  light: PEACH,
  lead: LEAD_AT,
  hands: HAND_REST,
  bob: BOB,
  handScale: HAND_SCALE,
  face: LEVEL,
  tablets: TABLETS_AT,
  leaves: FALLEN,
} as const;

/** How far out from a leaf's hub his hand presses it on: the middle of its blade. */
const PRESS_ON = 10;
/** A press of his hand: in, and off again. */
const PRESS: ReadonlyArray<Key> = [
  [0, 0],
  [0.4, 1],
  [1, 0],
];
/** How much his hand gives as it presses: a share of its size. */
const SQUASH = 0.08;

export const word = drawing({
  timeline: {
    // The page turns over title's court from the right, its peach light coming with it.
    turn: { at: 'start', dur: 0.55, ease: 'outCubic', track: 'page' },
    // The camera creeps in on him through the act's question.
    creep: { after: 'turn', until: 'right', ease: 'linear', track: 'camera' },
    // "So is God's verdict a cover-up?": his brows go up.
    ask: { at: 'speech', offset: 0.5, dur: 0.6, track: 'lead' },
    // "What does the word mean?": he wonders, his eyes away.
    wonder: { mark: 'right', offset: -0.5, dur: 1.4, ends: true, track: 'lead' },
    // "Righteousness is right doing.": a straight gold line draws itself along the page under
    // his feet; he looks down at it, and the camera follows it.
    line: { mark: 'right', dur: 1.5, ease: 'inOutSine', track: 'law' },
    down: { mark: 'right', offset: 0.1, dur: 0.6, track: 'lead' },
    follow: { mark: 'right', dur: 1.6, ease: 'inOutSine', track: 'camera' },
    onLine: { after: 'follow', until: 'measure', ease: 'linear', track: 'camera' },
    // "Right by whose measure?": it rises, sliding out from under him to where the tablets will
    // stand, and folds into two small stone tablets, upright, their stone coming in as it closes.
    rise: { mark: 'measure', dur: 0.45, ease: 'outCubic', track: 'law' },
    fold: {
      mark: 'measure',
      offset: 0.25,
      dur: 1.2,
      stagger: 0.45,
      ease: 'inOutCubic',
      track: 'law',
    },
    stone: { with: 'fold', offset: 0.6, dur: 0.7, track: 'law' },
    watch: { mark: 'measure', offset: 0.2, dur: 0.6, track: 'lead' },
    toLaw: { mark: 'measure', dur: 1.6, ease: 'inOutSine', track: 'camera' },
    onLaw: { after: 'toLaw', until: 'all', ease: 'linear', track: 'camera' },
    // "The psalm says, 'All thy commandments are righteousness.'": he leans in, the camera close
    // on his face, and their ten lines light gold one by one, the last as he says "righteousness".
    lean: { mark: 'all', dur: 1, track: 'lead' },
    toNear: { mark: 'all', dur: 1.4, ease: 'inOutSine', track: 'camera' },
    quoted: { mark: 'all', word: 'righteousness', dur: 0, track: 'law' },
    lit: {
      mark: 'all',
      word: 'all',
      until: { cue: 'quoted', edge: 'start' },
      stagger: 0.8,
      ease: 'outCubic',
      track: 'law',
    },
    awe: { mark: 'all', word: 'all', dur: 0.6, track: 'lead' },
    // "His law is a picture of His character.": the lines swell on "character".
    pulse: { mark: 'all', word: 'character', dur: 0.9, track: 'law' },
    hold: { after: 'toNear', until: 'short', ease: 'linear', track: 'camera' },
    // "So how do we measure up?": he straightens and looks down at himself.
    straighten: { mark: 'all', word: 'measure', dur: 0.6, track: 'lead' },
    // "We all come up short.": the tablets grow as tall as a doorway, the camera falls back,
    // and he looks up at them, worried, a hand drawn in.
    tower: { mark: 'short', dur: 1, ease: 'outBack', track: 'law' },
    toShort: { mark: 'short', offset: -0.1, dur: 1, ease: 'inOutSine', track: 'camera' },
    onShort: { after: 'toShort', until: 'cover', ease: 'linear', track: 'camera' },
    lookUp: { mark: 'short', offset: 0.15, dur: 0.6, track: 'lead' },
    shrink: { mark: 'short', word: 'short', dur: 0.4, track: 'lead' },
    // "And we do what Adam and Eve did:": they settle back, and he glances at us.
    settle: { mark: 'cover', dur: 1.1, ease: 'inOutSine', track: 'law' },
    toFig: { mark: 'cover', dur: 1.2, ease: 'inOutSine', track: 'camera' },
    onFig: { after: 'toFig', until: 'going', ease: 'linear', track: 'camera' },
    glance: { mark: 'cover', offset: 0.5, dur: 0.5, track: 'lead' },
    // "we cover up.": he presses a hand over the stain, busy at it, his eyes on it.
    reach: { mark: 'cover', word: 'cover', dur: 0.5, ends: true, track: 'hand' },
    press: { mark: 'cover', word: 'cover', dur: 0.35, track: 'hand' },
    // "Fig leaves, excuses, a nicer coat over the stain.": fig leaves drift down, and he pins
    // one round the seal on each of its words.
    fall1: { mark: 'fig', word: 'leaves', dur: 1.4, ends: true, track: 'leaves' },
    fall2: { mark: 'fig', word: 'excuses', dur: 1.5, ends: true, track: 'leaves' },
    fall3: { mark: 'fig', word: 'coat', dur: 2, ends: true, track: 'leaves' },
    fall4: { mark: 'fig', word: 'stain', dur: 2.2, ends: true, track: 'leaves' },
    pin1: { mark: 'fig', word: 'leaves', dur: 0.45, ends: true, track: 'hand' },
    pin2: { mark: 'fig', word: 'excuses', dur: 0.45, ends: true, track: 'hand' },
    pin3: { mark: 'fig', word: 'coat', dur: 0.45, ends: true, track: 'hand' },
    pin4: { mark: 'fig', word: 'stain', dur: 0.45, ends: true, track: 'hand' },
    push1: { mark: 'fig', word: 'leaves', dur: 0.3, track: 'hand' },
    push2: { mark: 'fig', word: 'excuses', dur: 0.3, track: 'hand' },
    push3: { mark: 'fig', word: 'coat', dur: 0.3, track: 'hand' },
    push4: { mark: 'fig', word: 'stain', dur: 0.3, track: 'hand' },
    home: { after: 'push4', dur: 0.5, track: 'hand' },
    // Two more drift past him to the floor.
    stray: { mark: 'fig', offset: -1, dur: 4, ease: 'linear', track: 'leaves' },
    // "And how is that going?": the leaves curl and drop off, and he gives us a look.
    curl: { mark: 'going', dur: 0.5, stagger: 0.5, track: 'leaves' },
    drop: {
      mark: 'going',
      offset: 0.25,
      dur: 0.8,
      stagger: 0.4,
      ease: 'inQuad',
      track: 'leaves',
    },
    look: { mark: 'going', offset: 0.3, dur: 0.5, track: 'lead' },
    toLook: { mark: 'going', until: { at: 'speechEnd' }, ease: 'inOutSine', track: 'camera' },
  },
  knobs: {
    // Where the page opens: all of him on it, his head clear under where title's name was.
    open: [642, 578],
    openZoom: 1.9,
    // How much closer the camera creeps while a framing holds.
    creep: 1.05,
    // The line drawn under his feet, out to where the tablets will stand.
    line: [690, 640],
    lineZoom: 1.75,
    // The tablets beside him, as word.all frames them.
    law: [680, 616],
    lawZoom: 1.7,
    // In on him leaning to them, his face at a third of the frame, room over his head.
    near: [718, 612],
    nearZoom: 2.55,
    // Back as the tablets tower over him, as word.short frames them.
    short: [950, 510],
    shortZoom: 1.15,
    // On him covering up, as word.fig frames them.
    fig: [721, 610],
    figZoom: 1.65,
    // His look at us: his face at a third of the frame, the floor and the fallen leaves in it.
    look: [540, 636],
    lookZoom: 2.55,
  },
  // The court's rigs: title's court under the turning page, and him and his hands on it.
  rigs: COURT_RIGS,
  // title's light under its court, turning to the page's own as the page comes over.
  light: (f) => {
    const k = f.at('turn');
    return {
      color: mix(TITLE_LIGHT.color, PEACH.color, k),
      edge: mix(TITLE_LIGHT.edge ?? TITLE_LIGHT.color, PEACH.edge ?? PEACH.color, k),
      vignette: lerp(TITLE_LIGHT.vignette ?? 1, PEACH.vignette ?? 1, k),
    };
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const turn = f.at('turn');

    // ── title's court, until the page has turned over it
    if (turn < 1) titleCourt(f, w, h, f.handsOf(title));

    // ── the lead: his face and his eyes on each beat, his lean, his bow
    acted(LN, EASE, [
      [ASKING, f.at('ask')],
      [WONDERING, f.at('wonder')],
      [INTENT, f.at('down')],
      [LIT_UP, f.at('awe')],
      [SOBER, f.at('straighten')],
      [DWARFED, f.at('lookUp')],
      [CAUGHT, f.at('glance')],
      [BUSY, f.at('reach')],
      [LEVEL, f.at('look')],
    ]);
    const gaze = (axis: 0 | 1) => {
      let g = GAZE.us[axis];
      g = lerp(g, GAZE.aside[axis], f.at('wonder'));
      g = lerp(g, GAZE.floor[axis], f.at('down'));
      g = lerp(g, GAZE.tablets[axis], f.at('watch'));
      g = lerp(g, GAZE.chest[axis], f.at('straighten'));
      g = lerp(g, GAZE.top[axis], f.at('lookUp'));
      g = lerp(g, GAZE.us[axis], f.at('glance'));
      g = lerp(g, GAZE.chest[axis], f.at('reach'));
      return lerp(g, GAZE.us[axis], f.at('look'));
    };
    LN.gazeX = gaze(0);
    LN.gazeY = gaze(1);
    const leaning = f.at('lean') * (1 - f.at('straighten'));
    const up = f.at('lookUp') * (1 - f.at('glance'));
    const looking = f.at('down') * (1 - f.at('watch'));
    const busy = f.at('reach') * (1 - f.at('look'));
    // Leaning in to the tablets as word.all leans him, his head turned to them; drawn back a
    // little as he looks up at them grown.
    const lean = 0.17 * leaning - 0.04 * up;
    LN.lean = lean;
    LN.nod = 7 * looking + 4 * leaning - 6 * up + 3 * busy;
    LN.faceY = 12 * looking + 10 * f.at('straighten') * (1 - f.at('lookUp')) - 10 * up + 14 * busy;
    LN.tilt =
      0.08 * f.at('wonder') * (1 - f.at('down')) +
      0.07 * leaning +
      0.05 * f.at('look') +
      0.012 * Math.sin(f.t * 0.7);

    // The seal stays pressed over the stain, turned with him as he leans.
    const [sx, sy] = onHim([LEAD.stain.x, LEAD.stain.y], lean);
    SEAL.x = sx;
    SEAL.y = sy;

    // His hands, floating beside him, bobbing with his breath (a 4 s breath, half a turn on, as
    // `living(f, 4, 2.1)` breathes him).
    const bob = BOB * Math.sin(f.t * (Math.PI / 2) + 3.3);
    const restOf = (side: Pt): Pt => {
      const [x, y] = onHim(side, lean);
      return [x, y + bob];
    };
    const far = reachAbout(
      onHim(SHOULDER.far, lean),
      restOf(HAND_REST.far),
      onHim([-40, -150], lean),
      0.5 * f.at('shrink') * (1 - f.at('settle')),
    );
    // His near hand: over the stain on "cover", pressing; then to each leaf as it comes down,
    // pressing it on round the seal; home after the last.
    const nearShoulder = onHim(SHOULDER.near, lean);
    const pinOf = (p: Pinned): Pt =>
      onHim([LEAD.stain.x + p.pin.at[0], LEAD.stain.y + p.pin.at[1]], lean);
    let near = reachAbout(nearShoulder, restOf(HAND_REST.near), [sx, sy], f.at('reach'));
    for (const p of PINNED) {
      const [px, py] = pinOf(p);
      const a = p.pin.rot + lean;
      const middle: Pt = [px + PRESS_ON * Math.sin(a), py - PRESS_ON * Math.cos(a)];
      near = reachAbout(nearShoulder, near, middle, f.at(p.cues.pin));
    }
    near = reachAbout(nearShoulder, near, restOf(HAND_REST.near), f.at('home'));
    const pressing = Math.max(
      f.keys('press', PRESS),
      ...PINNED.map((p) => f.keys(p.cues.push, PRESS)),
    );
    const hand = (p: Pt, squash: number) =>
      at(ctx, { x: p[0], y: p[1], scale: HAND_SCALE * (1 - SQUASH * squash) }, () =>
        f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]] }),
      );

    // ── the fig leaves: each drifting down to its pin as his hand comes to meet it, pinned round
    // the seal and turned with him. Two more drift past him to the floor. On `going` every one
    // curls and dries, and the pinned ones drop at his feet.
    const leaves = () => {
      PINNED.forEach((p, i) => {
        const fall = f.at(p.cues.fall);
        if (!(fall > 0)) return;
        const [px, py] = pinOf(p);
        const { from, bend } = p.drift;
        const drop = f.stagger('drop', i, PINNED.length);
        const s = Math.sin(fall * Math.PI * p.drift.sways) * (1 - fall);
        leaf(ctx, {
          x: lerp(
            bent(from[0], bend[0], px, fall) + p.drift.sway * s,
            LEAD_AT[0] + p.fallen.at[0],
            drop,
          ),
          y: lerp(bent(from[1], bend[1], py, fall), LEAD_AT[1] + p.fallen.at[1], drop),
          rot: lerp(lerp(p.drift.spin, p.pin.rot + lean, fall) + 0.5 * s, p.fallen.rot, drop),
          scale: 1,
          curl: f.stagger('curl', i, PINNED.length),
          lie: lerp(1 - 0.3 * Math.abs(s), 0.5, drop),
        });
      });
      STRAYS.forEach((s, i) => {
        const k = f.keys('stray', [
          [s.from, 0],
          [s.to, 1, 'inOutSine'],
        ]);
        if (!(k > 0)) return;
        const sway = Math.sin(k * Math.PI * s.drift.sways) * (1 - k);
        // Laid flat on the floor as it lands.
        const lying = f.keys('stray', [
          [s.to - 0.1, 1],
          [s.to, 0.5],
        ]);
        const { from, bend } = s.drift;
        leaf(ctx, {
          x: bent(from[0], bend[0], s.lies.at[0], k) + s.drift.sway * sway,
          y: bent(from[1], bend[1], s.lies.at[1], k),
          rot: lerp(s.drift.spin, s.lies.rot, k) + 0.5 * sway,
          scale: 1,
          curl: f.stagger('curl', i, STRAYS.length),
          lie: lying - 0.3 * Math.abs(sway),
        });
      });
    };

    // ── the law: the stone coming in as the line closes round it, the ten lines lit one by one,
    // their swell on "character"; grown as tall as a doorway on `short`, settled back on `cover`
    TABS.stone = f.at('stone');
    TABS.scale = lerp(lerp(1, DOORWAY, f.at('tower')), 1, f.at('settle'));
    for (let i = 0; i < TABS.lit.length; i++) TABS.lit[i] = f.stagger('lit', i, TABS.lit.length);
    TABS.swell = f.keys('pulse', [
      [0, 0],
      [0.35, 1],
      [1, 0],
    ]);
    const law = () => {
      standingTablets(ctx, TABS);
      // The gold line: drawn along the floor; risen, its near end sliding out from under him to
      // the tablets' near side; then parted where the tablets will meet, each piece lifted by
      // its middle into a tablet's top, its ends folding down the sides and in along the foot
      // after; it gives way to their ink as their stone comes in.
      const drawn = f.at('line');
      if (drawn <= 0 || TABS.stone >= 1) return;
      const risen = f.at('rise');
      const lift = LINE.rise * risen;
      const nearEnd = lerp(LINE.from, TABLETS_AT[0], risen);
      if (!(f.at('fold') > 0)) {
        goldLine(
          ctx,
          [
            [nearEnd, LINE.y - lift],
            [lerp(LINE.from, LINE.to, drawn), LINE.y - lift],
          ],
          LINE.width,
          1,
        );
        return;
      }
      const parted = TABLETS_AT[0] + TABLET.w + TABLET.gap / 2;
      for (let t = 0; t < 2; t++) {
        const x0 = TABLETS_AT[0] + t * (TABLET.w + TABLET.gap);
        const from = t === 0 ? nearEnd : parted;
        const to = t === 0 ? parted : LINE.to;
        const pts: Pt[] = [];
        for (let j = 0; j <= FOLD_POINTS; j++) {
          const u = j / FOLD_POINTS;
          // The near tablet first, then the far: each piece's middle, then its ends.
          const k = f.staggerAt('fold', (t + Math.abs(2 * u - 1)) / 2);
          const [ox, oy] = tabletEdgeAt(x0, TABLETS_AT[1], 1, u);
          pts.push([lerp(lerp(from, to, u), ox, k), lerp(LINE.y - lift, oy, k)]);
        }
        goldLine(ctx, pts, LINE.width, 1 - TABS.stone);
      }
    };

    // ── the camera: each framing on its beat, a slow creep while one holds
    const creep = f.knob('creep');
    const open = knobCamera(f.knob('open'), f.knob('openZoom'));
    const lineShot = knobCamera(f.knob('line'), f.knob('lineZoom'));
    const lawShot = knobCamera(f.knob('law'), f.knob('lawZoom'));
    const close = knobCamera(f.knob('near'), f.knob('nearZoom'));
    const short = knobCamera(f.knob('short'), f.knob('shortZoom'));
    const fig = knobCamera(f.knob('fig'), f.knob('figZoom'));
    const cam = shotPath(open, [
      [f.at('creep'), pushOn(open, creep, 1)],
      [f.at('follow'), lineShot],
      [f.at('onLine'), pushOn(lineShot, creep, 1)],
      [f.at('toLaw'), lawShot],
      [f.at('onLaw'), pushOn(lawShot, creep, 1)],
      [f.at('toNear'), close, pushInto],
      [f.at('hold'), pushOn(close, creep, 1)],
      [f.at('toShort'), short],
      [f.at('onShort'), pushOn(short, creep, 1)],
      [f.at('toFig'), fig],
      [f.at('onFig'), pushOn(fig, creep, 1)],
      [f.at('toLook'), knobCamera(f.knob('look'), f.knob('lookZoom')), pushInto],
    ]);

    // ── the page: it turns in from the right over the court, everything on it riding with it
    at(ctx, { x: lerp(SHEET.w + 40, 0, turn), y: 0, rot: lerp(0.05, 0, turn) }, () => {
      piece(ctx, rounded(w / 2, h / 2, SHEET.w, SHEET.h, 0), PAGE, f.hand('page'), {
        role: 'scenery',
        kind: 'torn',
        torn: 4,
        shadow: 0,
      });
      shafts(ctx, w, h);
      if (turn < 1) {
        // Nothing on the page shows past its edge while it turns.
        ctx.beginPath();
        ctx.rect(w / 2 - SHEET.w / 2 + 10, h / 2 - SHEET.h / 2 + 10, SHEET.w - 20, SHEET.h - 20);
        ctx.clip();
      }
      camera(ctx, cam, w, h, () => {
        cast(ctx, LEAD_AT[0] - 46, LEAD_AT[0] + 46, LEAD_AT[1], LEAD.height, 0.6);
        contact(ctx, LEAD_AT[0], LEAD_AT[1] + 2, 95);
        law();
        at(ctx, { x: LEAD_AT[0], y: LEAD_AT[1] }, () =>
          f.rive('lead', { timelines: living(f, 4, 2.1), numbers: LN }),
        );
        leaves();
        seal(ctx, SEAL);
        hand(far, 0);
        hand(near, pressing);
      });
    });
  },
});
