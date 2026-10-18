// `@bible/film/style`: the house look, as a film reads it. A scene acts a face
// (`acted` from `EASE` toward an `Expression`), runs the paper's boil
// (`boilTime`), traces a tunic as the house cuts it (`tunicOutline`), reaches
// a hand about a point (`reachAbout`), eases
// (`smooth`), and shades a paper of its own under the house's key light
// (`keyLight`, `shading`, with `ramp` from `@bible/film/canvas`). A film's
// papers are checked as its module loads (`papers`; `rampedPaper` for one
// ramped from a base), laid on a piece by `looked`, rimmed `RIM` wide; a
// film's canvas people and page read the house's two papers (`peoplePaper`,
// `parchment`). A figure is composed of parts (`figure`: `Head`, `Hair`,
// `Ear`, `KitA`, `OpenMouth`, `Tunic`, `Robe`, `Bands`, `Stain`,
// `GivenRobe`, `StubLegs`, `Shoes`, `Hands`, `Stance`, `Stature`), each
// checked under the house's rules (`rules.ts`) as it is made; one the owner
// locked carries its lock (`lock.ts`). The rigs are drawn on
// `@bible/film/style/rig`, and built by `@bible/film/style/build`, which
// holds each locked figure's print to its lock (`unlocked`).

export { EASE, type Expression, acted } from './face.ts';
export { type ComposedFigure, figure } from './figure.ts';
export { RIM, keyLight, parchment, peoplePaper, shading } from './house.ts';
export { looked, papers, rampedPaper } from './paper.ts';
export { Robe, Tunic } from './parts/body.ts';
export { Ear } from './parts/ear.ts';
export { Shoes, StubLegs } from './parts/feet.ts';
export { Hair } from './parts/hair.ts';
export { Hands } from './parts/hands.ts';
export { Head } from './parts/head.ts';
export { KitA } from './parts/kit.ts';
export { OpenMouth } from './parts/mouth.ts';
export { Bands } from './parts/over.ts';
export { Stance } from './parts/stance.ts';
export { GivenRobe, Stain } from './parts/states.ts';
export { Stature } from './parts/stature.ts';
export { tunicOutline } from './rig/draw.ts';
export { type Pt, boilTime, reachAbout, smooth } from './rig/parts.ts';
