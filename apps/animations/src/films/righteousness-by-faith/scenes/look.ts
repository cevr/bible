// Faith, drawn to its Board (`look.where`, `look.pole`, `look.climb`,
// `look.lifted`). It opens on spoke's last frame, the page and the row of
// three icons beside the accused, all lit (`woman`, which closes on that
// row, has no drawing yet). On `faith` his eyes go to the open hand, which
// pulses, its light swelling, while the cloth and the blade dim. On `where`
// the camera pushes in to him and the open hand comes home to his own hand,
// raised beside him, the gold seed on it; his face near the frame's upper
// half, his eyes on it, wondering (`look.where`). On `expects` the seed puts
// out its first root, curling down over his palm, and he watches it. On
// `hand` his other hand holds a stack of certificates, a medal and coins up
// toward the light; on "just" it slides off, out of the frame, and the hand
// comes down empty; on "takes" the seed's light swells in his open palm and
// he is glad.
//
// On `desert` the camera pushes on into the seed, and the camp opens out of
// it, a porthole growing from the seed to the whole frame: paper tents under
// a peach sky, the scarlet snakes slithering in the sand, the camp's people
// standing where `look.pole` stands them, the bitten stooped over their
// bites. The people are held as blocked masses (`look-props.ts`
// `campMass`), no faces and no cloth, until the crowd kit is sheeted and
// its people are rendered. On "Imagine" the camera closes on one of them,
// the climber; on "bitten" a snake strikes at his foot, he starts, and he
// bends to it. On `pole` the camera eases back, and on "set" the pole rises
// out of the sand with the bronze serpent on it, its bronze lit; on "looks"
// the people turn to it and look up, one after another out from the pole,
// and on "lives" the bitten straighten. On `harder` the climber goes to the
// pole and climbs it in heaves, straining, comic, the camera on the pole's
// lower half and following him up it (`look.climb`); on `climb` he stops,
// slides down, turns from the pole and simply looks up, and the camera
// closes on his head as he lifts his hands, glad. On "look" the word's card
// cuts in, "look" in gold, until `lifted`, where the camp is seen from low
// on the ground, the people's heads along the frame's foot, and the camera
// tilts up the pole against the sky to the serpent, its light swelling on
// "Son" (`look.lifted`). After the last word the camp closes into the open
// hand on the page, back in its row, glowing, the serpent shrinking into
// it. Nothing in the picture is lettered (CRAFT rule 1); the card is the
// narration's one word (CRAFT rule 1's full-screen card).

import {
  type Camera,
  type CardWord,
  type Frame,
  at,
  camera,
  drawing,
  fullCard,
  inset,
  knobCamera,
  multiplane,
  pushInto,
  pushOn,
  rounded,
  shotPath,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  EASE,
  type Expression,
  HAND_ART,
  type Pt,
  acted,
  boilTime,
  reachAbout,
} from '@bible/film/style';
import { CARD_STYLE } from '../card.ts';
import { COURT_RIGS, living } from '../court-cast.ts';
import { contact } from '../court-set.ts';
import { piece } from '../kit.ts';
import {
  CAMP_ORDER,
  type CamperName,
  type CamperPose,
  LOW_ROW,
  MERIT_COUNT,
  POLE,
  SMALL_LINE,
  SNAKES,
  bodyOf,
  campMass,
  campSky,
  dunes,
  firstRoot,
  groundLitter,
  liftedSerpent,
  lowCamp,
  lowHills,
  lowSky,
  merits,
  nearLitter,
  poleAndSerpent,
  sand,
  snake,
  stand,
  tents,
} from '../look-props.ts';
import { GOLD_GLOW, PAGE, cast, shafts } from '../page-set.ts';
import { type OpenSeedPose, glow as shine, openSeed } from '../props.ts';
import { LEAD, LEAD_KNOBS } from '../rigs/lead-rig.ts';
import {
  ICON_BOX,
  ICON_LINE,
  ON_HAND,
  ROW,
  bladeIcon,
  clothIcon,
  handCircle,
} from '../spoke-props.ts';
import { spoke } from './spoke.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

// ─── the page as spoke leaves it ─────────────────────────────────────────────

const L = LAST_FRAME;

/** His breath's period and its offset, as word, seed and spoke breathe him (`living`), and his hands' bob with it. */
const BREATH = { period: 4, offset: 2.1 } as const;

/** His head's tip as spoke leaves him, lifted (spoke's), and how far it sways. */
const LIFT = 0.05;
const SWAY = 0.012;

/**
 * The icons in the row, left to right (`spoke.brings`): where each stands,
 * its size, how wide it stands on the page (its shadows' half-width), how
 * it is cut.
 */
const ICONS = [
  { at: ROW.faith, box: ICON_BOX.faith, foot: 70 },
  { at: ROW.cloth, box: ICON_BOX.cloth, foot: 125, draw: clothIcon },
  { at: ROW.blade, box: ICON_BOX.blade, foot: 14, draw: bladeIcon },
] as const;
type Icon = (typeof ICONS)[number];

/** An icon's light (spoke's): its reach against its size, how much, and how far it pops as it pulses. */
const ICON_LIGHT = { reach: 0.65, alpha: 0.85, pop: 0.08 } as const;
/** How much more the open hand's light swells as it pulses. */
const PULSE = 0.35;
/** The shadows the icons lay on the page (spoke's): their cast's darkness, and their foot's. */
const ICON_SHADE = { cast: 0.5, foot: 0.8 } as const;
/**
 * How the cloth and the blade dim: the page's paper laid over each, out
 * from its middle past its edge, so neither shows its own pieces through
 * the other as a faded icon would; how much at its middle, and how far it
 * reaches against the icon's size.
 */
const DIM = { alpha: 0.55, reach: 0.95 } as const;

// ─── his hand and the seed in it ─────────────────────────────────────────────

/** His shoulders, from his feet, that his hands swing from (word's). */
const SHOULDER = { far: [-45, -222], near: [45, -222] } as const satisfies Record<string, Pt>;

