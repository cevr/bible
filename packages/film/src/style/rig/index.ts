// `@bible/film/style/rig`: the generator's parts a film's rigs are written
// with (RBF's `rigs/`): a figure's artboard, its pieces and silhouettes in
// the house's line (`DIRECTION`), the face kit, its timelines, and the RML
// they print; the outlines its pieces are cut from and how a paper tucks
// under the papers over it (`shapes.ts`). A composed figure is drawn by
// `drawFigure`, and every circle hand by `drawHand` on its own artboard
// (`HAND_ART`). The court set creases its pieces under the same light
// (`boxOf`, `creaseOf`).

export { DIRECTION } from '../house.ts';
export type { Crease } from '../paper.ts';
export { HAND_ART, drawFigure, drawHand } from './draw.ts';
export {
  FACE,
  type Figure,
  type PieceLook,
  artboard,
  boilTimeline,
  boxOf,
  creaseOf,
  ellipse,
  faceKit,
  figure,
  gazeTarget,
  piece,
  silhouette,
  timeline,
} from './parts.ts';
export { el, fragment, ids } from './rml.ts';
export { roundedPolygon, shifted, tucked, tuckedRimmed } from './shapes.ts';
