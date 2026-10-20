// The word spoken, drawn to its Board (`spoke.dark` try 1, `spoke.light` try
// 1, `spoke.brings` try 2). It opens on seed's last frame: the accused on the
// page in the peach light, the opened seed lit beside his face. On "How can a
// word do that?" he looks up at us, asking, and the camera pushes into the
// seed's heart until its gold fills the frame; the dip to black opens the
// Bible's first page, a world of dark paper with no sky, each torn plane's
// edge a faint cool rim (`spoke.dark`). On `light` a spark of gold wakes at
// its left edge; on "Let there be light" it flies its arc over the dark, a
// ribbon of gold behind it, and on "is" it bursts into the sun: a ring of
// light goes out from it, the dawn flooding the sky behind the ring and then
// turning to day, while the dark planes hold the foreground (`spoke.light`).
// On `itself` the dark bands
// sink, and the hills, the water and the land tear in and rise in their
// place. On `calleth` the camera lifts to the heavens, the word's trail runs
// into the sun and gold stars come out one by one. On `verdict` a white
// flash, and the page again: the accused, the seed floating before him, his
// face near the frame's upper third. On "cover-up" the seal's old outline traces
// itself round the seed and holds a breath; on "No." it falls away. The card,
// "It's a seed.", "seed" large in gold, and a hard cut back on "His". On
// `brings` the camera widens and three icons rise in a row beside him, left
// to right (`spoke.brings`): his own hand circle, the seed settling onto it;
// the white cloth; the green blade; each lit as it is named, his eyes going
// to each. The narration's words are on the one card alone (CRAFT rule 1):
// nothing else in the picture is lettered.

import {
  type Camera,
  type CardWord,
  type Frame,
  at,
  camera,
  drawing,
  fullCard,
  knobCamera,
  multiplane,
  pushInto,
  pushOn,
  rounded,
  shotPath,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, boilTime } from '@bible/film/style';
import { CARD_STYLE } from '../card.ts';
import { COURT_RIGS, living } from '../court-cast.ts';
import { contact } from '../court-set.ts';
import { piece } from '../kit.ts';
import { GOLD_GLOW, PAGE, cast, shafts } from '../page-set.ts';
import { type OpenSeedPose, glow as shine, openSeed } from '../props.ts';
import { LEAD, LEAD_KNOBS } from '../rigs/lead-rig.ts';
import {
  ICON_BOX,
  ROW,
  STARS,
  bladeIcon,
  clothIcon,
  darkBand,
  frontBand,
  handCircle,
  hills,
  land,
  sealTrace,
  seedOnHand,
  shore,
  sky,
  spark,
  star,
  sun,
  sunRing,
  water,
  wordOfLight,
} from '../spoke-props.ts';
import { seed } from './seed.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

// ─── the page as seed leaves it ──────────────────────────────────────────────

const L = LAST_FRAME;

/** His breath's period and its offset, as word and seed breathe him (`living`), and his hands' bob with it. */
const BREATH = { period: 4, offset: 2.1 } as const;

/**
 * The opened seed beside his face as seed's last frame leaves it
 * (`seed.life`), numbers seed keeps to itself: where it floats and how tall,
 * its lean toward him, its ink, its light awake and swelled.
 */
const BESIDE = { x: 704, y: 539, size: 228, turn: 0.08, line: 5, glow: 1.4 } as const;
/** How far it bobs as it floats, Board pixels, and how far it sways, radians (seed's). */
const HOVER = 3;
const SWAY = 0.04;
/** The shadow it lays on the page (seed's): its middle and its reach as shares of its height, and how dark. */
const SEED_SHADOW = { x: 0.2, y: 0.55, r: 0.28, alpha: 0.7 } as const;

/** How far his head is tipped and how far he leans in to the seed as seed leaves him (seed's), and how far it lifts as he asks. */
const TIP = -0.1;
const LEAN_IN = 0.06;
const LIFT = 0.05;