/** Where his near hand holds the open hand up beside him (`look.where`): out from his chest, under his chin, from his feet. */
const PALM: Pt = [100, -209];
/** Where his far hand holds the merits up toward the light, from his feet: up and out to the left, clear of his head. */
const RAISED: Pt = [-122, -262];

/** His hand's radius at his size, Board pixels: what the open hand shrinks to as it comes home. */
const HAND_R = HAND_ART.r * L.handScale;
/** The open hand's radius in the row (`handCircle`'s). */
const ICON_R = ICON_BOX.faith.up;
/** Its size against the row's once it is home: his own hand's. */
const HOME = HAND_R / ICON_R;
/** Where it passes on its way home, between the row and his hand: a little above the line between them. */
const VIA: Pt = [702, 610];

/**
 * How tall the seed stands in his palm once the open hand is home: as tall
 * as the panel draws it, past the row's own share of his hand, so its ink
 * does not fill it; and the power of the hand's size its size follows as
 * the hand comes home, so it reaches that.
 */
const PALM_SEED = 20;
const SEED_GROW = Math.log(PALM_SEED / ON_HAND.size) / Math.log(HOME);
/** How high the seed rises off the row's place for its larger size, as a share of the size it gains: so its foot still rests on the hand's top. */
const SEED_RISE = 0.3;
/** Its light (the row's, low: its light lies over the hand's ink, which must stay dark), and how much more on "word", on "takes" and as the camera pushes into it. */
const SEED_GLOW = { rest: ON_HAND.glow, heard: 0.15, takes: 0.2, through: 0.6 } as const;

/** How far past his framing on his hand the camera pushes into the seed before the camp has opened out of it. */
const INTO_SEED = 9;
/** How much closer the camp stands in the porthole as it opens than once it fills the frame: the push carries on through it. */
const IRIS_PUSH = 1.25;
/** The seed's light thrown round the porthole as it opens, against the porthole's size, and how much at first. */
const IRIS_GLOW = { reach: 1.7, alpha: 0.55 } as const;
/** The camp's point the porthole opens on, Board pixels: the tents' line under the dunes, where the pole will rise. */
const IRIS_AIM: Pt = [768, 420];

// ─── the lead ────────────────────────────────────────────────────────────────

/** Where he looks at us, from his feet. */
const US: Pt = [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY];

/**
 * How far from where he looks at us his eyes' target stands, his units: the
 * face kit turns his features after a target only so far, and a target this
 * near turns them about half as far, toward whatever he looks at however
 * far off it stands (spoke's, as `spoke.brings` turns them to the row); and
 * how far for what he holds in his own hand, which `look.where` turns them
 * twice as far to.
 */
const READ = 130;
const HELD = 2 * READ;

/** "It brings power.": glad, as spoke leaves him, and as the scene closes on the row again. */
const GLAD: Expression = { ...EASE, browY: -1.5, browTilt: 0.06, eyes: 1.12, mouth: 0.6 };
/** Reading the open hand as it pulses. */
const READING: Expression = { ...EASE, browY: -1, browTilt: 0.1, eyes: 1.06, mouth: 0.3 };
/** "From hearing the word.": the open hand in his own, wondering, his brows up at their inner ends, his mouth flat (`look.where`). */
const WONDER: Expression = { ...EASE, browY: -1, browTilt: 0.48, eyes: 1.04, mouth: -0.05 };
/** "Faith expects": watching the root come, intent. */
const WATCHING: Expression = { ...EASE, browY: -1.4, browTilt: 0.22, eyes: 1.12, mouth: 0.1 };
/** Holding the merits up, hoping. */
const HOPING: Expression = { ...EASE, browY: -1.6, browTilt: 0.3, eyes: 1.08, mouth: 0.15 };
/** "takes": glad of the seed in his open hand. */
const TAKEN: Expression = { ...EASE, browY: -1.4, browTilt: 0.1, eyes: 1.1, mouth: 0.5 };

// ─── scratch ─────────────────────────────────────────────────────────────────

/** His numbers (scratch: every one he moves is rewritten each frame). */
const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
/** The seed (scratch: its pose rewritten each frame). */
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: ON_HAND.rot,
  size: ON_HAND.size,
  open: 0,
  grown: 1,
  glow: ON_HAND.glow,
  line: ICON_LINE,
  shown: 1,
};

