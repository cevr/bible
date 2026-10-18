// `@bible/film/style/rig`: how the house draws a film's figures, as its
// `figures.ts` lays them in one file (RBF's `rigs/`): a composed figure by
// `drawFigure`, and every circle hand by `drawHand` on its own artboard
// (`HAND_ART`), each on an artboard of the house's (`figure`) in its line
// (`DIRECTION`), printed as RML (`fragment`, numbered by `ids`); the outlines
// a composition cuts its parts from (`ellipse`, and `shapes.ts`
// `roundedPolygon` and `shifted`). The court set creases its pieces under the
// same light (`boxOf`, `creaseOf`).

export { DIRECTION } from '../house.ts';
export type { Crease } from '../paper.ts';
export { HAND_ART, drawFigure, drawHand } from './draw.ts';
export { boxOf, creaseOf, ellipse, figure } from './parts.ts';
export { fragment, ids } from './rml.ts';
export { roundedPolygon, shifted } from './shapes.ts';
