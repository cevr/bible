// `@bible/film/style`: the house look, as a film reads it. A scene acts a face
// (`acted` from `EASE` toward an `Expression`), runs the paper's boil
// (`boilTime`), reaches a hand about a point (`reachAbout`), eases
// (`smooth`), and shades a paper of its own under the house's key light
// (`keyLight`, `shading`, with `ramp` from `@bible/film/canvas`). A figure's
// papers are `Paper`s (`rampedPaper` for one ramped from a base), laid on a
// piece by `looked`, rimmed `RIM` wide; a film's canvas people and page read
// the house's two papers (`peoplePaper`, `parchment`). The rigs are written
// on `@bible/film/style/rig`, and built by `@bible/film/style/build`.

export { EASE, type Expression, acted } from './face.ts';
export { RIM, keyLight, parchment, peoplePaper, shading } from './house.ts';
export { type Paper, looked, rampedPaper } from './paper.ts';
export { type Pt, boilTime, reachAbout, smooth } from './rig/parts.ts';