const timeline = {
  // `faith`: his eyes go to the open hand; it pulses, its light swelling, as the cloth and the
  // blade dim; the row's framing creeps on.
  toFaith: { mark: 'faith', dur: 0.5, track: 'lead' },
  pulse: { mark: 'faith', word: 'faith', dur: 1.4, track: 'icons' },
  dim: { mark: 'faith', word: 'faith', dur: 0.9, ease: 'inOutSine', track: 'icons' },
  onRow: { mark: 'faith', until: 'where', ease: 'linear', track: 'camera' },
  // `where`: the camera pushes in to him; his near hand comes up beside him, and the open hand
  // comes home into it, the seed on it, his eyes after it; on "word" the seed's light swells and
  // settles.
  push: { mark: 'where', dur: 1.8, ease: 'inOutSine', track: 'camera' },
  raise: { mark: 'where', dur: 0.7, ease: 'inOutSine', track: 'hand' },
  home: { mark: 'where', dur: 1.5, ease: 'inOutSine', track: 'hand' },
  wonder: { mark: 'where', dur: 0.6, track: 'lead' },
  heard: { mark: 'where', word: 'word', dur: 1.2, track: 'seed' },
  onHand: { after: 'push', until: 'desert', ease: 'linear', track: 'camera' },
  // `expects`: the seed puts out its first root, curling down over his palm; he watches it.
  watch: { mark: 'expects', dur: 0.5, track: 'lead' },
  root: { mark: 'expects', word: 'expects', dur: 2.2, ease: 'outCubic', track: 'seed' },
  // `hand`: his other hand holds the merits up toward the light, and he looks up at them,
  // hoping; on "just" they slide off it and fall out of the frame, his hand comes down empty and
  // he looks back at the seed; on "takes" its light swells in his open hand, and he is glad.
  offer: { mark: 'hand', dur: 0.9, ease: 'inOutSine', track: 'hand' },
  hope: { mark: 'hand', dur: 0.5, track: 'lead' },
  slide: { mark: 'hand', word: 'just', dur: 0.9, stagger: 0.12, ease: 'inQuad', track: 'merits' },
  lower: { mark: 'hand', word: 'just', dur: 1.1, ease: 'inOutSine', track: 'hand' },
  back: { mark: 'hand', word: 'just', dur: 0.5, track: 'lead' },
  takes: { mark: 'hand', word: 'takes', dur: 1.4, track: 'seed' },
  glad: { mark: 'hand', word: 'takes', dur: 0.5, track: 'lead' },
  // `desert`: the page stops breathing as the camera pushes on into the seed, its light swelling;
  // the camp opens out of it, a porthole growing from the seed to the whole frame, and the
  // camera creeps over the camp.
  still: { mark: 'desert', dur: 0.5, track: 'camera' },
  through: { mark: 'desert', dur: 1.4, ease: 'inCubic', track: 'camera' },
  iris: { mark: 'desert', offset: 0.55, dur: 1.2, ease: 'inOutSine', track: 'iris' },
  camp: {
    after: 'iris',
    until: { cue: 'toClimber', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  // "Imagine you've been bitten": the camera closes on the climber; on "bitten" the near snake
  // strikes at his foot, he starts, and he bends to it.
  toClimber: { mark: 'desert', word: 'imagine', until: 'pole', ease: 'inOutSine', track: 'camera' },
  strike: { mark: 'desert', word: 'bitten', dur: 0.6, track: 'snakes' },
  start: { mark: 'desert', word: 'bitten', offset: 0.15, dur: 0.7, track: 'climber' },
  bend: {
    mark: 'desert',
    word: 'bitten',
    offset: 0.2,
    dur: 1.4,
    ease: 'inOutSine',
    track: 'climber',
  },
  // `pole`: the camera eases back over the camp; on "set" the pole rises out of the sand with the
  // bronze serpent on it, and on "serpent" its bronze is lit; on "looks" the people turn and
  // look up to it, one after another out from the pole; on "lives" the bitten straighten.
  wide: { mark: 'pole', dur: 1.3, ease: 'inOutSine', track: 'camera' },
  rise: { mark: 'pole', word: 'set', dur: 1.4, ease: 'outBack', track: 'pole' },
  lit: { mark: 'pole', word: 'serpent', dur: 1.2, track: 'pole' },
  lookUp: { mark: 'pole', word: 'looks', dur: 1.4, stagger: 0.45, track: 'crowd' },
  lives: {
    mark: 'pole',
    word: 'lives',
    dur: 1.6,
    stagger: 0.45,
    ease: 'inOutSine',
    track: 'crowd',
  },
  onPole: { after: 'wide', until: 'harder', ease: 'linear', track: 'camera' },
  // `harder`: the climber goes to the pole, and on "make" climbs it in heaves, straining, comic,
  // slipping back a little each time; the camera frames the pole's lower half and follows him
  // slowly up it, the serpent lit above him; the camp watches him.
  toPole: { mark: 'harder', dur: 0.9, ease: 'inOutSine', track: 'climber' },
  onClimb: { mark: 'harder', dur: 1, ease: 'inOutSine', track: 'camera' },
  climbing: { mark: 'harder', word: 'make', until: 'climb', ease: 'linear', track: 'climber' },
  // `grip`: his hands take the pole in the first eighth of the climb.
  grip: { with: 'climbing', dur: 0.19, ease: 'linear', track: 'climber' },
  up: { after: 'onClimb', until: 'climb', ease: 'inOutSine', track: 'camera' },
  // `climb`: he stops; on "one" he slides down the pole, the camera coming down with him; on
  // "has" he turns from it, and on "climb" he simply looks up; on "pole" the camera closes on his
  // head as he lifts his hands, glad.
  stop: { mark: 'climb', dur: 0.3, track: 'climber' },
  slip: { mark: 'climb', word: 'one', dur: 0.55, ease: 'inQuad', track: 'climber' },
  down: { mark: 'climb', word: 'one', dur: 0.8, ease: 'inOutSine', track: 'camera' },
  turn: { mark: 'climb', word: 'has', dur: 0.5, ease: 'inOutSine', track: 'climber' },
  gaze: { mark: 'climb', word: 'climb', dur: 0.7, ease: 'inOutSine', track: 'climber' },
  close: { mark: 'climb', word: 'pole', until: 'look', ease: 'inOutSine', track: 'camera' },
  heal: { mark: 'climb', word: 'pole', until: 'look', ease: 'outCubic', track: 'climber' },
  // `look`: on "look" the word's card, "look" in gold, until `lifted`.
  card: { mark: 'look', word: 'look', until: 'lifted', track: 'card' },
  // `lifted`: the camp from low on the ground, the people's heads along the frame's foot; the
  // camera tilts up the pole against the sky to the serpent, its light swelling on "Son".
  low: { mark: 'lifted', dur: 0, track: 'camera' },
  tilt: { mark: 'lifted', until: { at: 'speechEnd' }, ease: 'inOutSine', track: 'camera' },
  son: { mark: 'lifted', word: 'son', dur: 1.6, track: 'pole' },
  // After the last word the camp closes into the open hand on the page, back in its row, glowing.
  pull: { at: 'speechEnd', dur: 1.3, ease: 'inOutSine', track: 'camera' },
} as const;

const knobs = {
  // Him and the open hand in his own, his face near the frame's upper half (`look.where`).
  where: [585, 562],
  whereZoom: 3.3,
  // The camp as `look.pole` lays it out, the serpent's head and the near snakes in the frame, and
  // how far the camera creeps in over it.
  camp: [768, 522],
  campZoom: 1.17,
  campCreep: 1.04,
  // The climber with the snake at his foot, his neighbours beside him.
  bitten: [590, 665],
  bittenZoom: 1.9,
  // The camp with the pole risen in it, the serpent's head clear of the frame's top.
  pole: [768, 470],
  poleZoom: 1.12,
  // The pole's lower half, him at its foot; and the pole higher up, where he climbs to.
  climb: [705, 640],
  climbZoom: 1.95,
  climbUp: [715, 420],
  climbUpZoom: 1.95,
  // His head at a third of the frame and more, looking up, the pole beside him.
  face: [660, 500],
  faceZoom: 3.6,
  // The low view (`look.lifted`): the heads along the foot and the pole going up; then the whole
  // panel, the serpent high against the sky.
  low: [768, 772],
  lowZoom: 1.5,
  lifted: [768, 512],
  liftedZoom: 1.06,
} as const;

type LookFrame = Frame<keyof typeof timeline & string, typeof knobs, typeof COURT_RIGS>;

// ─── him on the page ─────────────────────────────────────────────────────────

/** `p` on the page, from his feet. */
const fromFeet = (p: Pt): Pt => [p[0] - L.lead[0], p[1] - L.lead[1]];

/** `a` toward `b` by `k`. */
const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** Where he looks to read a point on the page (`p`, from his feet): `reach` toward it. */
const readingAt = (p: Pt, reach = READ): Pt => {
  const dx = p[0] - US[0];
  const dy = p[1] - US[1];
  const d = Math.hypot(dx, dy) || 1;
  return [US[0] + (dx / d) * reach, US[1] + (dy / d) * reach];
};

/** Where he looks to read `icon`: its middle. */
const readingOf = (icon: Icon): Pt =>
  readingAt(fromFeet([icon.at[0] + icon.box.dx, icon.at[1] - icon.box.up]));

/** How far his hands bob with his breath now, Board pixels. */
const bobOf = (f: LookFrame) =>
  L.bob * Math.sin((f.t + BREATH.offset) * ((2 * Math.PI) / BREATH.period));

/** One of his hands at `p` on the page. */
const handAt = (f: LookFrame, p: Pt) =>
  at(f.ctx, { x: p[0], y: p[1], scale: L.handScale }, () =>
    f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]] }),
  );

