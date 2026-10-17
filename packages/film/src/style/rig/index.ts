// `@bible/film/style/rig`: the generator's parts a film's rigs are written
// with (RBF's `rigs/`): a figure's artboard, its pieces and silhouettes in
// the house's line (`DIRECTION`), the face kit, the circle hand, its
// timelines, and the RML they print. The court set creases its pieces under
// the same light (`boxOf`, `creaseOf`).

export { DIRECTION } from '../house.ts';
export {
  type Crease,
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
  hand,
  piece,
  silhouette,
  timeline,
} from './parts.ts';
export { el, fragment, ids } from './rml.ts';