/** As the camera pushes into the seed: how much more its light swells, and how far the light from its heart reaches at its fullest, Board pixels. */
const INTO = { glow: 1.6, reach: 520 } as const;

/** The colours the frame passes through between its worlds: the seed's gold filling it, the dark the first page opens out of, the flash back to the page. */
const VEIL = { gold: '#ffe8a8', dark: '#120f27', flash: '#fffaf0' } as const;

// ─── the first page ──────────────────────────────────────────────────────────

/**
 * How far each plane of the first page stands from the camera, the front
 * band's 1: the sky farthest, then the hills, the water, the far dark band,
 * the land, the near dark band. Close to 1, so the panels' layout holds as
 * the camera moves.
 */
const DEPTH = { sky: 1.2, hills: 1.12, water: 1.08, far: 1.07, land: 1.05, near: 1.03 } as const;

/** How far below its place each piece of the made world tears in from, Board pixels, and how many pieces rise. */
const RISE = { from: 420, pieces: 4 } as const;

/** How strongly the paper's fibre lies over the sky: half the house's, so the sky holds the panels' even indigo and its mottle does not blot it. */
const SKY_FIBRE = 0.5;

// ─── the seed before him, the seal's outline, the row ────────────────────────

/** The seed floating before him after the flash (`verdict`): out from his face and a little lower, so the seal's outline round it clears his face. */
const BEFORE = { x: 750, y: 560, size: 210 } as const;
/** Its light there, calm, and how much more it swells on "makes it true". */
const CALM = 1.1;
const SWELL = 0.6;

/** The seal's old outline round the seed: its size against the seal's, so its round clears the seed's tip; how far it drops as it falls away, Board pixels, and how far it turns. */
const OUTLINE = { scale: 5.2, drop: 260, turn: 0.35 } as const;

/**
 * The icons in the row, left to right (`spoke.brings`): where each stands,
 * its size, how wide it stands on the page (its shadows' half-width), how
 * it is cut, and the cue that lights it.
 */
const ICONS = [
  { at: ROW.faith, box: ICON_BOX.faith, foot: 70, draw: handCircle, lit: 'litFaith' },
  { at: ROW.cloth, box: ICON_BOX.cloth, foot: 125, draw: clothIcon, lit: 'litCloth' },
  { at: ROW.blade, box: ICON_BOX.blade, foot: 14, draw: bladeIcon, lit: 'litBlade' },
] as const;
type Icon = (typeof ICONS)[number];

/**
 * How the icons rise into the row: how far below their place they start,
 * Board pixels, and how small. They grow in whole, never faded in: a faded
 * icon would show its own pieces through each other.
 */
const ROW_IN = { drop: 50, scale: 0.2 } as const;
/** An icon's light as it is named: its reach against its size (the geometric mean of its height and width, so the tall blade's is no larger than the others'), how much, and how far it pops. */
const ICON_LIGHT = { reach: 0.65, alpha: 0.85, pop: 0.08 } as const;
/** The shadows the icons lay on the page: their cast's darkness, and their foot's. */
const ICON_SHADE = { cast: 0.5, foot: 0.8 } as const;

// ─── the lead ────────────────────────────────────────────────────────────────

/** Where he looks at us, from his feet. */
const US: Pt = [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY];

