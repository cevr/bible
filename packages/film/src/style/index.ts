// `@bible/film/style`: the house look, as a film reads it. A scene acts a face
// (`acted` from `EASE` toward an `Expression`), runs the paper's boil
// (`boilTime`), traces a tunic as the house cuts it (`tunicOutline`), reaches
// a hand about a point (`reachAbout`), eases
// (`smooth`), and shades a paper of its own under the house's key light
// (`keyLight`, `shading`, with `ramp` from `@bible/film/canvas`); a set
// creases its pieces under the same light (`boxOf`, `creaseOf`). A film's
// papers are checked as its module loads (`papers`; `rampedPaper` for one
// ramped from a base; a turn's `Crease`), rimmed `RIM` wide; a film's canvas
// people and page read the house's two papers (`peoplePaper`, `parchment`).
// A figure is composed of parts (`figure`: `Head`, `Beard`, `Hair`,
// `Headcloth`, `Ear`, `KitA`, `OpenMouth`, `Tunic`, `Robe`, `Arm`, `Bands`,
// `Stain`, `GivenRobe`, `StubLegs`, `Shoes`, `Sandals`, `Hands`, `Stance`,
// `Stature`;
// `tracedKit` places Kit A by marks traced in a concept), cut from outlines
// the house makes too (`ellipse`, `roundedPolygon`, `shifted`), each checked
// under the house's rules (`rules.ts`) as it is made; one the owner locked
// carries its lock (`lock.ts`). A film lays its figures in one file
// (`figuresFile`), and the house prints it (`figuresRml`), each locked
// figure's print alone (`lockedPrints`) and every override its figures
// carry, whatever rule it frees (`figureOverrides`), each saying what it
// cites (`citedBy`: the owner's words or his pick on an ask); a circle
// hand's artboard is `HAND_ART` times its size. `@bible/film/style/build`
// builds the file, holding each override's citation to the owner's word on
// his production's ledger (`unsaid`) and each locked figure's print to its
// lock (`unlocked`).

export { EASE, type Expression, acted } from './face.ts';
export { figure } from './figure.ts';
export { figureOverrides, figuresFile, figuresRml, lockedPrints } from './figures-file.ts';
export { RIM, keyLight, parchment, peoplePaper, shading } from './house.ts';
export { citedBy } from './override.ts';
export { type Crease, papers, rampedPaper } from './paper.ts';
export { Arm } from './parts/arm.ts';
export { Beard } from './parts/beard.ts';
export { Robe, Tunic } from './parts/body.ts';
export { Ear } from './parts/ear.ts';
export { Sandals, Shoes, StubLegs } from './parts/feet.ts';
export { Hair } from './parts/hair.ts';
export { Hands } from './parts/hands.ts';
export { Headcloth } from './parts/headcloth.ts';
export { Head } from './parts/head.ts';
export { KitA, tracedKit } from './parts/kit.ts';
export { OpenMouth } from './parts/mouth.ts';
export { Bands } from './parts/over.ts';
export { Stance } from './parts/stance.ts';
export { GivenRobe, Stain } from './parts/states.ts';
export { Stature } from './parts/stature.ts';
export { HAND_ART, tunicOutline } from './rig/draw.ts';
export { type Pt, boilTime, boxOf, creaseOf, ellipse, reachAbout, smooth } from './rig/parts.ts';
export { roundedPolygon, shifted } from './rig/shapes.ts';