/**
 * Where his hands stand now: the near one raised to hold the open hand, the
 * far one holding up the merits and coming down again; each held still once
 * raised; both at rest once the scene has `closing` come back to the row.
 */
const handsOf = (f: LookFrame, closing: number) => {
  const bob = bobOf(f);
  const rest = (side: Pt): Pt => {
    const [x, y] = onHim(side, 0);
    return [x, y + bob];
  };
  const raise = f.at('raise') * (1 - closing);
  const reached = reachAbout(onHim(SHOULDER.near, 0), rest(L.hands.near), onHim(PALM, 0), raise);
  const near: Pt = [reached[0], reached[1] - bob * clamp(raise)];
  const farShoulder = onHim(SHOULDER.far, 0);
  const lifted = reachAbout(farShoulder, rest(L.hands.far), onHim(RAISED, 0), f.at('offer'));
  const raised: Pt = [lifted[0], lifted[1] - bob * clamp(f.at('offer'))];
  const far = reachAbout(farShoulder, raised, rest(L.hands.far), f.at('lower'));
  return { near, far };
};

/** His face on each beat, his eyes on `gaze` (from his feet), his head lifted as spoke leaves it and coming level as he takes the open hand; glad again, lifted, as the scene `closing` comes back to the row. */
const pose = (f: LookFrame, gaze: Pt, closing: number) => {
  acted(LN, GLAD, [
    [READING, f.at('toFaith')],
    [WONDER, f.at('wonder')],
    [WATCHING, f.at('watch')],
    [HOPING, f.at('hope')],
    [WATCHING, f.at('back')],
    [TAKEN, f.at('glad')],
    [GLAD, closing],
  ]);
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = lerp(LIFT, 0, f.at('wonder') * (1 - closing)) + SWAY * Math.sin(f.t * 0.7);
  LN.nod = 0;
  LN.faceY = 0;
};

// ─── the row, and the open hand coming home ──────────────────────────────────

/** The point `k` of the way along the curve from `a` through `via` to `b`. */
const curve = (a: Pt, via: Pt, b: Pt, k: number): Pt => {
  const u = 1 - k;
  return [
    u * u * a[0] + 2 * u * k * via[0] + k * k * b[0],
    u * u * a[1] + 2 * u * k * via[1] + k * k * b[1],
  ];
};

/** The open hand's middle in the row, where the scene closes into it. */
const FAITH_MIDDLE: Pt = [ROW.faith[0], ROW.faith[1] - ICON_R];

/** The open hand now: its middle and its size against the row's, `home` of the way from its place in the row to his near hand at `palm`. */
const openHandAt = (home: number, palm: Pt) => {
  const [x, y] = curve(FAITH_MIDDLE, VIA, palm, home);
  return { x, y, scale: HOME ** home };
};

/**
 * The seed on the open hand whose middle stands at (`x`, `y`), `scale` of
 * the row's size, `home` of the way to his palm: lying on its top, growing
 * past the hand's share of its size as the hand shrinks (to `PALM_SEED`
 * once home), its ink thinning to a small prop's.
 */
const seedOn = (x: number, y: number, scale: number, home: number) => {
  const size = ON_HAND.size * scale ** SEED_GROW;
  SEED.size = size;
  SEED.x = x + ON_HAND.dx * scale;
  SEED.y = y + (ON_HAND.dy + ICON_R) * scale - SEED_RISE * (size - ON_HAND.size * scale);
  SEED.rot = ON_HAND.rot;
  SEED.open = 0;
  SEED.line = lerp(ICON_LINE, SMALL_LINE, home);
  SEED.shown = 1;
};

/** The seed's foot, where its root leaves it: half its height down its axis from its middle. */
const seedFoot = (): Pt => [
  SEED.x - (SEED.size / 2) * Math.sin(SEED.rot),
  SEED.y + (SEED.size / 2) * Math.cos(SEED.rot),
];

/** The shadows the row lays on the page: the open hand's fading as it lifts off it (`home` of the way to his hand). */
const rowShadows = (f: LookFrame, home: number) => {
  const { ctx } = f;
  ICONS.forEach((icon) => {
    const shown = icon === ICONS[0] ? 1 - home : 1;
    if (shown <= 0) return;
    const x = icon.at[0] + icon.box.dx;
    cast(ctx, x - icon.foot, x + icon.foot, icon.at[1], icon.box.tall, ICON_SHADE.cast * shown);
    ctx.save();
    ctx.globalAlpha *= ICON_SHADE.foot * shown;
    contact(ctx, x, icon.at[1] + 2, icon.foot);
    ctx.restore();
  });
};

