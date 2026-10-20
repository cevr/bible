// Within, drawn to its Board (within.command, within.write, within.bed,
// within.arose). It opens on the page as `robe` closes: the accused beside the
// row of three icons, the white cloth glowing. On `power` his eyes go to the
// green blade, and on "power" it pulses while the open hand and the cloth dim.
// On `remember`, a breath of the temple court in woman.told's layout: Christ
// sends the woman out on "go,"; then the accused beside the two tablets,
// asking on "mocking", shaking his head on "No.". On `command` the tablets
// part and the seed drops out of their light, opens and swells. On `write` the
// law settles into his chest, its ten lines lit there, and Hebrews 8:10 turns
// in over him and floods into the one-word card "hearts". On `bed`, the house
// in Capernaum in roof's layout: the man on his bed strains up and falls back,
// twice. On `we` the accused on the page in the same pose, a strip of the page
// over his feet holding them fast. On `arose` the room again: on "arise," the
// man sits up, stands with his bed rolled in his arms and walks out through
// the crowd; then the accused, the strip tearing off his feet on "man", steps
// on "arose." into the morning's gold, his face on the frame's upper third.
// The narration's words are on the verse's page and the card alone.
//
// Held, each a blocked paper mass at the cast band's height (its place, its
// gross motion, its pose's outline at most; no face, no cloth, plain circle
// hands): the woman of John 8, the man of Capernaum and his bed, the four at
// the hole in the roof, the crowd in the house. The accused and Christ are
// their rigs as they stand.

import {
  type Box,
  type Camera,
  type CardWord,
  type Frame,
  type Light,
  at,
  camera,
  drawing,
  fullCard,
  knobCamera,
  measure,
  multiplane,
  pushOn,
  rounded,
  shotPath,
  unprobed,
  verse,
  write,
} from '@bible/film/canvas';
import { type Key, clamp, lerp } from '@bible/film/core';
import { EASE, type Expression, type Pt, acted, boilTime } from '@bible/film/style';
import { CARD_STYLE, VERSE_STYLE } from '../card.ts';
import { LANDING_RIGS, living } from '../court-cast.ts';
import { contact } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { type CamperName, type CamperPose, bodyOf, campMass, stand } from '../look-props.ts';
import {
  GOLD_GLOW,
  PAGE,
  TABLET,
  type TabletsPose,
  cast,
  goldLine,
  shafts,
  tablets,
  tabletsAt,
} from '../page-set.ts';
import { type OpenSeedPose, openSeed, glow as shine } from '../props.ts';
import { CHRIST_KNOBS } from '../rigs/christ-rig.ts';
import { LEAD, LEAD_KNOBS, TUNIC, reachHands } from '../rigs/lead-rig.ts';
import { ICON_BOX, ON_HAND, ROW, bladeIcon, clothIcon, faithIcon } from '../spoke-props.ts';
import {
  BAND,
  BEARERS,
  CHRIST_TALL,
  CROWD,
  type Held,
  type LyingPose,
  NEAR,
  ROPES,
  SIDES,
  SLACK,
  bedGathered,
  bedShadow,
  heldPose,
  heldScale,
  hipOn,
  hold,
  holeShafts,
  holeSky,
  lyingHead,
  lyingMass,
  rollMass,
  rope,
  roomCeiling,
  roomFloor,
  roomWall,
  templeFar,
  templeFloor,
  templeNear,
  templeWall,
  traceHole,
} from '../within-props.ts';
import { spoke } from './spoke.ts';
import { LAST_FRAME, onHim, word } from './word.ts';

// ─── the page as `robe` leaves it ────────────────────────────────────────────

const L = LAST_FRAME;

/** His breath's period and its offset, as word, seed, spoke and look breathe him (`living`). */
const BREATH = { period: 4, offset: 2.1 } as const;

/** His head's tip as spoke and look leave him, lifted, and how far it sways. */
const LIFT = 0.05;
const SWAY = 0.012;

/**
 * He is plain: `robe` took the stain away, and the kept panels
 * (`within.command`, `within.arose`) draw no stain or seal on him.
 */
const PLAIN = 0;

/**
 * The icons in the row, left to right (`spoke.brings`): where each stands,
 * its size, how wide it stands on the page (its shadows' half-width).
 */
const ICONS = [
  { at: ROW.faith, box: ICON_BOX.faith, foot: 70 },
  { at: ROW.cloth, box: ICON_BOX.cloth, foot: 125 },
  { at: ROW.blade, box: ICON_BOX.blade, foot: 14 },
] as const;
type Icon = (typeof ICONS)[number];

/** An icon's light (spoke's and look's): its reach against its size, how much, and how far it pops as it pulses. */
const ICON_LIGHT = { reach: 0.65, alpha: 0.85, pop: 0.08 } as const;
/** How much more the blade's light swells as it pulses (look's open hand's). */
const PULSE = 0.35;
/** How much more the cloth glows as `robe` leaves it, its light going out as it dims. */
const CLOTH_GLOW = 0.35;
/** The shadows the icons lay on the page (spoke's): their cast's darkness, and their foot's. */
const ICON_SHADE = { cast: 0.5, foot: 0.8 } as const;
/** How the open hand and the cloth dim (look's): the page's paper laid over each, how much at its middle, and how far it reaches against the icon's size. */
const DIM = { alpha: 0.55, reach: 0.95 } as const;

// ─── the lead ────────────────────────────────────────────────────────────────

/** Where he looks at us, from his feet. */
const US: Pt = [LEAD_KNOBS.gazeX, LEAD_KNOBS.gazeY];

/** How far from where he looks at us his eyes' target stands as he reads a thing on the page, his units (spoke's and look's). */
const READ = 130;

/** "It brings power.": glad, as spoke and look leave him. */
const GLAD: Expression = { ...EASE, browY: -1.5, browTilt: 0.06, eyes: 1.12, mouth: 0.6 };
/** Reading the blade as it is named. */
const READING: Expression = { ...EASE, browY: -1, browTilt: 0.1, eyes: 1.06, mouth: 0.3 };
/** "Is He mocking her?": the brows up, asking (`word`'s question). */
const ASKING: Expression = { ...EASE, browY: -2.4, browTilt: 0.18, eyes: 1.1, mouth: -0.2 };
/** "No.": at ease, the start of a smile. */
const SURE: Expression = { ...EASE, browY: -1.2, browTilt: 0.06, eyes: 1.04, mouth: 0.7 };

/** Where he looks at the tablets beside him, from his feet (`word`'s). */
const AT_TABLETS: Pt = [330, -170];
/** As the seed opens: wonder. */
const WONDER: Expression = { ...EASE, browY: -2, browTilt: 0.16, eyes: 1.15, mouth: 0.4 };
/** "His own life": glad. */
const ALIVE: Expression = { ...EASE, browY: -2.2, browTilt: 0.1, eyes: 1.14, mouth: 1.1 };
/** Where he looks down at his own chest, from his feet (`word`'s). */
const AT_CHEST: Pt = [-10, -150];
/** The law settling into him: down at his chest, wondering. */
const RECEIVING: Expression = { ...EASE, browY: -1.7, browTilt: 0.14, eyes: 1.08, mouth: 0.5 };
/** "into their mind,": up at us again, warmed. */
const WARMED: Expression = { ...EASE, browY: -1.9, browTilt: 0.06, eyes: 1.1, mouth: 1.2 };
/** How far his head bows as he looks down at his chest, units, and how far his eyes drop with it, units of gaze. */
const BOW = { nod: 6, down: 140 } as const;
/** His head's shake on "No.": how far it rocks, radians, and his eyes with it, units; how many times. */
const SHAKE = { tilt: 0.06, gaze: 45, times: 2 } as const;

/** His numbers (scratch: every one he moves is rewritten each frame). */
const LN: Record<keyof typeof LEAD_KNOBS, number> = { ...LEAD_KNOBS };
/** The seed on the open hand (scratch: its pose rewritten each frame). */
const SEED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: ON_HAND.rot,
  size: ON_HAND.size,
  open: 0,
  grown: 1,
  glow: ON_HAND.glow,
  line: 5,
  shown: 1,
};