/** "How can a word do that?": his brows up at us, asking. */
const ASKING: Expression = { ...EASE, browY: -1.6, browTilt: 0.32, eyes: 1.1, mouth: -0.15 };
/** "So is His verdict a cover-up?": the question, at us. */
const QUESTION: Expression = { ...EASE, browY: -1.1, browTilt: 0.42, eyes: 1.02, mouth: -0.3 };
/** The seal's outline round the seed: wary. */
const WARY: Expression = { ...EASE, browY: 0.5, browTilt: 0.3, eyes: 0.88, mouth: -0.45 };
/** "No.": it falls away, relief. */
const RELIEVED: Expression = { ...EASE, browY: -1.4, browTilt: 0.1, eyes: 1.1, mouth: 0.15 };
/** Drawn to the seed, the start of a smile: as seed leaves him, and again on "and His word makes it true". */
const DRAWN: Expression = { ...EASE, browY: -1.2, browTilt: 0.18, eyes: 1.1, mouth: 0.4 };
/** Reading the row as each is named. */
const READING: Expression = { ...EASE, browY: -1, browTilt: 0.1, eyes: 1.06, mouth: 0.3 };
/** "It brings power.": glad. */
const GLAD: Expression = { ...EASE, browY: -1.5, browTilt: 0.06, eyes: 1.12, mouth: 0.6 };

// ─── scratch ─────────────────────────────────────────────────────────────────

/** His numbers (scratch: every one he moves is rewritten each frame). */
const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
/** The seed (scratch: its pose rewritten each frame). */
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: 0,
  size: BESIDE.size,
  open: 1,
  grown: 1,
  glow: BESIDE.glow,
  line: BESIDE.line,
  shown: 1,
};
/** Where it settles on the hand in the row (scratch). */
const ON_HAND: OpenSeedPose = { ...SEED };
/** Where an icon stands now and how big (scratch). */
interface Placed {
  x: number;
  y: number;
  scale: number;
  shown: number;
}
const PLACED: Placed = { x: 0, y: 0, scale: 1, shown: 0 };