/** The cloth and the blade, lit as spoke leaves them, their light going out and the page laid over them as they dim; lit again as the scene `closing` comes back to the row. */
const others = (f: LookFrame, closing: number) => {
  const { ctx } = f;
  const dim = f.at('dim') * (1 - closing);
  for (const icon of [ICONS[1], ICONS[2]]) {
    const { box } = icon;
    const x = icon.at[0] + box.dx;
    const y = icon.at[1] - box.up;
    const size = Math.sqrt(box.tall * box.wide);
    shine(ctx, x, y, ICON_LIGHT.reach * size, GOLD_GLOW, ICON_LIGHT.alpha * (1 - dim));
    icon.draw(ctx, icon.at[0], icon.at[1], 1);
    if (dim <= 0) continue;
    const r = DIM.reach * size;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, PAGE);
    g.addColorStop(0.7, PAGE);
    g.addColorStop(1, `${PAGE}00`);
    ctx.globalAlpha *= DIM.alpha * dim;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  }
};

/** The open hand now (scratch): its middle, its size against the row's, how far it has come home, how far it pops as it pulses. */
const OPEN = { x: 0, y: 0, scale: 1, home: 0, pop: 0 };

/**
 * Place the open hand, pulsing on `faith` and coming home to his near hand
 * at `palm`, and the seed on it; back in its row, its light swelling as the
 * camp closes into it, once the scene is `closing`.
 */
const placeOpenHand = (f: LookFrame, palm: Pt, closing: number) => {
  const home = clamp(f.at('home')) * (1 - closing);
  const p = openHandAt(home, palm);
  OPEN.pop = Math.max(
    f.keys('pulse', [
      [0, 0],
      [0.35, 1, 'outCubic'],
      [1, 0, 'inOutSine'],
    ]),
    f.at('pull'),
  );
  OPEN.x = p.x;
  OPEN.y = p.y;
  OPEN.scale = p.scale * (1 + ICON_LIGHT.pop * OPEN.pop);
  OPEN.home = home;
  seedOn(OPEN.x, OPEN.y, OPEN.scale, home);
};

/** The open hand on its way home, its light with it, landing on his hand; nothing once home, where his own hand holds the seed. */
const openHand = (f: LookFrame) => {
  if (OPEN.home >= 1) return;
  const reach = ICON_LIGHT.reach * 2 * ICON_R * OPEN.scale;
  shine(
    f.ctx,
    OPEN.x,
    OPEN.y,
    reach,
    GOLD_GLOW,
    (ICON_LIGHT.alpha + PULSE * OPEN.pop) * (1 - OPEN.home),
  );
  handCircle(f.ctx, OPEN.x, OPEN.y + ICON_R * OPEN.scale, OPEN.scale);
};

/** The seed on the open hand, its first root under it while it lies in his palm, its light swelling on "word", on "takes" and as the camera pushes into it. */
const seedInHand = (f: LookFrame, closing: number) => {
  const { ctx } = f;
  const heard = f.keys('heard', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const takes = f.keys('takes', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0.4, 'inOutSine'],
  ]);
  SEED.glow =
    SEED_GLOW.rest +
    SEED_GLOW.heard * heard +
    SEED_GLOW.takes * takes +
    SEED_GLOW.through * f.at('through') * (1 - closing);
  const [rx, ry] = seedFoot();
  firstRoot(ctx, rx, ry, f.at('root') * (1 - closing), SMALL_LINE);
  openSeed(ctx, SEED);
};

/** Where he looks: from the blade as spoke leaves him to the open hand, after it home to his palm, to the root, up to the merits, back to the seed; to the open hand in the row as the scene `closing` comes back to it. */
const gazeOf = (f: LookFrame, raised: Pt, closing: number): Pt => {
  let g = toward(readingOf(ICONS[2]), readingOf(ICONS[0]), f.at('toFaith'));
  g = toward(g, readingAt(fromFeet([OPEN.x, OPEN.y]), HELD), f.at('wonder'));
  g = toward(g, readingAt(fromFeet(seedFoot()), HELD), f.at('watch'));
  g = toward(g, readingAt(fromFeet([raised[0], raised[1] - 30]), HELD), f.at('hope'));
  g = toward(g, readingAt(fromFeet([SEED.x, SEED.y]), HELD), f.at('back'));
  return toward(g, readingOf(ICONS[0]), closing);
};

/**
 * The page: him on it in the peach light, the row beside him, the open hand
 * coming home, the merits held up and sliding off; under the camera from the
 * row in to him and on into the seed, the page's breath let go as it pushes
 * in. Once the scene has `closing` come back to it from the camp: the row as
 * spoke left it, the open hand back in it, him glad beside it. Answers the
 * camera it was drawn through, as framed.
 */
const page = (f: LookFrame, closing: number): Camera => {
  const { ctx, w, h } = f;
  const row = f.knobsOf(spoke);
  const rowCam = pushOn(knobCamera(row('row'), row('rowZoom')), row('creep'), 1);
  const near = knobCamera(f.knob('where'), f.knob('whereZoom'));
  const hands = handsOf(f, closing);
  // The open hand and the seed placed first, so his eyes and the camera can follow them.
  placeOpenHand(f, hands.near, closing);
  pose(f, gazeOf(f, onHim(RAISED, 0), closing), closing);
  const intoSeed: Camera = { x: SEED.x, y: SEED.y, zoom: f.knob('whereZoom') * INTO_SEED };
  const cam: Camera =
    closing > 0
      ? rowCam
      : shotPath(rowCam, [
          [f.at('onRow'), pushOn(rowCam, row('creep'), 1)],
          [f.at('push'), near, pushInto],
          [f.at('onHand'), pushOn(near, row('creep'), 1)],
          [f.at('through'), intoSeed, pushInto],
        ]);
  const [fx, fy] = L.lead;
  piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
    role: 'scenery',
    kind: 'torn',
    torn: 4,
    shadow: 0,
  });
  shafts(ctx, w, h);
  const breath = closing > 0 ? 0 : 1 - f.at('still');
  camera(
    ctx,
    cam,
    w,
    h,
    () => {
      cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
      contact(ctx, fx, fy + 2, 95);
      rowShadows(f, OPEN.home);
      at(ctx, { x: fx, y: fy }, () =>
        f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
      );
      others(f, closing);
      handAt(f, hands.far);
      const slid = (i: number) => f.stagger('slide', i, MERIT_COUNT);
      if (f.at('offer') > 0 && closing <= 0) {
        const holding = f.at('slide') > 0 ? onHim(RAISED, 0) : hands.far;
        merits(ctx, holding[0], holding[1], slid, SMALL_LINE);
      }
      handAt(f, hands.near);
      // Over his near hand, so it lands on it.
      openHand(f);
      seedInHand(f, closing);
    },
    breath,
  );
  return cam;
};