const timeline = {
  // `power`: his eyes go to the blade; on "power" it pulses, its light swelling, as the open hand
  // and the cloth dim, and he is glad; the row's framing creeps on.
  toBlade: { mark: 'power', dur: 0.5, track: 'lead' },
  pulse: { mark: 'power', word: 'power', dur: 1.4, track: 'icons' },
  dim: { mark: 'power', word: 'power', dur: 0.9, ease: 'inOutSine', track: 'icons' },
  glad: { mark: 'power', word: 'power', dur: 0.5, track: 'lead' },
  onRow: { mark: 'power', until: 'remember', ease: 'linear', track: 'camera' },
  // `remember`: a breath's callback to `woman` in its layout (woman.told), Christ facing her in the
  // temple court; on "go," His hand lifts toward the way out and she turns and walks out of frame
  // screen-left, upright, His eyes going after her.
  toCourt: { mark: 'remember', dur: 0, track: 'shot' },
  onCourt: {
    mark: 'remember',
    until: { cue: 'toLaw', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  send: { mark: 'remember', word: 'go', offset: -0.25, dur: 1.5, track: 'christ' },
  turn: { mark: 'remember', word: 'go', dur: 0.5, track: 'woman' },
  walk: { mark: 'remember', word: 'go', offset: 0.25, dur: 1.9, ease: 'inSine', track: 'woman' },
  // Then him on the page beside the two tablets as `word` stands them: on "mocking" his eyes come
  // from them to us, asking; on "No." he shakes his head, at ease.
  toLaw: { mark: 'remember', word: 'Is', offset: -0.35, dur: 0, track: 'shot' },
  onLaw: { after: 'toLaw', until: 'command', ease: 'linear', track: 'camera' },
  ask: { mark: 'remember', word: 'mocking', offset: -0.25, dur: 0.5, track: 'lead' },
  // "No." comes after "her?" (a pin to "No" would land on "sin no more").
  no: { mark: 'remember', word: 'her', offset: 0.96, dur: 0.8, ease: 'linear', track: 'lead' },
  easy: { mark: 'remember', word: 'her', offset: 0.96, dur: 0.6, track: 'lead' },
  // `command` (within.command): the framing opens to the Board's; the tablets part on "Every
  // command", light pouring out between them, and his eyes go to them; on "seed," a gold seed
  // drops out of their light and hangs between them, his eyes following it down; on "inside" it
  // opens along its seam, the blade folded in it, and on "His own life" the light in its heart
  // wakes and the blade swells, and he is glad.
  toCommand: { mark: 'command', dur: 1.2, ease: 'inOutSine', track: 'camera' },
  onCommand: { after: 'toCommand', until: 'write', ease: 'linear', track: 'camera' },
  part: { mark: 'command', dur: 1, track: 'law' },
  kindle: { mark: 'command', word: 'command', dur: 0.9, track: 'law' },
  watch: { mark: 'command', dur: 0.5, track: 'lead' },
  drop: { mark: 'command', word: 'seed', offset: -0.55, dur: 0.8, ease: 'outSoft', track: 'seed' },
  appear: { with: 'drop', dur: 0.15, ease: 'linear', track: 'seed' },
  follow: { mark: 'command', word: 'seed', offset: -0.5, dur: 0.6, track: 'lead' },
  open: { mark: 'command', word: 'inside', until: { cue: 'life', edge: 'start' }, track: 'seed' },
  wonder: { mark: 'command', word: 'inside', dur: 0.6, track: 'lead' },
  life: { mark: 'command', word: 'His', dur: 0.9, ease: 'outCubic', track: 'seed' },
  alive: { mark: 'command', word: 'life', offset: -0.2, dur: 0.5, track: 'lead' },
  // `write`: the tablets close beside each other again and, with the seed, shrink and settle into
  // his chest, the camera going with them to him (`settle`); a warm light wakes where his heart
  // is, where the stain was, and the ten gold lines glow through his tunic, brighter on "into";
  // his eyes go down to it, and on "mind," up to us, warmed.
  settle: { mark: 'write', dur: 1.3, ease: 'inOutSine', track: 'law' },
  // As they settle: their shadows leave the page, the seed goes into the light, and their stone
  // goes, leaving their lines.
  unshadow: { mark: 'write', dur: 0.52, ease: 'inOutSine', track: 'law' },
  seedIn: { mark: 'write', offset: 0.61, dur: 0.36, ease: 'inOutSine', track: 'law' },
  bare: { mark: 'write', offset: 0.87, dur: 0.43, ease: 'inOutSine', track: 'law' },
  close: { mark: 'write', dur: 0.9, ease: 'inOutSine', track: 'law' },
  onHeart: {
    after: 'settle',
    until: { cue: 'page', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  receive: { mark: 'write', offset: 0.4, dur: 0.6, track: 'lead' },
  heart: { mark: 'write', offset: 0.8, dur: 0.9, track: 'heart' },
  lines: { mark: 'write', word: 'into', dur: 0.8, track: 'heart' },
  warmed: { mark: 'write', word: 'mind', dur: 0.6, track: 'lead' },
  // Then Hebrews 8:10 on its page (within.write), turned in over him as `cold` turns Job's in: the
  // phrase lit as far as it has been said, the highlight sweeping on with "and write them in their
  // hearts:"; on "hearts" it floods out into the card, "hearts" large in gold, until `bed`.
  page: { mark: 'write', word: 'and', offset: -0.45, dur: 0.4, ease: 'outCubic', track: 'verse' },
  sweep: {
    mark: 'write',
    word: 'and',
    until: { cue: 'flood', edge: 'start' },
    ease: 'linear',
    track: 'verse',
  },
  flood: { mark: 'write', word: 'hearts', offset: 0.45, dur: 0.45, ends: true, track: 'verse' },
  card: { mark: 'write', word: 'hearts', offset: 0.45, until: 'bed', track: 'card' },
  // `bed`: the callback to `roof` in its layout (within.bed, roof.saw): the house in Capernaum, the
  // four at the hole in its roof, the crowd round, Christ near; the man on his bed strains up
  // after "bed", his hands pressing at it, and falls back on "walk,"; again on "however", and
  // back on "wished.". The camera creeps in.
  toRoom: { mark: 'bed', dur: 0, track: 'shot' },
  onRoom: { mark: 'bed', until: { cue: 'toWe', edge: 'start' }, ease: 'linear', track: 'camera' },
  strain: {
    mark: 'bed',
    word: 'bed',
    offset: 0.12,
    until: { cue: 'fall', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  fall: { mark: 'bed', word: 'walk', dur: 0.45, ease: 'inCubic', track: 'man' },
  again: {
    mark: 'bed',
    word: 'however',
    offset: -0.1,
    until: { cue: 'back', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  back: { mark: 'bed', word: 'wished', dur: 0.45, ease: 'inCubic', track: 'man' },
  // `we`: him on the page in the man's pose, the page over his feet holding them fast, looking
  // down at them; he strains on "stop", leaning into it, his hands pressing, trembling, and falls
  // back late in "sinning,"; again on "however", and spent on "wish.", his head bowed. The
  // camera creeps in.
  toWe: { mark: 'we', dur: 0, track: 'shot' },
  onWe: { mark: 'we', until: 'arose', ease: 'linear', track: 'camera' },
  pull: {
    mark: 'we',
    word: 'stop',
    offset: -0.05,
    until: { cue: 'slip', edge: 'start' },
    ease: 'linear',
    track: 'lead',
  },
  slip: { mark: 'we', word: 'sinning', offset: 0.3, dur: 0.4, ease: 'inCubic', track: 'lead' },
  pullAgain: {
    mark: 'we',
    word: 'however',
    offset: -0.1,
    until: { cue: 'spent', edge: 'start' },
    ease: 'linear',
    track: 'lead',
  },
  spent: { mark: 'we', word: 'wish', dur: 0.5, ease: 'inCubic', track: 'lead' },
  // `arose`: the room again (roof.arise, roof.went), the ropes let go; on "said" Christ's hand
  // lifts toward the man; on "arise," he sits up, then stands with his bed gathered up in his
  // arms and walks out through the crowd to the left, His hand going down.
  toRise: { mark: 'arose', dur: 0, track: 'shot' },
  onRise: {
    mark: 'arose',
    until: { cue: 'toFree', edge: 'start' },
    ease: 'linear',
    track: 'camera',
  },
  bid: { mark: 'arose', word: 'said', dur: 0.5, ease: 'outCubic', track: 'christ' },
  sit: { mark: 'arose', word: 'arise', dur: 0.4, ease: 'outCubic', track: 'man' },
  stand: { after: 'sit', dur: 0.3, ease: 'outCubic', track: 'man' },
  go: {
    after: 'stand',
    until: { cue: 'toFree', edge: 'start' },
    ease: 'linear',
    track: 'man',
  },
  // Then him on the page as `we` left him: on "man" the page over his feet tears and flies off,
  // his eyes on them, wondering; on "arose." he steps on, his eyes lifted ahead, warmed, the
  // morning warming, the camera going with him to within.arose's framing.
  toFree: { mark: 'arose', word: 'man', offset: -0.08, dur: 0, track: 'shot' },
  onFree: { after: 'toFree', dur: 1, ease: 'inOutSine', track: 'camera' },
  tear: { mark: 'arose', word: 'man', offset: 0.05, dur: 0.5, ease: 'outCubic', track: 'cuffs' },
  step: { mark: 'arose', word: 'arose', dur: 0.6, ease: 'inOutSine', track: 'lead' },
  warm: { mark: 'arose', word: 'arose', offset: 0.15, dur: 0.6, track: 'lead' },
  morning: { mark: 'arose', word: 'arose', dur: 0.7, ease: 'inOutSine', track: 'light' },
} as const;

const knobs = {
  // The row's framing crept on toward the blade as it is named, the blade's light clear of the
  // frame's right edge.
  power: [968, 606],
  powerZoom: 1.58,
  // The temple court in woman.told's layout, a step wider so the held woman reads whole: Christ
  // and her full length, the stones between them, a column at each edge; and how far it creeps in.
  court: [768, 560],
  courtZoom: 1.25,
  courtCreep: 1.04,
  // Him and the parted tablets with the seed between them, as within.command frames them; and where
  // it creeps in to as the seed opens, toward the seed, him still whole at the frame's left.
  command: [764, 617],
  commandZoom: 1.51,
  seedIn: [810, 640],
  seedInZoom: 1.64,
  // Him alone with the law in his chest, the page empty beside him; and how far it creeps in.
  heart: [505, 640],
  heartZoom: 1.85,
  heartCreep: 1.04,
  // The house in Capernaum as within.bed frames it, the four at the hole whole at the top; and
  // how far it creeps in.
  room: [768, 470],
  roomZoom: 1.25,
  roomCreep: 1.05,
  // Him held fast on the page, whole, on the frame's left third, his feet and the page over them low
  // in the frame, the room ahead of him on the right empty; and how far it creeps in.
  we: [680, 660],
  weZoom: 1.7,
  weCreep: 1.05,
  // Him a step on, as within.arose frames him: his face on the frame's upper third, room ahead.
  free: [672, 616],
  freeZoom: 1.87,
} as const;

type WithinFrame = Frame<keyof typeof timeline & string, typeof knobs, typeof LANDING_RIGS>;

// ─── him on the page ─────────────────────────────────────────────────────────

/** `p` on the page, from his feet. */
const fromFeet = (p: Pt): Pt => [p[0] - L.lead[0], p[1] - L.lead[1]];

/** `a` toward `b` by `k`. */
const toward = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/** Where he looks to read a point on the page (`p`, from his feet): `READ` toward it. */
const readingAt = (p: Pt): Pt => {
  const dx = p[0] - US[0];
  const dy = p[1] - US[1];
  const d = Math.hypot(dx, dy) || 1;
  return [US[0] + (dx / d) * READ, US[1] + (dy / d) * READ];
};

/** Where he looks to read `icon`: its middle. */
const readingOf = (icon: Icon): Pt =>
  readingAt(fromFeet([icon.at[0] + icon.box.dx, icon.at[1] - icon.box.up]));

/** One of his hands at `p` on the page. */
const handAt = (f: WithinFrame, p: Pt) =>
  at(f.ctx, { x: p[0], y: p[1] }, () =>
    f.rive('leadHand', { timelines: [['boil', boilTime(f.boil)]], size: L.handScale }),
  );

/**
 * His hands toward `far` and `near` (from his feet, upright on the page):
 * his arms reached to them (`reachHands`, which sets his arms' numbers), so
 * each lies at its sleeve's end. Answers where each lies, from his feet.
 */
const reached = (far: Pt, near: Pt) => {
  const arms = reachHands(LN, far, near);
  return [arms.left, arms.right] as const;
};

/** His face on the row: reading the blade, glad on "power", his head lifted as spoke and look leave it. */
const rowPose = (f: WithinFrame) => {
  acted(LN, GLAD, [
    [READING, f.at('toBlade')],
    [GLAD, f.at('glad')],
  ]);
  const gaze = toward(readingOf(ICONS[1]), readingOf(ICONS[2]), f.at('toBlade'));
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = LIFT + SWAY * Math.sin(f.t * 0.7);
  LN.nod = 0;
  LN.stain = PLAIN;
};

/** Him on the page, his shadows under him, his hands at rest, with `under` drawn on the page before him and `over` in front of him. */
const him = (f: WithinFrame, under: () => void, over: () => void) => {
  const { ctx } = f;
  const [fx, fy] = L.lead;
  const hands = reached(L.hands.far, L.hands.near);
  cast(ctx, fx - 46, fx + 46, fy, LEAD.height, 0.6);
  contact(ctx, fx, fy + 2, 95);
  under();
  at(ctx, { x: fx, y: fy }, () =>
    f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
  );
  over();
  for (const p of hands) handAt(f, onHim(p, 0));
};

/**
 * The morning warming the page (within.arose's gold): how much more of the
 * sun's shafts it lays over it, and its gold light from the corner the sun
 * stands off (a share of the frame), how far it reaches against the frame's
 * width, how much.
 */
const MORNING = { shafts: 0.7, from: [0.02, 0.02], reach: 0.95, gold: 0.3 } as const;

/** The page's sheet and the sun's shafts across it, `morning` of the way warmed, and `draw` on it under `cam`. */
const onPage = (f: WithinFrame, cam: Camera, draw: () => void, morning = 0) => {
  const { ctx, w, h } = f;
  piece(ctx, rounded(w / 2, h / 2, L.sheet.w, L.sheet.h, 0), PAGE, f.handsOf(word)('page'), {
    role: 'scenery',
    kind: 'torn',
    torn: 4,
    shadow: 0,
  });
  shafts(ctx, w, h);
  if (morning > 0) {
    ctx.save();
    ctx.globalAlpha *= MORNING.shafts * morning;
    shafts(ctx, w, h);
    ctx.restore();
    const [fx, fy] = MORNING.from;
    shine(ctx, fx * w, fy * h, MORNING.reach * w, GOLD_GLOW, MORNING.gold * morning);
  }
  camera(ctx, cam, w, h, draw);
};

// ─── the row ─────────────────────────────────────────────────────────────────

/** The shadows the row lays on the page: each icon's cast down and to the right, and its foot's. */
const rowShadows = (f: WithinFrame) => {
  const { ctx } = f;
  for (const icon of ICONS) {
    const x = icon.at[0] + icon.box.dx;
    cast(ctx, x - icon.foot, x + icon.foot, icon.at[1], icon.box.tall, ICON_SHADE.cast);
    ctx.save();
    ctx.globalAlpha *= ICON_SHADE.foot;
    contact(ctx, x, icon.at[1] + 2, icon.foot);
    ctx.restore();
  }
};

/** `icon`'s light behind it, `amount` of it, at `scale` of its size. */
const iconLight = (f: WithinFrame, icon: Icon, scale: number, amount: number) => {
  const { box } = icon;
  const size = Math.sqrt(box.tall * box.wide) * scale;
  shine(
    f.ctx,
    icon.at[0] + box.dx * scale,
    icon.at[1] - box.up * scale,
    ICON_LIGHT.reach * size,
    GOLD_GLOW,
    amount,
  );
};

/** The page laid over `icon` out from its middle past its edge, `dim` of the way: it dims without showing its pieces through each other (look's). */
const dimmed = (f: WithinFrame, icon: Icon, dim: number) => {
  if (dim <= 0) return;
  const { ctx } = f;
  const { box } = icon;
  const x = icon.at[0] + box.dx;
  const y = icon.at[1] - box.up;
  const r = DIM.reach * Math.sqrt(box.tall * box.wide);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, PAGE);
  g.addColorStop(0.7, PAGE);
  g.addColorStop(1, `${PAGE}00`);
  ctx.globalAlpha *= DIM.alpha * dim;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
};

/** The row: the open hand with the seed on it and the cloth, lit and dimming on "power"; the blade pulsing, its light swelling. */
const row = (f: WithinFrame) => {
  const { ctx } = f;
  const dim = f.at('dim');
  const pop = f.keys('pulse', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  const [faith, cloth, blade] = ICONS;
  iconLight(f, faith, 1, ICON_LIGHT.alpha * (1 - dim));
  faithIcon(ctx, faith.at[0], faith.at[1], 1, SEED);
  dimmed(f, faith, dim);
  iconLight(f, cloth, 1, (ICON_LIGHT.alpha + CLOTH_GLOW) * (1 - dim));
  clothIcon(ctx, cloth.at[0], cloth.at[1], 1);
  dimmed(f, cloth, dim);
  const s = 1 + ICON_LIGHT.pop * pop;
  iconLight(f, blade, s, ICON_LIGHT.alpha + PULSE * pop);
  bladeIcon(ctx, blade.at[0], blade.at[1], s);
};

/** The page as `robe` leaves it: him beside the row, under the row's framing creeping on. */
const rowShot = (f: WithinFrame) => {
  const shot = f.knobsOf(spoke);
  const rowCam = pushOn(knobCamera(shot('row'), shot('rowZoom')), shot('creep'), 1);
  const cam = shotPath(rowCam, [[f.at('onRow'), knobCamera(f.knob('power'), f.knob('powerZoom'))]]);
  rowPose(f);
  onPage(f, cam, () =>
    him(
      f,
      () => rowShadows(f),
      () => row(f),
    ),
  );
};

// ─── the temple court (`remember`) ───────────────────────────────────────────

/** Where the court's planes line up while the camera sits on it: the panel's middle. */
const COURT_REST: Pt = [768, 512];
/** The air the court's far planes fade into, the sky's pale gold low down, and how thick it lies. */
const TEMPLE_AIR = { haze: '#f7e0c8', thickness: 1.4 } as const;

/** Christ in the court, as woman.told stands Him to her right: His feet, His size. */
const CHRIST_AT = { x: 1010, y: 905, scale: 1.15 } as const;
/** His hands at rest from His feet, His units, the one toward her first; and where that one lifts to on "go,". */
const CHRIST_HANDS: readonly [Pt, Pt] = [
  [-104, -205],
  [98, -198],
];
const SENDING: Pt = [-150, -250];
/** His circle hands' size against the hand rig's (`court-cast.ts`). */
const CHRIST_HAND = 1.08;
/** Christ: kind, the brows easy, the smile court-12 draws in His beard (`court`'s). */
const KIND: Expression = { ...EASE, browY: -0.8, browTilt: 0.1, mouth: 3 };
/** Christ's numbers (scratch: every one He moves is rewritten each frame). */
const CN: Record<keyof typeof CHRIST_KNOBS, number> = { ...CHRIST_KNOBS };

/**
 * The woman of John 8, held (a blocked mass at the band's height, no face,
 * no cloth): where she stands facing Him, her turn to Him and away, her
 * head lifted to Him and level as she goes; where her feet are once she is
 * gone past the frame's left edge, how many steps she takes, how high each
 * lifts her and how far she leans into the walk.
 */
/** Where in the breath she is against the crowd, radians: she breathes on her own. */
const WOMAN_BREATH = 1.02;
const WOMAN = {
  x: 560,
  y: 915,
  facing: 0.5,
  away: -0.65,
  lift: 0.35,
  upright: 0.08,
  out: -280,
  steps: 4,
  bob: 7,
  lean: -0.04,
} as const;
/** How far her hands swing with her steps, her units. */
const SWING = 10;

/** Her size: the band's against Christ's as He stands here. */
const WOMAN_SCALE = heldScale('womanLeft', BAND.woman, CHRIST_AT.scale);

/** The woman now: facing Him, her head lifted; on "go," turned away and walking out, upright. */
const womanPose = (f: WithinFrame): CamperPose => {
  const home = stand('womanLeft');
  const turn = f.at('turn');
  const walk = f.at('walk');
  const walking = walk > 0 && walk < 1 ? 1 : 0;
  const phase = Math.PI * WOMAN.steps * walk;
  const [left, right] = home.hands;
  return {
    ...home,
    x: lerp(WOMAN.x, WOMAN.out, walk),
    y: WOMAN.y - WOMAN.bob * Math.abs(Math.sin(phase)) * walking,
    scale: WOMAN_SCALE,
    facing: lerp(WOMAN.facing, WOMAN.away, turn),
    lift: lerp(WOMAN.lift, WOMAN.upright, turn),
    lean: WOMAN.lean * walking,
    breath: (f.t * 2 * Math.PI) / CROWD_BREATH.period + WOMAN_BREATH,
    hands: [
      [left[0] + SWING * Math.sin(phase) * walking, left[1]],
      [right[0] - SWING * Math.sin(phase) * walking, right[1]],
    ],
  };
};

/** Where her face is, Board pixels, as she stands in `p`. */
const womanFace = (p: CamperPose): Pt => [p.x, p.y - 0.84 * 366 * p.scale];

/** Where Christ stands in a place: His feet, His size. */
interface Standing {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** One of Christ's circle hands at `p` (from His feet, His units), as He stands at `place`. */
const christHand = (f: WithinFrame, place: Standing, p: Pt) => {
  const { x, y, scale } = place;
  at(f.ctx, { x: x + p[0] * scale, y: y + p[1] * scale, scale }, () =>
    f.rive('christHand', { timelines: [['boil', boilTime(f.boil)]], size: CHRIST_HAND }),
  );
};

/** Christ facing her, kind; His hand lifting toward the way out on "go,", His eyes going after her. */
const christInCourt = (f: WithinFrame, her: CamperPose) => {
  const { ctx } = f;
  const { x, y, scale } = CHRIST_AT;
  acted(CN, KIND, []);
  // His eyes on her face, going after her as she walks out.
  const [fx, fy] = womanFace(her);
  CN.gazeX = (fx - x) / scale;
  CN.gazeY = (fy - y) / scale;
  CN.tilt = -0.04 + 0.015 * Math.sin(f.t * 0.7);
  CN.lean = 0;
  CN.nod = 0;
  cast(ctx, x - 76 * scale, x + 76 * scale, y, 0.75 * CHRIST_TALL * scale, 0.32);
  contact(ctx, x, y + 2, 100 * scale);
  at(ctx, { x, y, scale }, () => f.rive('christ', { timelines: living(f, 5, 3.4), numbers: CN }));
  const lift = f.keys('send', [
    [0, 0],
    [0.35, 1, 'outCubic'],
    [1, 0, 'inOutSine'],
  ]);
  christHand(f, CHRIST_AT, toward(CHRIST_HANDS[0], SENDING, lift));
  christHand(f, CHRIST_AT, CHRIST_HANDS[1]);
};

/**
 * The temple court in its planes (woman.court, woman.told), farthest first:
 * the sky, the city and the cypresses; the balustrade, the far columns and
 * the steps under the sun's shafts; the floor with the stones, Christ and
 * the woman; the near columns at the frame's edges.
 */
const courtShot = (f: WithinFrame) => {
  const { ctx, w, h } = f;
  const wide = knobCamera(f.knob('court'), f.knob('courtZoom'));
  const cam = shotPath(wide, [[f.at('onCourt'), pushOn(wide, f.knob('courtCreep'), 1)]]);
  const her = womanPose(f);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      { z: 1.3, draw: () => templeFar(ctx, f.hand('templeFar')) },
      { z: 1.12, draw: () => templeWall(ctx) },
      {
        z: 1,
        draw: () => {
          templeFloor(ctx);
          christInCourt(f, her);
          campMass(ctx, 'womanLeft', her);
        },
      },
      { z: 0.94, draw: () => templeNear(ctx) },
    ],
    { rest: COURT_REST, haze: TEMPLE_AIR.haze, thickness: TEMPLE_AIR.thickness, drift: 0 },
  );
};

// ─── the page and the law (`remember`, `command`) ────────────────────────────

/** One tablet as `word` leaves them beside him, its lines lit (scratch: rewritten for each tablet). */
const ONE: TabletsPose = tabletsAt(L.tablets[0], L.tablets[1]);

/**
 * Where the tablets stand: the near one's bottom-left corner as `word`
 * leaves it, which stays; the far one's, as `word` leaves it and parted to
 * within.command's gap, wide enough for the seed with room either side.
 */
const TABLET_FOOT = L.tablets[1];
const NEAR_TABLET = L.tablets[0];
const FAR_TABLET = { from: L.tablets[0] + TABLET.w + TABLET.gap, to: 975 } as const;

/** The light pouring out between the parted tablets: how high up them from their foot, how far it reaches, how much. */
const GAP_LIGHT = { up: 150, r: 190, amount: 0.85 } as const;

/**
 * The seed out of their light (within.command): where it hangs between them
 * (its middle's height), how high it drops from, how tall it stands; how
 * much its heart's light shows falling, hanging, and woken; how curled the
 * blade lies before His life swells it; how far it bobs as it hangs.
 */
const SEED_DROP = { y: 715, from: 500, size: 120, bob: 3 } as const;
const SEED_GLOW = { falling: 0.9, rest: 0.35, alive: 1.15 } as const;
const CURLED = 0.3;

/** The seed between the tablets (scratch: its pose rewritten each frame). */
const DROPPED: OpenSeedPose = {
  x: 0,
  y: 0,
  rot: 0,
  size: SEED_DROP.size,
  open: 0,
  grown: CURLED,
  glow: 0,
  line: 5,
  shown: 0,
};

/** How far apart the tablets stand now: parted on "Every command", closed again as they settle into him. */
const apart = (f: WithinFrame) => f.at('part') * (1 - f.at('close'));

/** The far tablet's corner now. */
const farTablet = (f: WithinFrame) => lerp(FAR_TABLET.from, FAR_TABLET.to, apart(f));

/** The middle of the gap between the tablets now: the pair's middle, where the seed hangs. */
const gapMiddle = (f: WithinFrame) => (NEAR_TABLET + TABLET.w + farTablet(f)) / 2;

/**
 * The law into his chest (`write`): where his heart is, from his feet (where
 * the stain was), and on the page; the tablets' size there against their own,
 * closed beside each other, small enough to sit inside his tunic; how high
 * the pair lifts on its way to him.
 */
const HEART: Pt = [LEAD.stain.x, LEAD.stain.y];
const HEART_AT: Pt = onHim(HEART, 0);
const INSIDE = 0.3;
/**
 * The warm light where his heart is: how far it reaches; its warmth laid on
 * the cloth (a gold tint, so the tunic warms rather than whitens), how much,
 * and how flat it lies (its height against its width); its glow; how far it
 * breathes and how slowly; how much more it swells as the lines brighten.
 */
const HEART_LIGHT = {
  r: 80,
  tint: '#ffc24a',
  warmth: 0.5,
  flat: 0.8,
  glow: 0.35,
  breathe: 0.1,
  period: 2.2,
  lines: 0.25,
} as const;
/**
 * The ten lines in his chest: their thickness, units (the tablets' own lines,
 * thickened to read at his size), and the soft light round each that makes
 * it read through the cloth: each layer's width against the line's, and how
 * much it lays.
 */
const CHEST_LINE = {
  width: 4,
  soft: [
    [3.8, 0.16],
    [2.2, 0.32],
  ],
} as const;
/** How far inside his tunic's outline the light in his chest is held, units: clear of its ink at the sides and hem, and of his head at the top. */
const INSIDE_TUNIC = { side: 7, top: 14, hem: 8 } as const;
/** His tunic inset clear of its ink, on the page: what the light in his chest is held to. */
const TUNIC_INSIDE: ReadonlyArray<Pt> = TUNIC.map(([x, y]) =>
  onHim(
    [
      x - Math.sign(x) * INSIDE_TUNIC.side,
      clamp(y, LEAD.neck + INSIDE_TUNIC.top, LEAD.hem - INSIDE_TUNIC.hem),
    ],
    0,
  ),
);

/** The law's middle now, on the page: the pair's middle, half way up them. */
const lawMiddle = (f: WithinFrame): Pt => [gapMiddle(f), TABLET_FOOT - TABLET.h / 2];

/** The law's size `k` of the way into his chest: it shrinks ahead of its travel, so it is small before it nears his head. */
const settledSize = (k: number) => lerp(1, INSIDE, 1 - (1 - k) ** 2);

/** The canvas taken `k` of the way into his chest: the law shrinking about its middle to `INSIDE` of its size as its middle goes to his heart. */
const settling = (f: WithinFrame, k: number) => {
  if (k <= 0) return;
  const [mx, my] = lawMiddle(f);
  const s = settledSize(k);
  f.ctx.translate(lerp(mx, HEART_AT[0], k), lerp(my, HEART_AT[1], k));
  f.ctx.scale(s, s);
  f.ctx.translate(-mx, -my);
};

/** The ten lines of the tablets standing with their bottom-left corners at `xs`, the near tablet's five first: each line's ends, in the tablets' own place. */
const tabletLines = (xs: readonly [number, number]): ReadonlyArray<readonly [Pt, Pt]> => {
  const { lines } = TABLET;
  const half = (lines.length * TABLET.w) / 2 - lines.thick / 2;
  return xs.flatMap((x0) =>
    Array.from({ length: 5 }, (_, k) => {
      const share = lines.first + ((lines.last - lines.first) * k) / 4;
      const y = TABLET_FOOT - TABLET.h + TABLET.h * share;
      const x = x0 + TABLET.w / 2;
      return [
        [x - half, y],
        [x + half, y],
      ] as const;
    }),
  );
};

/**
 * The ten lines lit, without their stone, at `amount`, under the law's own
 * transform `s` times its size: each with its soft light round it, so they
 * read through his tunic once they are in him.
 */
const bareLines = (f: WithinFrame, s: number, amount: number) => {
  if (amount <= 0) return;
  const { ctx } = f;
  const lines = tabletLines([NEAR_TABLET, farTablet(f)]);
  const width = CHEST_LINE.width / s;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = HEART_LIGHT.tint;
  for (const [wide, much] of CHEST_LINE.soft) {
    ctx.save();
    ctx.globalAlpha *= much * amount;
    ctx.lineWidth = width * wide;
    ctx.beginPath();
    for (const [a, b] of lines) {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    unprobed(ctx, () => ctx.stroke());
    ctx.restore();
  }
  ctx.restore();
  for (const [a, b] of lines) goldLine(ctx, [a, b], width, amount);
};

/** The seed now: dropping out of the light between the tablets, hanging there, opening, the blade swelling; going into the light as the law settles into him. */
const seedNow = (f: WithinFrame) => {
  const drop = f.at('drop');
  const life = f.at('life');
  DROPPED.x = gapMiddle(f);
  DROPPED.y = lerp(SEED_DROP.from, SEED_DROP.y, drop) + SEED_DROP.bob * Math.sin(f.t * 1.6) * drop;
  DROPPED.rot = 0.12 * Math.sin(2 * Math.PI * drop) * (1 - drop);
  DROPPED.shown = f.at('appear') * (1 - f.at('seedIn'));
  DROPPED.open = f.at('open');
  DROPPED.grown = lerp(CURLED, 1, life);
  DROPPED.glow = lerp(lerp(SEED_GLOW.falling, SEED_GLOW.rest, drop), SEED_GLOW.alive, life);
  return DROPPED;
};

/** One tablet's shadows on the page, its bottom-left corner at `x`, `amount` of them. */
const tabletShadows = (f: WithinFrame, x: number, amount: number) => {
  if (amount <= 0) return;
  const { ctx } = f;
  cast(ctx, x, x + TABLET.w, TABLET_FOOT, TABLET.h, 0.6 * amount);
  ctx.save();
  ctx.globalAlpha *= amount;
  contact(ctx, x + TABLET.w / 2, TABLET_FOOT + 2, 0.62 * TABLET.w);
  ctx.restore();
};

/** One tablet, its bottom-left corner at `x`: its stone, `stone` of it showing, and its five lines lit, their glow swelled `swell`. */
const tablet = (f: WithinFrame, x: number, swell: number, stone: number) => {
  const { ctx } = f;
  const y = TABLET_FOOT;
  ONE.x = x;
  ONE.y = y;
  ONE.scale = 1;
  ONE.stone = stone;
  ONE.lit.fill(1);
  ONE.swell = swell;
  // The pair's near tablet alone: clipped short of where the far one stands beside it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 12, y - TABLET.h - 60, TABLET.w + 12 + TABLET.gap / 2, TABLET.h + 120);
  ctx.clip();
  tablets(ctx, ONE);
  ctx.restore();
};

/**
 * The law beside him: their shadows on the page; the two tablets, parting;
 * the light between them; the seed dropped out of it, its shadow under it.
 * On `write` the tablets close again and the pair settles into his chest,
 * its shadows leaving the page, the seed going into the light, the stone
 * going last and leaving the ten lines lit in him, brighter on "into".
 */
const law = (f: WithinFrame) => {
  const { ctx } = f;
  const settle = f.at('settle');
  const swell = f.keys('kindle', [
    [0, 0],
    [0.4, 1],
    [1, 0.5],
  ]);
  const shadows = 1 - f.at('unshadow');
  const s = seedNow(f);
  tabletShadows(f, NEAR_TABLET, shadows);
  tabletShadows(f, farTablet(f), shadows);
  if (s.shown > 0) {
    ctx.save();
    ctx.globalAlpha *= s.shown * 0.7 * shadows;
    contact(ctx, s.x, TABLET_FOOT + 2, 0.4 * s.size);
    ctx.restore();
  }
  const bare = f.at('bare');
  ctx.save();
  settling(f, settle);
  if (bare < 1) {
    tablet(f, NEAR_TABLET, swell, 1 - bare);
    tablet(f, farTablet(f), swell, 1 - bare);
    shine(
      ctx,
      gapMiddle(f),
      TABLET_FOOT - GAP_LIGHT.up,
      GAP_LIGHT.r,
      GOLD_GLOW,
      GAP_LIGHT.amount * apart(f) * (0.8 + 0.2 * swell),
    );
    if (s.shown > 0) openSeed(ctx, s);
  }
  bareLines(f, settledSize(settle), bare * lerp(0.8, 1, f.at('lines')));
  ctx.restore();
};

/** The warm light where his heart is, held inside his tunic, breathing, swelling as the lines brighten on "into". */
const heartGlow = (f: WithinFrame) => {
  const { ctx } = f;
  const lit = f.at('heart');
  const bright = f.at('lines');
  if (lit <= 0) return;
  const wave = HEART_LIGHT.breathe * Math.sin((2 * Math.PI * f.t) / HEART_LIGHT.period);
  const amount = lit * (1 + wave) * (1 + HEART_LIGHT.lines * bright);
  const r = HEART_LIGHT.r * (1 + wave / 2);
  const [hx, hy] = HEART_AT;
  ctx.save();
  // Held inside his tunic, clear of its ink and of his head: the light is in him.
  ctx.beginPath();
  TUNIC_INSIDE.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  // Its warmth on the cloth, flattened so it fades out before his chin, then its glow.
  ctx.save();
  ctx.globalAlpha *= clamp(HEART_LIGHT.warmth * amount);
  ctx.translate(hx, hy);
  ctx.scale(1, HEART_LIGHT.flat);
  const warm = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  warm.addColorStop(0, HEART_LIGHT.tint);
  warm.addColorStop(1, `${HEART_LIGHT.tint}00`);
  ctx.fillStyle = warm;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
  shine(ctx, hx, hy, 0.8 * r, GOLD_GLOW, HEART_LIGHT.glow * amount);
  ctx.restore();
};

/**
 * His face beside the law: his eyes on the tablets, to us asking on
 * "mocking", a shake of his head on "No."; back to the tablets as they part,
 * down after the seed, wonder as it opens, glad at "His own life"; down at
 * his chest as the law settles into it, and up to us on "mind,", warmed.
 */
const lawPose = (f: WithinFrame) => {
  const receive = f.at('receive') * (1 - f.at('warmed'));
  acted(LN, READING, [
    [ASKING, f.at('ask')],
    [SURE, f.at('easy')],
    [READING, f.at('watch')],
    [WONDER, f.at('wonder')],
    [ALIVE, f.at('alive')],
    [RECEIVING, f.at('receive')],
    [WARMED, f.at('warmed')],
  ]);
  const k = f.at('no');
  const shake = Math.sin(2 * Math.PI * SHAKE.times * k) * Math.sin(Math.PI * k);
  const s = seedNow(f);
  let gaze = toward(readingAt(AT_TABLETS), US, f.at('ask'));
  gaze = toward(
    gaze,
    readingAt(fromFeet([gapMiddle(f), TABLET_FOOT - GAP_LIGHT.up])),
    f.at('watch'),
  );
  gaze = toward(gaze, readingAt(fromFeet([s.x, s.y])), f.at('follow'));
  gaze = toward(gaze, AT_CHEST, f.at('receive'));
  gaze = toward(gaze, US, f.at('warmed'));
  LN.gazeX = gaze[0] + SHAKE.gaze * shake;
  LN.gazeY = gaze[1];
  LN.lean = 0;
  LN.tilt = LIFT + SWAY * Math.sin(f.t * 0.7) + SHAKE.tilt * shake;
  LN.nod = BOW.nod * receive;
  LN.gazeY += BOW.down * receive;
  LN.stain = PLAIN;
};

/**
 * Him on the page beside the law: `word.all`'s framing creeping on, then
 * within.command's, creeping in as the seed opens; to him alone as the law
 * settles into his chest, drawn over him from then on.
 */
const lawShot = (f: WithinFrame) => {
  const shot = f.knobsOf(word);
  const lawCam = knobCamera(shot('law'), shot('lawZoom'));
  const commandCam = knobCamera(f.knob('command'), f.knob('commandZoom'));
  const heartCam = knobCamera(f.knob('heart'), f.knob('heartZoom'));
  const cam = shotPath(lawCam, [
    [f.at('onLaw'), pushOn(lawCam, shot('creep'), 1)],
    [f.at('toCommand'), commandCam],
    [f.at('onCommand'), knobCamera(f.knob('seedIn'), f.knob('seedInZoom'))],
    [f.at('settle'), heartCam],
    [f.at('onHeart'), pushOn(heartCam, f.knob('heartCreep'), 1)],
  ]);
  lawPose(f);
  const inside = f.at('settle') > 0;
  onPage(f, cam, () =>
    him(
      f,
      () => {
        if (!inside) law(f);
      },
      () => {
        if (!inside) return;
        heartGlow(f);
        law(f);
      },
    ),
  );
};

// ─── Hebrews 8:10 and its card (`write`) ─────────────────────────────────────

/** Hebrews 8:10 on its page (within.write), verbatim, and the phrase the card floods from. */
const VERSE = {
  ref: 'Hebrews 8:10',
  text: 'For this is the covenant that I will make with the house of Israel after those days, saith the Lord; I will put my laws into their mind, and write them in their hearts: and I will be to them a God, and they shall be to me a people:',
  phrase: 'I will put my laws into their mind, and write them in their hearts:',
} as const;
/** How many of the phrase's words have been said as the page lands: "I will put my laws into their mind,". */
const SAID = 8;
/** The page the verse is set on, frame px (`cold`'s): the whole frame and a margin; where its text starts, its reference above it. */
const VERSE_PAGE = { w: 2000, h: 1160, text: { x: 370, y: 370 }, ref: 110 } as const;
/** The reference's type (`cold`'s). */
const REF_TYPE = {
  family: F.body,
  size: 34,
  weight: 600,
  color: C.inkSoft,
  tracking: 0.08,
} as const;

/** The share of the phrase's highlight the words said before the page lands fill, as `verse` sweeps it (each word and its pad). */
const saidShare = (ctx: CanvasRenderingContext2D) => {
  const pad = 2 * (VERSE_STYLE.pad?.x ?? VERSE_STYLE.type.size * 0.12);
  const widths = VERSE.phrase
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => measure(ctx, s, VERSE_STYLE.type) + pad);
  const total = widths.reduce((sum, x) => sum + x, 0);
  return total > 0 ? widths.slice(0, SAID).reduce((sum, x) => sum + x, 0) / total : 0;
};

/**
 * The verse's page turning in over him from the right, as `cold` turns
 * Job's; once it lies, the reference and the verse on it, the phrase lit as
 * far as it has been said and sweeping on with the voice. Returns the box the
 * card floods from.
 */
const verseShot = (f: WithinFrame): Box | void => {
  const { ctx, w, h } = f;
  const turn = f.at('page');
  if (turn < 1) lawShot(f);
  at(ctx, { x: lerp(VERSE_PAGE.w + 40, 0, turn), y: 0, rot: lerp(0.05, 0, turn) }, () =>
    piece(ctx, rounded(w / 2, h / 2, VERSE_PAGE.w, VERSE_PAGE.h, 0), C.cream, f.hand('versePage'), {
      role: 'scenery',
      kind: 'torn',
      torn: 4,
      shadow: 0,
    }),
  );
  if (turn < 1) return;
  const { x, y } = VERSE_PAGE.text;
  write(ctx, VERSE.ref, x, y - VERSE_PAGE.ref, REF_TYPE, f.hand('ref'), { boil: 0 });
  return verse(
    ctx,
    VERSE,
    VERSE_STYLE,
    { x, y, highlight: lerp(saidShare(ctx), 1, f.at('sweep')) },
    f.hand('verse'),
  );
};

/** The card's one word, the payoff, its stop and its closing quote dropped: "hearts". */
const heartsOnly = (words: ReadonlyArray<CardWord>): ReadonlyArray<CardWord> =>
  words.filter((w) => w.payoff).map((w) => ({ ...w, text: w.text.replace(/[.,:;!?”"]+$/, '') }));

// ─── the house in Capernaum (`bed`) ──────────────────────────────────────────

/** Where the room's planes line up while the camera sits on it: the room's framing. */
const ROOM_REST: Pt = [768, 470];
/**
 * The air the room's far planes fade into, the warm dust in the hole's
 * light, and how thick it lies: thick enough that the crowd behind the bed
 * stands back in it and the man on his bed stands clear of them.
 */
const ROOM_AIR = { haze: '#f1d5b2', thickness: 1.64 } as const;
/** How far back the crowd behind the bed stands, and the back wall behind them, as planes. */
const ROOM_DEPTH = { crowd: 1.2, wall: 1.3 } as const;

/** Christ in the room, as within.bed stands Him beside the bed's foot: His feet, His size. */
const CHRIST_ROOM: Standing = { x: 1130, y: 880, scale: 1.11 };

/** His size: the band's against Christ's as He stands here. */
const MAN_SCALE = heldScale('climber', BAND.man, CHRIST_ROOM.scale);
/**
 * The man on his bed (within.bed), held: his hip on the pallet; his trunk
 * raised at rest against the pillow and at the top of his strain, and his
 * head's lift above it; his hands pressing at the bed; how far and how fast
 * he trembles at the top of his strain.
 */
const MAN = {
  hip: hipOn(727, MAN_SCALE),
  rest: 0.3,
  strained: 0.78,
  head: 0.35,
  hands: [
    [548, 790],
    [652, 792],
  ],
  tremble: { rise: 0.02, rate: 11 },
  // Sat up on "arise," (roof.arise): his trunk upright from his hip, his hands beside it on the bed.
  sat: 1.42,
  satHands: [
    [668, 786],
    [800, 788],
  ],
} as const;

/** His trunk as he strains: up fast off the pillow, then held there, trembling, until he falls back. */
const STRAINING: ReadonlyArray<Key> = [
  [0, 0],
  [0.7, 1, 'outCubic'],
  [1, 1],
];

/** How each held person's breath runs in the room: its period, and how far apart their phases fall. */
const CROWD_BREATH = { period: 4.3, spread: 0.37 } as const;

/** The light from the hole where it falls on the bed, the man in it (within.bed's man in its light): its middle, its reach, its warm white, how much. */
const BED_LIGHT = { at: [640, 770], r: 260, color: '#fff1d8', amount: 0.26 } as const;

/** The man now: lying back against the pillow; up on his hands after "bed", and back on "walk,"; again on "however", and back on "wished."; sat up on "arise,". */
const manPose = (f: WithinFrame): LyingPose => {
  const up = Math.max(
    f.keys('strain', STRAINING) * (1 - f.at('fall')),
    f.keys('again', STRAINING) * (1 - f.at('back')),
  );
  const tremble = MAN.tremble.rise * Math.sin(2 * Math.PI * MAN.tremble.rate * f.t) * up * up;
  const sit = f.at('sit');
  return {
    hip: MAN.hip,
    scale: MAN_SCALE,
    rise: lerp(lerp(MAN.rest, MAN.strained, up) + tremble, MAN.sat, sit),
    head: MAN.head,
    hands: [toward(MAN.hands[0], MAN.satHands[0], sit), toward(MAN.hands[1], MAN.satHands[1], sit)],
    line: 1,
  };
};

/**
 * The man risen (roof.went), held: where he stands up in front of the bed,
 * how far left he has walked by the cut, his turn as he goes, his steps and
 * how high each lifts him, his lean into the walk; how low he comes up from
 * (his height squashed about his feet); the bed rolled up in his arms (its
 * middle from his feet, its length, its thickness and its turn, his units)
 * and his hands at its two ends.
 */
const RISEN = {
  at: [690, 905],
  walk: 380,
  facing: -0.55,
  steps: 3,
  bob: 8,
  lean: -0.04,
  low: 0.84,
  roll: { at: [-22, -172], long: 170, thick: 54, tilt: -0.06 },
  hands: [
    [-98, -158],
    [54, -162],
  ],
} as const;

/** The man risen now: standing up in front of the bed, his bed in his arms; walking out to the left. */
const risenPose = (f: WithinFrame): CamperPose => {
  const go = f.at('go');
  const walking = go > 0 && go < 1 ? 1 : 0;
  const phase = Math.PI * RISEN.steps * go;
  return {
    ...stand('climber'),
    x: lerp(RISEN.at[0], RISEN.at[0] - RISEN.walk, go),
    y: RISEN.at[1] - RISEN.bob * Math.abs(Math.sin(phase)) * walking,
    scale: MAN_SCALE,
    facing: RISEN.facing,
    lean: RISEN.lean * walking,
    breath: (f.t * 2 * Math.PI) / CROWD_BREATH.period,
    hands: RISEN.hands,
  };
};

/** How tall the risen man stands now, against his height: coming up off the bed. */
const risenHeight = (f: WithinFrame) => lerp(RISEN.low, 1, f.at('stand'));

/** The middle of the bed rolled up in the risen man's arms, Board pixels, as he stands `sy` of his height. */
const rollAt = (p: CamperPose, sy: number): Pt => [
  p.x + RISEN.roll.at[0] * p.scale,
  p.y + RISEN.roll.at[1] * p.scale * sy,
];

/** The rolled bed's length and thickness, Board pixels, at his size. */
const rollSize = (p: CamperPose): Pt => [RISEN.roll.long * p.scale, RISEN.roll.thick * p.scale];

/** Where the risen man's head is, Board pixels, as he stands `sy` of his height: what eyes on him rest on. */
const risenHead = (p: CamperPose, sy: number): Pt => {
  const b = bodyOf('climber');
  return [p.x + 0.08 * b.wide * p.facing * p.scale, p.y - (b.tall - b.head / 2) * p.scale * sy];
};

/** How far a held mass's ink stands out past its paper, its units (look-props' line, drawn under the paper at twice its width). */
const MASS_INK = 5;

/** Where `p`'s hands are, Board pixels (campMass's, its breath aside). */
const handsOnPage = (p: CamperPose): Pt[] => {
  const c = Math.cos(p.lean);
  const s = Math.sin(p.lean);
  return p.hands.map(([x, y]): Pt => [
    p.x + p.scale * (x * c - y * s),
    p.y + p.scale * (x * s + y * c),
  ]);
};

/** `who`'s hands again over what it holds in front of it: its mass drawn again within its two hands and their ink. */
const handsOver = (ctx: CanvasRenderingContext2D, who: CamperName, p: CamperPose) => {
  const r = (0.17 * bodyOf(who).wide + MASS_INK) * p.scale;
  ctx.save();
  ctx.beginPath();
  for (const [x, y] of handsOnPage(p)) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  }
  ctx.clip();
  campMass(ctx, who, { ...p, ground: false });
  ctx.restore();
};

/** The man risen, `sy` of his height as he comes up off the bed: his mass, the bed rolled in his arms, his hands at its ends. */
const risen = (f: WithinFrame, p: CamperPose, sy: number) => {
  const { ctx } = f;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, sy);
  ctx.translate(-p.x, -p.y);
  campMass(ctx, 'climber', p);
  ctx.restore();
  const [long, thick] = rollSize(p);
  rollMass(ctx, rollAt(p, sy), long, thick, RISEN.roll.tilt);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, sy);
  ctx.translate(-p.x, -p.y);
  handsOver(ctx, 'climber', p);
  ctx.restore();
};

/** Person `h` of the house, held, breathing at its own phase (`i`). */
const housePerson = (f: WithinFrame, h: Held, i: number) =>
  campMass(
    f.ctx,
    h.who,
    heldPose(
      h,
      CHRIST_ROOM.scale,
      ((f.t + i * CROWD_BREATH.spread) * 2 * Math.PI) / CROWD_BREATH.period,
    ),
  );

/** The four at the hole, still: their heads and shoulders within it, and their hands on its edge over the roof. */
const BEARER_POSES = BEARERS.map((h) => heldPose(h, CHRIST_ROOM.scale, 0));

/** The four seen through the hole: drawn within it, so the roof's edge cuts them. */
const bearersInHole = (f: WithinFrame) => {
  const { ctx } = f;
  ctx.save();
  traceHole(ctx);
  ctx.clip();
  BEARERS.forEach((h, i) =>
    campMass(ctx, h.who, { ...(BEARER_POSES[i] ?? stand(h.who)), ground: false }),
  );
  ctx.restore();
};

/** Their hands over the roof's torn edge, holding the ropes: each of the four again, within its two hands. */
const bearersHands = (f: WithinFrame) =>
  BEARERS.forEach((h, i) => {
    const p = BEARER_POSES[i];
    if (p !== undefined) handsOver(f.ctx, h.who, p);
  });

/** How far a rope sags: let down taut to the bed, and drawn up short, hanging. */
const ROPE_SAG = { held: 6, up: 9 } as const;

/** The ropes: down to the bed's ties as they let it down (`bed`); loosed and drawn up short, hanging from their hands (`arose`). */
const ropes = (f: WithinFrame) => {
  const up = f.at('toRise') >= 1;
  ROPES.forEach(([hand, tie], i) =>
    rope(f.ctx, hand, up ? (SLACK[i] ?? tie) : tie, up ? ROPE_SAG.up : ROPE_SAG.held, C.outline),
  );
};

/** Where Christ's hand lifts to toward the man as He bids him arise, from His feet, His units. */
const BIDDING: Pt = [-168, -270];

/**
 * Christ beside the bed's foot: kind, His eyes on the man's face (`head`) as
 * he strains and falls back, sits up and goes; His hands at rest, the one
 * toward the man lifting on "said" and going down again as he walks out.
 */
const christInRoom = (f: WithinFrame, head: Pt) => {
  const { ctx } = f;
  const { x, y, scale } = CHRIST_ROOM;
  acted(CN, KIND, []);
  CN.gazeX = (head[0] - x) / scale;
  CN.gazeY = (head[1] - y) / scale;
  CN.tilt = -0.03 + 0.012 * Math.sin(f.t * 0.7);
  CN.lean = 0;
  CN.nod = 0;
  cast(ctx, x - 76 * scale, x + 76 * scale, y, 0.75 * CHRIST_TALL * scale, 0.32);
  contact(ctx, x, y + 2, 100 * scale);
  at(ctx, { x, y, scale }, () => f.rive('christ', { timelines: living(f, 5, 3.4), numbers: CN }));
  const bid =
    f.at('bid') *
    (1 -
      f.keys('go', [
        [0, 0],
        [0.6, 1, 'inOutSine'],
        [1, 1],
      ]));
  christHand(f, CHRIST_ROOM, toward(CHRIST_HANDS[0], BIDDING, bid));
  christHand(f, CHRIST_ROOM, CHRIST_HANDS[1]);
};

/**
 * The house in Capernaum in its planes (within.bed, roof.saw), farthest
 * first: the back wall and its doorway, the floor; the crowd behind the bed;
 * the room's middle, the sky in the hole with the four at its edge, the roof
 * round it, the light falling through, the people at the sides, the ropes,
 * the bed with the man on it, Christ; the heads nearest us at the edges.
 */
const roomShot = (f: WithinFrame) => {
  const { ctx, w, h } = f;
  const wide = knobCamera(f.knob('room'), f.knob('roomZoom'));
  const creep = f.at('toRise') >= 1 ? f.at('onRise') : f.at('onRoom');
  const cam = shotPath(wide, [[creep, pushOn(wide, f.knob('roomCreep'), 1)]]);
  const man = manPose(f);
  const up = f.at('stand');
  const stood = risenPose(f);
  const sy = risenHeight(f);
  multiplane(
    ctx,
    cam,
    w,
    h,
    [
      {
        z: ROOM_DEPTH.wall,
        draw: () => {
          roomWall(ctx);
          roomFloor(ctx);
        },
      },
      { z: ROOM_DEPTH.crowd, draw: () => CROWD.forEach((p, i) => housePerson(f, p, i)) },
      {
        z: 1,
        draw: () => {
          holeSky(ctx, f.hand('holeSky'));
          bearersInHole(f);
          roomCeiling(ctx);
          holeShafts(ctx);
          SIDES.forEach((p, i) => housePerson(f, p, i + CROWD.length));
          ropes(f);
          bearersHands(f);
          bedShadow(ctx, C.outline, 1 - up);
          bedGathered(ctx, up, rollAt(stood, sy), rollSize(stood));
          if (up <= 0) lyingMass(ctx, man);
          shine(
            ctx,
            BED_LIGHT.at[0],
            BED_LIGHT.at[1],
            BED_LIGHT.r,
            BED_LIGHT.color,
            BED_LIGHT.amount,
          );
          if (up > 0) risen(f, stood, sy);
          christInRoom(f, up > 0 ? risenHead(stood, sy) : lyingHead(man));
        },
      },
      { z: 0.86, draw: () => NEAR.forEach((p, i) => housePerson(f, p, i + 3)) },
    ],
    { rest: ROOM_REST, haze: ROOM_AIR.haze, thickness: ROOM_AIR.thickness, drift: 0 },
  );
};

// ─── held fast, and free (`we`, `arose`) ─────────────────────────────────────

/** His strain at its top (`we`): how far he leans into it and tips his head with it, radians; how far and how fast he trembles. */
const STRAIN = { lean: 0.17, tilt: 0.08, tremble: 0.014, rate: 9 } as const;
/** His hands pressing down as he strains (the man's on his bed), his arms straight and out from his sides, from his feet. */
const PRESSING = { far: [-65, -149], near: [69, -150] } as const;
/** Where he looks, from his feet: down at his feet in the page; ahead, the way he strains to go; up ahead as he steps on (within.arose). */
const AT_FEET: Pt = [24, -40];
const AHEAD: Pt = [190, -300];
const UP_AHEAD: Pt = [300, -480];
/** His step on (within.arose): how far, how high he lifts in it, how far he leans into it; how far his hands swing. */
const STEP = { on: 80, hop: 14, lean: 0.07, swing: 12 } as const;

/** Looking down at his feet held in the page: worried. */
const HELD: Expression = { ...EASE, browY: -0.6, browTilt: 0.32, eyes: 1, mouth: -0.5 };
/** Straining against it: the brows knit and down, the eyes screwed shut, the mouth set. */
const STRIVING: Expression = {
  ...EASE,
  browY: 2.2,
  browTilt: -0.3,
  eyes: 0.2,
  eyeW: 1.15,
  mouth: -0.9,
};
/** Spent: the brows' inner ends up, the eyes low, the mouth turned down. */
const SPENT: Expression = { ...EASE, browY: -0.4, browTilt: 0.42, eyes: 0.88, mouth: -0.9 };
/** As his feet come free: wonder, the eyes wide. */
const FREED: Expression = { ...EASE, browY: -2.3, browTilt: 0.2, eyes: 1.18, mouth: 0.5 };

/** His strain now: up into it on "stop", falling back late in "sinning,"; again on "however", spent on "wish.". */
const strainNow = (f: WithinFrame) =>
  Math.max(
    f.keys('pull', STRAINING) * (1 - f.at('slip')),
    f.keys('pullAgain', STRAINING) * (1 - f.at('spent')),
  );

/** Where his feet are now against where the page held them: his step on, and his lift in it. */
const stepNow = (f: WithinFrame): Pt => {
  const k = f.at('step');
  return [STEP.on * k, -STEP.hop * Math.sin(Math.PI * k)];
};

/**
 * His face and lean held fast and freed: his eyes on his feet in the page,
 * his head bowed to them; up into the strain on "stop", leaning, his face
 * screwed up, trembling; back on "sinning,"; again on "however"; spent on
 * "wish.". On "man" his feet come free and he watches them go, wondering; on
 * "arose." he leans into his step, his eyes and his head lifted ahead,
 * warmed.
 */
const fastPose = (f: WithinFrame) => {
  const up = strainNow(f);
  const warm = f.at('warm');
  acted(LN, HELD, [
    [STRIVING, up],
    [SPENT, f.at('spent')],
    [FREED, f.at('tear')],
    [WARMED, warm],
  ]);
  let gaze = toward(AT_FEET, AHEAD, up);
  gaze = toward(gaze, UP_AHEAD, warm);
  LN.gazeX = gaze[0];
  LN.gazeY = gaze[1];
  const tremble = STRAIN.tremble * Math.sin(2 * Math.PI * STRAIN.rate * f.t) * up * up;
  LN.lean = STRAIN.lean * up + tremble + STEP.lean * Math.sin(Math.PI * f.at('step'));
  LN.tilt = STRAIN.tilt * up + LIFT * warm + SWAY * Math.sin(f.t * 0.7);
  const bowed = 1 - Math.max(up, warm);
  LN.nod = BOW.nod * bowed;
  LN.gazeY += BOW.down * bowed;
  LN.stain = PLAIN;
};

/** `side` (from his feet) turned with his lean `lean`, still from his feet. */
const leanedOn = (side: Pt, lean: number): Pt => fromFeet(onHim(side, lean));

/**
 * Him on the page, his feet held in it and freed: his shadows; him, stepping
 * on once free; the page over his feet, tearing off them on "man"; his hands
 * pressing down as he strains, swinging as he steps.
 */
const heldFast = (f: WithinFrame) => {
  const { ctx } = f;
  const [fx, fy] = L.lead;
  const off = stepNow(f);
  const x = fx + off[0];
  const up = strainNow(f);
  const swing = STEP.swing * Math.sin(Math.PI * f.at('step'));
  const far = toward(L.hands.far, PRESSING.far, up);
  const near = toward(L.hands.near, PRESSING.near, up);
  const hands = reached(
    leanedOn([far[0] - swing, far[1]], LN.lean),
    leanedOn([near[0] + swing, near[1]], LN.lean),
  );
  cast(ctx, x - 46, x + 46, fy, LEAD.height, 0.6);
  contact(ctx, x, fy + 2, 95 * (1 + off[1] / (4 * STEP.hop)));
  at(ctx, { x, y: fy + off[1] }, () =>
    f.rive('lead', { timelines: living(f, BREATH.period, BREATH.offset), numbers: LN }),
  );
  hold(ctx, L.lead, f.at('tear'), f.hand('hold'));
  for (const p of hands) handAt(f, onHim([p[0] + off[0], p[1] + off[1]], 0));
};

/**
 * Him on the page (`we`, `arose`): held fast under the `we` framing creeping
 * in; then, back from the room, freed and stepping on, the camera going with
 * him to within.arose's framing as the morning warms.
 */
const fastShot = (f: WithinFrame) => {
  const held = knobCamera(f.knob('we'), f.knob('weZoom'));
  const cam = shotPath(held, [
    [f.at('onWe'), pushOn(held, f.knob('weCreep'), 1)],
    [f.at('onFree'), knobCamera(f.knob('free'), f.knob('freeZoom'))],
  ]);
  fastPose(f);
  onPage(f, cam, () => heldFast(f), f.at('morning'));
};

/** The page's own light, lifted off the verse's page as it turns in over him (`cold`'s), and back on the page once the room has cut in. */
const pageLight = (f: WithinFrame): Light => {
  const off = f.at('page') * (1 - f.at('toRoom'));
  return {
    ...L.light,
    amount: (L.light.amount ?? 1) * (1 - off),
    vignette: (L.light.vignette ?? 1) * (1 - off),
  };
};

// ─── the scene ───────────────────────────────────────────────────────────────

export const within = drawing({
  timeline,
  knobs,
  // The court's rigs and the landing's: him and his hands, and Christ and His.
  rigs: LANDING_RIGS,
  // The page's own light, as word, seed, spoke and look leave it, lifted off the verse's page.
  light: pageLight,
  draw: (f): Box | void => {
    if (f.at('toFree') >= 1) return fastShot(f);
    if (f.at('toRise') >= 1) return roomShot(f);
    if (f.at('toWe') >= 1) return fastShot(f);
    if (f.at('toRoom') >= 1) return roomShot(f);
    if (f.at('page') > 0) return verseShot(f);
    if (f.at('toLaw') >= 1) lawShot(f);
    else if (f.at('toCourt') >= 1) courtShot(f);
    else rowShot(f);
  },
  cards: [
    {
      cue: 'card',
      from: 'write',
      to: 'bed',
      payoff: 'hearts',
      flood: { cue: 'flood' },
      draw: (f, words) => fullCard(f, heartsOnly(words), CARD_STYLE),
    },
  ],
});