const timeline = {
  // "How can a word do that?": he looks up at us, asking, and the camera pushes into the seed's
  // heart, its light swelling until its gold fills the frame.
  ask: { mark: 'first', dur: 0.6, track: 'lead' },
  push: { mark: 'first', until: 'dark', ease: 'inCubic', track: 'camera' },
  fill: { mark: 'first', word: 'that', until: 'dark', ease: 'inQuad', track: 'light' },
  blaze: { with: 'fill', until: { cue: 'fill' }, ease: 'inCubic', track: 'light' },
  // `dark`: the dip to black, and the Bible's first page fades up out of it, up by "world", dark
  // paper with no sky (spoke.dark); the camera creeps in while the world is made.
  dip: { mark: 'dark', dur: 0.45, ease: 'inQuad', track: 'light' },
  night: { mark: 'dark', word: 'world', dur: 1.2, ends: true, ease: 'inOutSine', track: 'world' },
  dusk: { mark: 'dark', until: 'calleth', ease: 'linear', track: 'camera' },
  // `light`: a spark of gold wakes at the dark's edge; on "Let there be light" it flies its arc
  // over the dark, and on "is" it bursts into the sun, a ring of light going out as the sky
  // floods to dawn and then to day (spoke.light).
  kindle: { mark: 'light', dur: 0.8, ease: 'outCubic', track: 'word' },
  fly: {
    mark: 'light',
    word: 'Let',
    until: { cue: 'burst', edge: 'start' },
    ease: 'inOutSine',
    track: 'word',
  },
  burst: { mark: 'light', word: 'is', dur: 0.8, ease: 'outBack', track: 'sun' },
  flood: { with: 'burst', until: 'itself', ease: 'outCubic', track: 'sky' },
  day: { after: 'flood', dur: 1.8, ease: 'inOutSine', track: 'sky' },
  // `itself`, "No tools, just His word.": the dark bands sink, and the hills, the water and the
  // land tear in and rise in their place, one after another.
  sink: { mark: 'itself', dur: 1, ease: 'inQuad', track: 'land' },
  rise: { mark: 'itself', dur: 2.4, stagger: 0.5, ease: 'outBack', track: 'land' },
  // `calleth`: the camera lifts to the heavens, the word's trail runs into the sun, and the
  // stars come out one by one as He calls them.
  lift: { mark: 'calleth', until: 'verdict', ease: 'inOutSine', track: 'camera' },
  trail: { mark: 'calleth', dur: 1.6, ease: 'inOutSine', track: 'word' },
  stars: {
    mark: 'calleth',
    word: 'calleth',
    until: 'verdict',
    stagger: 0.85,
    ease: 'outBack',
    track: 'stars',
  },
  // `verdict`: a white flash, and the page again, the accused with the seed floating before
  // him; on "verdict" he asks us.
  flashIn: { mark: 'verdict', dur: 0.2, ends: true, ease: 'inQuad', track: 'light' },
  flashOut: { mark: 'verdict', dur: 0.7, ease: 'outQuad', track: 'light' },
  onIdea: {
    mark: 'verdict',
    until: { cue: 'widen', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  wonder: { mark: 'verdict', word: 'verdict', dur: 0.6, track: 'lead' },
  // "cover-up?": the seal's old outline traces itself round the seed, its round and then its
  // tails, and holds a breath while he eyes it, wary; on "No." it falls away, and he is relieved.
  trace: { mark: 'cover', word: 'cover', dur: 0.7, ease: 'inOutSine', track: 'seal' },
  tails: { after: 'trace', dur: 0.3, ease: 'outQuad', track: 'seal' },
  wary: { mark: 'cover', word: 'cover', dur: 0.5, track: 'lead' },
  fall: { mark: 'seed', dur: 0.8, ease: 'inQuad', track: 'seal' },
  relief: { mark: 'seed', dur: 0.5, track: 'lead' },
  // "It's a seed,": the card, "seed" large in gold, cut back on "His".
  card: { mark: 'seed', word: 'its', until: { cue: 'back', edge: 'start' }, track: 'card' },
  back: { mark: 'seed', word: 'His', dur: 0, track: 'card' },
  // "and His word makes it true": drawn to it again, its light swelling.
  drawn: { mark: 'seed', word: 'His', dur: 0.6, track: 'lead' },
  swell: { mark: 'seed', word: 'makes', dur: 1.2, ease: 'inOutSine', track: 'seed' },
  // `brings`: the camera widens to the row; on "three" the icons rise in left to right, and the
  // seed settles onto the hand.
  widen: { mark: 'brings', word: 'word', dur: 1.4, ease: 'inOutSine', track: 'camera' },
  lineUp: {
    mark: 'brings',
    word: 'three',
    dur: 1.5,
    stagger: 0.6,
    ease: 'outBack',
    track: 'icons',
  },
  settle: { mark: 'brings', word: 'three', dur: 1.2, ease: 'inOutSine', track: 'seed' },
  onRow: { after: 'widen', until: { at: 'end' }, ease: 'linear', track: 'camera' },
  // Each icon lit as it is named, his eyes going to it; glad on "power".
  toFaith: { mark: 'faith', dur: 0.5, track: 'lead' },
  litFaith: { mark: 'faith', word: 'faith', dur: 0.7, ease: 'outCubic', track: 'icons' },
  toCloth: { mark: 'forgiveness', dur: 0.5, track: 'lead' },
  litCloth: {
    mark: 'forgiveness',
    word: 'forgiveness',
    dur: 0.7,
    ease: 'outCubic',
    track: 'icons',
  },
  toBlade: { mark: 'power', dur: 0.5, track: 'lead' },
  litBlade: { mark: 'power', word: 'power', dur: 0.6, ease: 'outCubic', track: 'icons' },
  glad: { mark: 'power', word: 'power', dur: 0.5, track: 'lead' },
} as const;

const knobs = {
  // Into the seed's heart as its light fills the frame.
  heart: [709, 558],
  heartZoom: 7,
  // The first page as its panels frame it (spoke.dark, spoke.light).
  world: [768, 520],
  worldZoom: 1.25,
  // How much closer it creeps while the world is made.
  worldCreep: 1.04,
  // Up to the heavens as the stars come out.
  heavens: [768, 440],
  heavensZoom: 1.32,
  // The page again after the flash: him and the seed before him, his face near the frame's upper
  // third, the seal's outline and its tails' forked ends inside the frame.
  idea: [610, 588],
  ideaZoom: 2.5,
  // The row beside him (spoke.brings).
  row: [918, 600],
  rowZoom: 1.47,
  // How much closer the camera creeps while a framing on the page holds.
  creep: 1.05,
} as const;

type SpokeFrame = Frame<keyof typeof timeline & string, typeof knobs, typeof COURT_RIGS>;

// ─── him on the page ─────────────────────────────────────────────────────────

/** `p` on the page, from his feet. */
const fromFeet = (p: Pt): Pt => [p[0] - L.lead[0], p[1] - L.lead[1]];

/** `a` toward `b` by `k`. */
const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** His face on each beat, his eyes on `gaze` (from his feet), his lean, his head tipped and lifting as he asks. */
const pose = (f: SpokeFrame, gaze: Pt, lean: number) => {
  acted(LN, DRAWN, [
    [ASKING, f.at('ask')],
    [QUESTION, f.at('wonder')],
    [WARY, f.at('wary')],
    [RELIEVED, f.at('relief')],
    [DRAWN, f.at('drawn')],
    [READING, f.at('toFaith')],
    [GLAD, f.at('glad')],
  ]);
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  LN.lean = lean;
  LN.tilt = lerp(TIP, LIFT, f.at('ask')) + 0.012 * Math.sin(f.t * 0.7);
  LN.nod = 0;
  LN.faceY = 0;
};

/** One of his hands floating at its rest beside him, turned with his lean, bobbing with his breath. */
const hand = (f: SpokeFrame, side: Pt, lean: number) => {
  const [x, y] = onHim(side, lean);
  const bob = L.bob * Math.sin((f.t + BREATH.offset) * ((2 * Math.PI) / BREATH.period));
  at(f.ctx, { x, y: y + bob }, () =>
    f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]], size: L.handScale }),
  );
};