/** Where world point `p` lands on the frame through `cam`, unturned and as framed. */
const onScreen = (f: LookFrame, cam: Camera, p: Pt): Pt => {
  const z = cam.zoom ?? 1;
  return [(p[0] - cam.x) * z + f.w / 2, (p[1] - cam.y) * z + f.h / 2];
};

/** How far from (`x`, `y`) the frame's farthest corner stands, a little past it: a porthole that wide covers the frame. */
const covering = (f: LookFrame, [x, y]: Pt) =>
  Math.max(
    Math.hypot(x, y),
    Math.hypot(f.w - x, y),
    Math.hypot(x, f.h - y),
    Math.hypot(f.w - x, f.h - y),
  ) + 8;

/** `draw` (a shot of its own, taking none of the scene's breath) seen through a round porthole about (`x`, `y`), `r` across, at `alpha`. */
const porthole = (f: LookFrame, [x, y]: Pt, r: number, alpha: number, draw: () => void) => {
  const { ctx } = f;
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.clip();
  inset(ctx, draw);
  ctx.restore();
};

// ─── the camp ────────────────────────────────────────────────────────────────

/** The Board's panel, Board pixels: where the sun's shafts fan from and how far. */
const PANEL = { w: 1536, h: 1024 } as const;
/** Where the camp's planes line up while the camera sits on it: the panel's middle. */
const CAMP_REST: Pt = [768, 512];
/** The air the camp's far planes fade into, the sky's pale gold at the horizon, and how thick it lies. */
const CAMP_AIR = { haze: '#f6dcc0', thickness: 1.5 } as const;

/** The camp's people as "looks" and "lives" reach them, one after another out from the pole (the climber looks only later). */
const CROWD: ReadonlyArray<CamperName> = [
  'broad',
  'tallBack',
  'womanRight',
  'womanLeft',
  'child',
  'tallLeft',
  'elder',
];
/** The bitten when the camp opens, five of them (the climber not yet), and how badly: each stooped over its bite until it lives. */
const BITTEN: Readonly<Partial<Record<CamperName, number>>> = {
  tallLeft: 0.75,
  womanLeft: 0.55,
  broad: 0.65,
  womanRight: 0.4,
  elder: 0.85,
};
/** How far the worst bitten stoops toward its turn from its feet, radians, and drops its head (against its furthest tip back). */
const STOOP = { lean: 0.08, head: 0.5 } as const;
/** The camp's breath: its period, seconds, and how far apart in it each person breathes. */
const CAMP_BREATH = { period: 4.3, apart: 1.3 } as const;

/** `x` past `a` toward `b`, smoothed: 0 at `a`, 1 at `b`. */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Person `who`'s breath now, radians. */
const breathOf = (f: LookFrame, who: CamperName) =>
  ((f.t + CAMP_BREATH.apart * CAMP_ORDER.indexOf(who)) * 2 * Math.PI) / CAMP_BREATH.period;

/**
 * One of the camp's people (not the climber) now: the bitten stooped over
 * their bites; on "looks" each turning to the pole and tipping its head
 * back to the serpent, and on "lives" the bitten straightening, in turn out
 * from the pole; its head half down again to watch the climber while he
 * climbs.
 */
const crowdPose = (f: LookFrame, who: CamperName): CamperPose => {
  const home = stand(who);
  const i = CROWD.indexOf(who);
  const up = f.stagger('lookUp', i, CROWD.length);
  const hurt = (BITTEN[who] ?? 0) * (1 - f.stagger('lives', i, CROWD.length));
  const watching = clamp(f.at('toPole') - f.at('gaze'));
  const toPole = home.x < POLE.x ? 1 : -1;
  const facing = lerp(home.facing, 0.75 * toPole, up);
  return {
    ...home,
    facing,
    lift: lerp(lerp(-STOOP.head * hurt, 0.9, up), 0.45, watching),
    lean: STOOP.lean * hurt * Math.sign(facing),
    breath: breathOf(f, who),
  };
};

/**
 * Where the climber goes to climb, at the pole's foot left of it, his side
 * against it (his feet, Board pixels), how high he gets up it, how many
 * heaves it takes and how much of each he slips back, how many steps he
 * takes to it, and how hard he shakes as he strains (Board pixels, and how
 * fast, radians a second).
 */
const CLIMB = {
  at: [POLE.x - 112, 834],
  high: 230,
  heaves: 3,
  slip: 0.3,
  steps: 3,
  shake: 1.6,
  shakeRate: 47,
} as const;

/** Where his hands come up to once he lives, glad, before his chest: out from his middle against his shoulders' half-width, and up from his feet against his height. */
const GLAD_HANDS = { x: 0.8, y: 0.6 } as const;

/** How far up the pole he has heaved himself, `k` of the way through his climb (0 at its foot, 1 at the top he reaches), and which of his hands is high (0 his left, 1 his right). */
const heave = (k: number) => {
  const n = CLIMB.heaves;
  const u = clamp(k) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const w = u - i;
  const gain = 1 - CLIMB.slip;
  const swap = smooth(0.05, 0.4, w);
  return {
    up: (i * gain + smooth(0, 0.5, w) - CLIMB.slip * smooth(0.6, 1, w)) / (n * gain),
    left: i % 2 === 0 ? swap : 1 - swap,
  };
};

