// The Canvas 2D draw kit a film draws with (ink, cut paper, paper light, type,
// floating hands (the one mitten, no arm), a multiplane camera, storyboard
// cards, credits) and the compositor that turns scenes into a film. A film's
// people live in its own kit. Only what films, their kits and their tests use
// is here; the engine's own parts (the paper's sheets, the probe's sink, the
// hand's geometry) are exported from their files for the framework and its
// tests alone.

export {
  type Hand,
  type Pt,
  type StrokeStyle,
  blob,
  ellipse,
  ellipseShape,
  length,
  line,
  plate,
  quad,
  rectShape,
  rounded,
  spline,
  stroke,
  sub,
  trim,
} from './ink.ts';
export { type Place, at, cutout } from './cutout.ts';
export { type PieceStyle, piece } from './piece.ts';
export { ground } from './ground.ts';
export { type Hex, clearOf, mix } from './colour.ts';
export { glow, sky, wash } from './glow.ts';
export { type Brush, type Painting, drawPainting } from './paint.ts';
export { motes, rays, rain, stars } from './atmosphere.ts';
export { type Posed, reset } from './scratch.ts';
export { type Author, type Credit, CREDIT_MEASURE, creditRoll } from './credits.ts';
export { type WriteOptions, measure, write } from './type.ts';
export { probeFace, probePlate, probesFaces, probesHands, unprobed } from './probe.ts';
export {
  CLOSE_LINE,
  CLOSE_SPAN,
  type Gesture,
  type Grip,
  type HandBody,
  type HandRoot,
  type HandStyle,
  breathOf,
  closeHand,
  floatingHand,
  handAt,
} from './hand.ts';
export {
  type Camera,
  camera,
  driftHeld,
  inset,
  knobCamera,
  multiplane,
  type Plane,
  planePoint,
  pushInto,
  pushOn,
  shotPath,
  UNMOVED,
} from './camera.ts';
export { scenesOf } from './scenes.ts';
export { type Film, type Frame, type Light, type SceneSpec, createFilm, drawing } from './film.ts';
export { shortPages } from './short.ts';

export {
  type Figure,
  type FigureArm,
  type FigureFace,
  type FigureGrip,
  type FigureHead,
  type FigureLight,
  type FigureMark,
  type FigurePt,
  type CrowdSpec,
  figure,
  figurePoint,
  crowd,
} from './figure.ts';
export { type BuildLight, type Opening, type House, type Column, house, column } from './build.ts';