/** The shadow the floating seed lays on the page, down and right of it, at `alpha`. */
const seedShadow = (ctx: CanvasRenderingContext2D, alpha: number) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= SEED_SHADOW.alpha * alpha;
  contact(
    ctx,
    SEED.x + SEED_SHADOW.x * SEED.size,
    SEED.y + SEED_SHADOW.y * SEED.size,
    SEED_SHADOW.r * SEED.size,
  );
  ctx.restore();
};

/**
 * The page as seed leaves it, under `cam`: him on it in the peach light,
 * leaning `lean`, his shadows, his hands; `under` drawn on the page before
 * him and `over` in front of him, under his hands.
 */
const onPage = (f: SpokeFrame, cam: Camera, lean: number, under: () => void, over: () => void) => {
  const { ctx, w, h } = f;
  const [fx, fy] = L.lead;
  piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
    role: 'scenery',
    kind: 'torn',
    torn: 4,
    shadow: 0,
  });
  shafts(ctx, w, h);
  camera(ctx, cam, w, h, () => {
    cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
    contact(ctx, fx, fy + 2, 95);
    under();
    at(ctx, { x: fx, y: fy }, () =>
      f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
    );
    over();
    hand(f, L.hands.far, lean);
    hand(f, L.hands.near, lean);
  });
};

// ─── the opening: into the seed's light ──────────────────────────────────────

/** The seed beside him as seed leaves it, its light swelling as the camera pushes into it. */
const beside = (f: SpokeFrame) => {
  SEED.x = BESIDE.x;
  SEED.y = BESIDE.y + HOVER * Math.sin(f.t * 1.3);
  SEED.rot = SWAY * Math.sin(f.t * 0.9) + BESIDE.turn;
  SEED.size = BESIDE.size;
  SEED.open = 1;
  SEED.glow = BESIDE.glow + INTO.glow * f.at('fill');
  SEED.line = BESIDE.line;
};