/**
 * The climber now: on "bitten" starting as the snake strikes, then bent to
 * his foot while the others look up; on `harder` going to the pole and
 * heaving himself up it, his hands on it, his feet against it, shaking with
 * the strain; on `climb` stopping, sliding down, turning from it and
 * looking up; on "pole" lifting his hands, glad.
 */
const climberPose = (f: LookFrame): CamperPose => {
  const home = stand('climber');
  const b = bodyOf('climber');
  const s = home.scale;
  const go = f.at('toPole');
  const k = f.at('climbing');
  const slip = f.at('slip');
  const turn = f.at('turn');
  const stop = f.at('stop');
  const bent = f.at('bend') * (1 - go);
  const heal = f.at('heal');
  const climbed = heave(k);
  const height = CLIMB.high * climbed.up * (1 - slip);
  const grip = f.at('grip');
  const holding = grip * (1 - turn);
  const strain = grip * (1 - stop);
  const startle = f.keys('start', [
    [0, 0],
    [0.3, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const x = lerp(home.x, CLIMB.at[0], go) + strain * CLIMB.shake * Math.sin(f.t * CLIMB.shakeRate);
  const y =
    lerp(home.y, CLIMB.at[1], go) - height - 5 * Math.abs(Math.sin(Math.PI * CLIMB.steps * go));

  // His hands: at his sides; thrown up as he starts; on the pole's near face, one high and one at
  // his chest, changing over each heave; up before his chest, glad, once he lives.
  const poleX = (POLE.x - x) / s - 6;
  const hi: Pt = [poleX, -b.tall - 0.12 * b.head];
  const lo: Pt = [poleX + 2, -b.tall + 1.05 * b.head];
  const [restL, restR] = home.hands;
  const free = (p: Pt, side: number): Pt =>
    toward(
      [p[0] + 8 * side * startle, p[1] - 70 * startle],
      [side * GLAD_HANDS.x * b.shoulder, -GLAD_HANDS.y * b.tall],
      heal,
    );
  const left = toward(free(restL, -1), toward(lo, hi, climbed.left), holding);
  const right = toward(free(restR, 1), toward(hi, lo, climbed.left), holding);
  return {
    ...home,
    x,
    y,
    facing: lerp(lerp(home.facing, 1, go), 0.45, turn),
    lift: lerp(-STOOP.head * bent, 1, f.at('gaze')),
    lean: 0.1 * holding + STOOP.lean * bent,
    breath: breathOf(f, 'climber'),
    hands: [left, right],
    feet: [10 * holding + 18 * startle, 34 * holding + 14 * startle],
    ground: height < 1,
  };
};

/** How fast each snake slithers on along the sand, Board pixels a second from `desert`, and where the near one starts from its place in the panel, so it reaches his foot on "bitten". */
const SLITHER = { left: 16, middle: 9, right: 14, leftFrom: -60 } as const;

/** The scarlet snakes in the sand, slithering on, the near one striking at the climber's foot on "bitten". */
const snakes = (f: LookFrame) => {
  const { ctx } = f;
  const since = Math.max(0, f.t - f.mark('desert'));
  snake(ctx, SNAKES.middle, SLITHER.middle * since, f.t, 0);
  snake(ctx, SNAKES.right, SLITHER.right * since, f.t, 0);
  const strike = f.keys('strike', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  snake(ctx, SNAKES.left, SLITHER.leftFrom + SLITHER.left * since, f.t, strike);
};

/** The ground the pole stands in: its sand, rocks and shrubs, the people behind the pole, the pole rising with the serpent on it, the people before it, the snakes. */
const ground = (f: LookFrame) => {
  const { ctx } = f;
  sand(ctx, 'ground', f.hand('ground'));
  groundLitter(ctx);
  const climber = climberPose(f);
  const poseOf = (who: CamperName) => (who === 'climber' ? climber : crowdPose(f, who));
  for (const who of CAMP_ORDER) if (stand(who).y < POLE.foot) campMass(ctx, who, poseOf(who));
  poleAndSerpent(ctx, f.at('rise'), f.at('lit'), f.hand('mound'));
  for (const who of CAMP_ORDER) if (stand(who).y >= POLE.foot) campMass(ctx, who, poseOf(who));
  snakes(f);
};

/** The camp's camera: creeping over it; closing on the climber; back over it, the pole risen in it; on the pole's lower half and up it; down with him; on his head. */
const campCamera = (f: LookFrame): Camera => {
  const wide = knobCamera(f.knob('camp'), f.knob('campZoom'));
  const pole = knobCamera(f.knob('pole'), f.knob('poleZoom'));
  const foot = knobCamera(f.knob('climb'), f.knob('climbZoom'));
  return shotPath(wide, [
    [f.at('camp'), pushOn(wide, f.knob('campCreep'), 1)],
    [f.at('toClimber'), knobCamera(f.knob('bitten'), f.knob('bittenZoom')), pushInto],
    [f.at('wide'), pole, pushInto],
    [f.at('onPole'), pushOn(pole, f.knob('campCreep'), 1)],
    [f.at('onClimb'), foot, pushInto],
    [f.at('up'), knobCamera(f.knob('climbUp'), f.knob('climbUpZoom'))],
    [f.at('down'), foot],
    [f.at('close'), knobCamera(f.knob('face'), f.knob('faceZoom')), pushInto],
  ]);
};

/**
 * The camp in its planes (`look.pole`), farthest first: the sky and the
 * dunes; the far sand and its tents; the near sand and its tents, the sun's
 * shafts over them; the ground with the pole, the people and the snakes;
 * the near rocks and shrubs. Pushed `push` closer than its camera frames it.
 */
const campShot = (f: LookFrame, push = 1) => {
  const { ctx, w, h } = f;
  const cam = pushOn(campCamera(f), push, 1);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.2,
        draw: () => {
          campSky(ctx);
          dunes(ctx, f.hand('dunes'));
        },
      },
      {
        z: 1.1,
        draw: () => {
          sand(ctx, 'far', f.hand('farSand'));
          tents(ctx, 'far', f.hand('farTents'));
        },
      },
      {
        z: 1.05,
        draw: () => {
          sand(ctx, 'near', f.hand('nearSand'));
          tents(ctx, 'near', f.hand('nearTents'));
          shafts(ctx, PANEL.w, PANEL.h);
        },
      },
      { z: 1, draw: () => ground(f) },
      { z: 0.95, draw: () => nearLitter(ctx) },
    ],
    { rest: CAMP_REST, haze: CAMP_AIR.haze, thickness: CAMP_AIR.thickness, drift: 0 },
  );
};

// ─── the camp from low on the ground ─────────────────────────────────────────

/** How much more the serpent's light swells on "Son" in the low view. */
const SON_GLOW = 0.6;

/** One of the camp's people in the low view: living, its head tipped back, looking up the pole. */
const lowPose = (f: LookFrame, who: CamperName): CamperPose => {
  const row = LOW_ROW[who];
  return {
    ...stand(who),
    x: row.at[0],
    y: row.at[1],
    scale: row.scale,
    facing: row.facing,
    lift: 1,
    breath: breathOf(f, who),
    ground: false,
  };
};

/** The low view's camera: on the heads along the frame's foot and the pole going up, tilting up it to the serpent high against the sky. */
const lowCamera = (f: LookFrame): Camera =>
  shotPath(knobCamera(f.knob('low'), f.knob('lowZoom')), [
    [f.at('tilt'), knobCamera(f.knob('lifted'), f.knob('liftedZoom'))],
  ]);

/** The serpent's coils high on the pole in the low view, Board pixels: what goes into the open hand as the camp closes into it. */
const LOW_AIM: Pt = [768, 330];

/** The low view's people along the frame's foot, back to front by their feet. */
const LOW_ORDER: ReadonlyArray<CamperName> = [...CAMP_ORDER].sort(
  (a, b) => LOW_ROW[a].at[1] - LOW_ROW[b].at[1],
);

/**
 * The camp from low on the ground (`look.lifted`), farthest first: the sky
 * with the sun's shafts, the hills, the tents at the edges, the pole with
 * the serpent lifted high on it, the people's heads along the frame's foot;
 * the camera tilting up the pole to the serpent.
 */
const lowShot = (f: LookFrame) => {
  const { ctx, w, h } = f;
  const cam = lowCamera(f);
  const swell = f.keys('son', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0.5, 'inOutSine'],
  ]);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: 1.25,
        draw: () => {
          lowSky(ctx);
          shafts(ctx, PANEL.w, PANEL.h);
        },
      },
      { z: 1.12, draw: () => lowHills(ctx, f.hand('lowHills')) },
      { z: 1.05, draw: () => lowCamp(ctx, f.hand('lowCamp')) },
      { z: 1, draw: () => liftedSerpent(ctx, 1 + SON_GLOW * swell) },
      {
        z: 0.92,
        draw: () => {
          for (const who of LOW_ORDER) campMass(ctx, who, lowPose(f, who));
        },
      },
    ],
    { rest: CAMP_REST, haze: CAMP_AIR.haze, thickness: CAMP_AIR.thickness, drift: 0 },
  );
};