/** Seed's last frame, and the camera from its framing into the seed's heart as its light fills the frame. */
const opening = (f: SpokeFrame) => {
  const { ctx } = f;
  const shot = f.knobsOf(seed);
  const life = pushOn(knobCamera(shot('life'), shot('lifeZoom')), shot('creep'), 1);
  const heart = knobCamera(f.knob('heart'), f.knob('heartZoom'));
  const cam = shotPath(life, [[f.at('push'), heart, pushInto]]);
  beside(f);
  pose(f, toward(fromFeet([SEED.x, SEED.y]), US, f.at('ask')), LEAN_IN);
  const [hx, hy] = f.knob('heart');
  const fill = f.at('fill');
  onPage(
    f,
    cam,
    LEAN_IN,
    () => seedShadow(ctx, 1),
    () => {
      openSeed(ctx, SEED);
      shine(ctx, hx, hy, INTO.reach * fill, GOLD_GLOW, fill);
    },
  );
  // Its gold over the whole frame, held there as the dark comes over it.
  veil(f, VEIL.gold, f.at('blaze'));
};

// ─── the first page ──────────────────────────────────────────────────────────

/** Piece `i` of the made world (0 the hills, 1 the water, 2 the land, 3 the shore), torn in from below and risen into its place. */
const risen = (f: SpokeFrame, i: number, draw: () => void) => {
  const k = f.stagger('rise', i, RISE.pieces);
  if (k <= 0) return;
  f.ctx.save();
  f.ctx.translate(0, RISE.from * (1 - k));
  draw();
  f.ctx.restore();
};

/** The sky's plane: the sky flooding to dawn and to day, the word's ribbon and its spark, the sun bursting out of it, its ring, the stars. */
const heavens = (f: SpokeFrame) => {
  const { ctx } = f;
  const flood = f.at('flood');
  sky(ctx, flood, f.at('day'));
  const flown = f.at('fly');
  const trail = f.at('trail');
  const burst = f.at('burst');
  wordOfLight(ctx, trail, flown, 1 - trail, f.hand('word'));
  spark(ctx, flown, f.at('kindle') * (1 - clamp(burst)));
  sun(ctx, burst, flood, f.hand('sun'));
  sunRing(ctx, flood);
  STARS.forEach(([x, y, r], i) =>
    star(ctx, x, y, r, f.stagger('stars', i, STARS.length), Math.sin(f.t * 2.3 + i * 1.7)),
  );
};

/** The first page's planes, farthest first: the sky, the hills, the water, the dark bands, the land, the front band holding the foreground. */
const planes = (f: SpokeFrame) => {
  const { ctx } = f;
  const sunk = f.at('sink');
  return [
    { z: DEPTH.sky, draw: () => heavens(f) },
    { z: DEPTH.hills, draw: () => risen(f, 0, () => hills(ctx, f.hand('hills'))) },
    { z: DEPTH.water, draw: () => risen(f, 1, () => water(ctx, f.hand('water'), f.at('day'))) },
    { z: DEPTH.far, draw: () => darkBand(ctx, 0, f.hand('band0'), sunk) },
    {
      z: DEPTH.land,
      draw: () => {
        risen(f, 2, () => land(ctx, f.hand('land')));
        risen(f, 3, () => shore(ctx, f.hand('shore')));
      },
    },
    { z: DEPTH.near, draw: () => darkBand(ctx, 1, f.hand('band1'), sunk) },
    { z: 1, draw: () => frontBand(ctx, f.hand('band2'), f.at('flood')) },
  ];
};

/** The first page under its camera, creeping in while the world is made and lifting to the heavens as the stars come out. */
const genesis = (f: SpokeFrame) => {
  const { ctx, w, h } = f;
  const world = knobCamera(f.knob('world'), f.knob('worldZoom'));
  const cam = shotPath(world, [
    [f.at('dusk'), pushOn(world, f.knob('worldCreep'), 1)],
    [f.at('lift'), knobCamera(f.knob('heavens'), f.knob('heavensZoom')), pushInto],
  ]);
  multiplane(ctx, cam, w, h, planes(f), { rest: f.knob('world'), fibre: SKY_FIBRE });
};

// ─── the page again: the seed before him, the row ────────────────────────────

/** Where `icon`, the `i`th of the row, stands now and how big: risen in on "three", popping as it is lit. */
const placeOf = (f: SpokeFrame, icon: Icon, i: number): Placed => {
  const k = f.stagger('lineUp', i, ICONS.length);
  const pop = f.keys(icon.lit, [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  PLACED.x = icon.at[0];
  PLACED.y = icon.at[1] + ROW_IN.drop * (1 - k);
  PLACED.scale = lerp(ROW_IN.scale, 1, k) * (1 + ICON_LIGHT.pop * pop);
  PLACED.shown = clamp(k);
  return PLACED;
};

/**
 * How far from where he looks at us his eyes' target stands as he reads an
 * icon, his units. The face kit turns his features after a target only so
 * far, and the icons stand past that; a target this near turns them about
 * half as far, as `spoke.brings` turns them (about 0.08 of his head's
 * width), toward each icon however far along the row it stands.
 */
const READ = 130;

/** Where he looks to read `icon`, from his feet: `READ` toward its middle. */
const readingOf = (icon: Icon): Pt => {
  const [x, y] = fromFeet([icon.at[0] + icon.box.dx, icon.at[1] - icon.box.up]);
  const dx = x - US[0];
  const dy = y - US[1];
  const d = Math.hypot(dx, dy);
  return [US[0] + (dx / d) * READ, US[1] + (dy / d) * READ];
};

/** The seed before him after the flash, its light swelling on "makes it true", settling onto the hand in the row on "three". */
const before = (f: SpokeFrame) => {
  const k = f.at('settle');
  const palm = placeOf(f, ICONS[0], 0);
  seedOnHand(palm.x, palm.y, palm.scale, ON_HAND);
  SEED.x = lerp(BEFORE.x, ON_HAND.x, k);
  SEED.y = lerp(BEFORE.y, ON_HAND.y, k) + HOVER * Math.sin(f.t * 1.3) * (1 - k);
  SEED.rot = lerp(SWAY * Math.sin(f.t * 0.9), ON_HAND.rot, k);
  SEED.size = BEFORE.size * (ON_HAND.size / BEFORE.size) ** k;
  SEED.open = 1 - k;
  SEED.glow = lerp(CALM + SWELL * f.at('swell'), ON_HAND.glow, k);
  SEED.line = ON_HAND.line;
};

/** Where he looks after the flash: at the seed, at us on "verdict", at the seed as the outline traces it, then at each icon as it is named. */
const ideaGaze = (f: SpokeFrame): Pt => {
  const onSeed = fromFeet([SEED.x, SEED.y]);
  let g = toward(onSeed, US, f.at('wonder'));
  g = toward(g, onSeed, f.at('wary'));
  g = toward(g, readingOf(ICONS[0]), f.at('toFaith'));
  g = toward(g, readingOf(ICONS[1]), f.at('toCloth'));
  return toward(g, readingOf(ICONS[2]), f.at('toBlade'));
};

/** The shadows the row lays on the page: each icon's cast down and to the right, and its foot's. */
const rowShadows = (f: SpokeFrame) => {
  const { ctx } = f;
  ICONS.forEach((icon, i) => {
    const p = placeOf(f, icon, i);
    if (p.shown <= 0) return;
    const x = p.x + icon.box.dx * p.scale;
    const half = icon.foot * p.scale;
    cast(ctx, x - half, x + half, p.y, icon.box.tall * p.scale, ICON_SHADE.cast * p.shown);
    ctx.save();
    ctx.globalAlpha *= ICON_SHADE.foot * p.shown;
    contact(ctx, x, p.y + 2, half);
    ctx.restore();
  });
};

/** The row: each icon risen in, its light behind it once it is named. */
const row = (f: SpokeFrame) => {
  const { ctx } = f;
  ICONS.forEach((icon, i) => {
    const p = placeOf(f, icon, i);
    if (p.shown <= 0) return;
    const { box } = icon;
    const reach = ICON_LIGHT.reach * Math.sqrt(box.tall * box.wide) * p.scale;
    shine(
      ctx,
      p.x + box.dx * p.scale,
      p.y - box.up * p.scale,
      reach,
      GOLD_GLOW,
      ICON_LIGHT.alpha * f.at(icon.lit),
    );
    icon.draw(ctx, p.x, p.y, p.scale);
  });
};

/** The seal's old outline round the seed: traced on "cover-up", falling away on "No.". */
const outline = (f: SpokeFrame) => {
  const k = f.at('fall');
  if (k >= 1) return;
  at(f.ctx, { x: SEED.x, y: SEED.y + OUTLINE.drop * k, rot: OUTLINE.turn * k }, () =>
    sealTrace(f.ctx, 0, 0, OUTLINE.scale, f.at('trace'), f.at('tails'), 1 - k),
  );
};

/** The page after the flash, its camera creeping on him and the seed, then widening to the row. */
const idea = (f: SpokeFrame) => {
  const { ctx } = f;
  const creep = f.knob('creep');
  const near = knobCamera(f.knob('idea'), f.knob('ideaZoom'));
  const wide = knobCamera(f.knob('row'), f.knob('rowZoom'));
  const cam = shotPath(near, [
    [f.at('onIdea'), pushOn(near, creep, 1)],
    [f.at('widen'), wide, pushInto],
    [f.at('onRow'), pushOn(wide, creep, 1)],
  ]);
  before(f);
  pose(f, ideaGaze(f), 0);
  onPage(
    f,
    cam,
    0,
    () => {
      rowShadows(f);
      seedShadow(ctx, 1 - f.at('settle'));
    },
    () => {
      row(f);
      openSeed(ctx, SEED);
      outline(f);
    },
  );
};

// ─── between the worlds ──────────────────────────────────────────────────────

/** `color` over the whole frame at `alpha`. */
const veil = (f: SpokeFrame, color: string, alpha: number) => {
  if (alpha <= 0) return;
  const { ctx, w, h } = f;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

/** The dip to black and the first page fading up out of it, the white flash back to the page. */
const veils = (f: SpokeFrame) => {
  veil(f, VEIL.dark, f.at('dip') * (1 - f.at('night')));
  veil(f, VEIL.flash, f.at('flashIn') * (1 - f.at('flashOut')));
};

/** The card's words from "It's" to the payoff, its comma a full stop: "It's a seed." */
const itsASeed = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> => {
  const from = words.findIndex((w) => w.text.startsWith('It'));
  const to = words.findIndex((w) => w.payoff);
  const payoff = words[to];
  if (from < 0 || to < from || payoff === undefined) return words;
  return [
    ...words.slice(from, to),
    { text: payoff.text.replace(/,$/, '.'), at: payoff.at, payoff: true },
  ];
};

export const spoke = drawing({
  timeline,
  knobs,
  // The court's rigs: him and his hands.
  rigs: COURT_RIGS,
  // The page's own light, as word and seed leave it.
  light: L.light,
  draw: (f) => {
    if (f.at('flashOut') > 0) idea(f);
    else if (f.at('dip') >= 1) genesis(f);
    else opening(f);
    veils(f);
  },
  cards: [
    {
      cue: 'card',
      from: 'seed',
      to: 'brings',
      payoff: 'seed',
      draw: (f, words) => fullCard(f, itsASeed(words), CARD_STYLE),
    },
  ],
});