// ─── the card ────────────────────────────────────────────────────────────────

/** The card's one word, the payoff, its full stop dropped: "look". */
const lookOnly = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> =>
  words.filter((w) => w.payoff).map((w) => ({ ...w, text: w.text.replace(/[.,!?]+$/, '') }));

// ─── the scene ───────────────────────────────────────────────────────────────

export const look = drawing({
  timeline,
  knobs,
  // The court's rigs: him and his hands.
  rigs: COURT_RIGS,
  // The page's own light, as word, seed and spoke leave it.
  light: L.light,
  draw: (f) => {
    // The low view, until the camp closes into the open hand in the row after the last word.
    if (f.at('low') >= 1) {
      const pull = f.at('pull');
      if (pull <= 0) {
        lowShot(f);
        return;
      }
      const cam = page(f, 1);
      const middle = onScreen(f, cam, FAITH_MIDDLE);
      const from = covering(f, middle);
      const r = from * ((ICON_R * (cam.zoom ?? 1)) / from) ** pull;
      // The serpent slides to the porthole's middle and the camp shrinks after it, slower than the
      // porthole so it fills it to the last, into the open hand.
      const pivot = toward(middle, onScreen(f, lowCamera(f), LOW_AIM), pull);
      const shrink = Math.sqrt(r / from);
      porthole(f, middle, r, 1 - smooth(0.7, 1, pull), () => {
        f.ctx.save();
        f.ctx.translate(middle[0], middle[1]);
        f.ctx.scale(shrink, shrink);
        f.ctx.translate(-pivot[0], -pivot[1]);
        lowShot(f);
        f.ctx.restore();
      });
      return;
    }
    // The camp, once it has opened out of the seed.
    const iris = f.at('iris');
    if (iris >= 1) {
      campShot(f);
      return;
    }
    const cam = page(f, 0);
    if (iris <= 0) return;
    const seed = onScreen(f, cam, [SEED.x, SEED.y]);
    const from = Math.max(2, (SEED.size / 2) * (cam.zoom ?? 1));
    const r = from * (covering(f, seed) / from) ** iris;
    shine(f.ctx, seed[0], seed[1], IRIS_GLOW.reach * r, GOLD_GLOW, IRIS_GLOW.alpha * (1 - iris));
    // The camp opens from the seed: the tents' line in the porthole's middle at first, the camp
    // sliding home to its framing as the porthole fills the frame.
    const push = lerp(IRIS_PUSH, 1, iris);
    const aim = onScreen(f, pushOn(campCamera(f), push, 1), IRIS_AIM);
    porthole(f, seed, r, 1, () => {
      f.ctx.save();
      f.ctx.translate((seed[0] - aim[0]) * (1 - iris), (seed[1] - aim[1]) * (1 - iris));
      campShot(f, push);
      f.ctx.restore();
    });
  },
  cards: [
    {
      cue: 'card',
      from: 'look',
      to: 'lifted',
      payoff: 'look',
      draw: (f, words) => fullCard(f, lookOnly(words), CARD_STYLE),
    },
  ],
});
